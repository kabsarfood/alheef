/**
 * Generates a short professional notification bell WAV (~1.2s).
 * node scripts/generate-admin-notification-sound.js
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const DURATION = 1.15;

function tone(freq, startSec, durSec, peak = 0.55) {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-4.2 * t) * (1 - Math.exp(-30 * t));
    const partial = Math.sin(2 * Math.PI * freq * t)
      + 0.35 * Math.sin(2 * Math.PI * freq * 2.01 * t)
      + 0.15 * Math.sin(2 * Math.PI * freq * 3.02 * t);
    out[i] = partial * env * peak;
  }
  return { start, samples: out };
}

function mixTracks(tracks) {
  const total = Math.floor(DURATION * SAMPLE_RATE);
  const buffer = new Float32Array(total);
  tracks.forEach(({ start, samples }) => {
    for (let i = 0; i < samples.length; i += 1) {
      const idx = start + i;
      if (idx < total) buffer[idx] += samples[i];
    }
  });
  let max = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    max = Math.max(max, Math.abs(buffer[i]));
  }
  const gain = max > 0 ? 0.92 / max : 1;
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] *= gain;
  }
  return buffer;
}

function encodeWav(floatSamples) {
  const numSamples = floatSamples.length;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i += 1) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

const tracks = [
  tone(880, 0, 0.55, 0.5),
  tone(1174.66, 0.08, 0.62, 0.42),
  tone(1318.51, 0.18, 0.75, 0.28),
];

const mixed = mixTracks(tracks);
const wav = encodeWav(mixed);
const outDir = path.join(__dirname, '..', 'public', 'sounds');
fs.mkdirSync(outDir, { recursive: true });
const wavPath = path.join(outDir, 'admin-notification.wav');
fs.writeFileSync(wavPath, wav);
console.log('Wrote', wavPath, `(${wav.length} bytes, ${DURATION}s)`);
