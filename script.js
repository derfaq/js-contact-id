// Crear el AudioContext globalmente
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

// Mapeo de tonos DTMF según la especificación (incluye la "E")
const dtmfFrequencies = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "0": [941, 1336],
  "B": [941, 1209],
  "C": [941, 1477],
  "D": [697, 1633],
  "E": [770, 1633],
  "F": [852, 1633]
};

// Elementos de la interfaz
const logArea = document.getElementById('log');
const startButton = document.getElementById('startButton');
const btnMedica = document.getElementById('btnMedica');
const btnPolicial = document.getElementById('btnPolicial');

// Función para escribir en el log
function log(message) {
  logArea.value += message + "\n";
  logArea.scrollTop = logArea.scrollHeight;
}

// Función para reproducir un tono DTMF con duración personalizada (para número discado)
function playDTMFTone(frequencies, duration) {
  return new Promise((resolve) => {
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.1;
    gainNode.connect(audioCtx.destination);
    
    frequencies.forEach(freq => {
      const osc = audioCtx.createOscillator();
      osc.frequency.value = freq;
      osc.type = 'sine';
      osc.connect(gainNode);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    });
    setTimeout(resolve, duration * 1000);
  });
}

// Función para discar el número (tono de 150 ms por dígito y pausa de 100 ms)
async function dialNumber(number) {
  log(`Marcando número: ${number}`);
  for (let char of number) {
    let freqs = dtmfFrequencies[char];
    if (!freqs) {
      log(`Carácter desconocido en el número discado: ${char}`);
      continue;
    }
    await playDTMFTone(freqs, 0.15);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  log("Número discado completo.");
}

// Función para calcular el checksum del mensaje Contact‑ID
function calculateChecksum(message) {
  let sum = 0;
  for (let char of message) {
    let digit = parseInt(char, 16);
    if (digit === 0) digit = 10; // "0" cuenta como 10
    sum += digit;
  }
  let nextMultiple = Math.ceil(sum / 15) * 15;
  let checksumValue = nextMultiple - sum;
  return (checksumValue === 0) ? "F" : checksumValue.toString(16).toUpperCase();
}

// Función para generar un AudioBuffer con la secuencia DTMF del mensaje Contact‑ID
// Usaremos 50 ms para el tono y 50 ms de pausa para cada dígito
function generateDTMFBuffer(message, toneDuration, pauseDuration) {
  const sampleRate = audioCtx.sampleRate;
  const toneSamples = Math.floor(toneDuration * sampleRate);
  const pauseSamples = Math.floor(pauseDuration * sampleRate);
  const blockSamples = toneSamples + pauseSamples;
  const totalSamples = blockSamples * message.length;
  
  const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < message.length; i++) {
    const char = message[i].toUpperCase();
    const freqs = dtmfFrequencies[char];
    const startSample = i * blockSamples;
    if (!freqs) {
      // Carácter desconocido: deja silencio
      for (let j = 0; j < blockSamples; j++) {
        channelData[startSample + j] = 0;
      }
      continue;
    }
    // Generar 50 ms de tono (suma de dos senoidales)
    for (let j = 0; j < toneSamples; j++) {
      const t = j / sampleRate;
      const sampleValue = 0.5 * (Math.sin(2 * Math.PI * freqs[0] * t) + Math.sin(2 * Math.PI * freqs[1] * t));
      channelData[startSample + j] = sampleValue * 0.1;
    }
    // Rellenar 50 ms de pausa con silencio
    for (let j = toneSamples; j < blockSamples; j++) {
      channelData[startSample + j] = 0;
    }
  }
  return buffer;
}

// Función para enviar Contact‑ID:
// 1. Discar el número (con tonos de 150 ms)
// 2. Esperar 3.5 s
// 3. Generar y reproducir el mensaje Contact‑ID en un buffer (50 ms tono, 50 ms pausa)
async function sendContactID(account, dialed, zone, emergencyType) {
  const eventCode = (emergencyType === "medica") ? "100" : "120";
  const group = "01";
  // Se usa el input de zona (completado a 3 dígitos)
  const zoneFormatted = zone.padStart(3, '0');
  const messageWithoutChecksum = account + "18" + "1" + eventCode + group + zoneFormatted;
  const checksum = calculateChecksum(messageWithoutChecksum);
  const fullMessage = messageWithoutChecksum + checksum;
  
  log(`Generando mensaje Contact‑ID: ${fullMessage}`);
  
  // 1. Discar el número
  await dialNumber(dialed);
  
  // 2. Esperar 3.5 segundos antes de enviar el Contact‑ID
  log("Esperando 3.5 segundos antes de enviar Contact‑ID...");
  await new Promise(resolve => setTimeout(resolve, 3500));
  
  // 3. Generar el buffer de audio para el Contact‑ID
  const dtmfBuffer = generateDTMFBuffer(fullMessage, 0.05, 0.05);
  
  // 4. Reproducir el buffer completo
  const bufferSource = audioCtx.createBufferSource();
  bufferSource.buffer = dtmfBuffer;
  bufferSource.connect(audioCtx.destination);
  bufferSource.start();
  
  log("Transmisión Contact‑ID completada.");
}

// Botón para iniciar el AudioContext en respuesta a un gesto del usuario
startButton.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      log("AudioContext reanudado.");
    });
  }
});

// Eventos de botones para enviar emergencia
btnMedica.addEventListener('click', async () => {
  const account = document.getElementById('account').value;
  const dialed = document.getElementById('dialed').value;
  const zone = document.getElementById('zone').value;
  log("Enviando emergencia médica...");
  await sendContactID(account, dialed, zone, "medica");
});

btnPolicial.addEventListener('click', async () => {
  const account = document.getElementById('account').value;
  const dialed = document.getElementById('dialed').value;
  const zone = document.getElementById('zone').value;
  log("Enviando emergencia policial...");
  await sendContactID(account, dialed, zone, "policial");
});
