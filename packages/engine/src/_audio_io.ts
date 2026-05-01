// WAV file parser — mirrors aura-x-engine/_audio_io.py
// Supports PCM 16/24/32-bit and IEEE float 32-bit. Multi-channel → mono downmix.

export interface WavData {
  samples:     number[];
  sampleRate:  number;
  durationSec: number;
  channels:    number;
}

export function parseWavMono(buffer: Buffer): WavData {
  if (buffer.length < 44) throw new Error("File too small to be a valid WAV");

  if (
    buffer.slice(0, 4).toString("ascii") !== "RIFF" ||
    buffer.slice(8, 12).toString("ascii") !== "WAVE"
  ) {
    throw new Error("Not a valid WAV file (missing RIFF/WAVE header)");
  }

  let offset = 12;
  let audioFormat = 1, channels = 1, sampleRate = 44100, bitsPerSample = 16;
  let dataOffset = -1, dataSize = 0;

  // Scan chunks (fmt, data, LIST, etc.)
  while (offset + 8 <= buffer.length) {
    const chunkId   = buffer.slice(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      audioFormat   = buffer.readUInt16LE(offset + 8);
      channels      = buffer.readUInt16LE(offset + 10);
      sampleRate    = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize   = chunkSize;
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2 !== 0 ? 1 : 0); // RIFF word-alignment
  }

  if (dataOffset < 0) throw new Error("No data chunk found in WAV file");

  const bytesPerSample = bitsPerSample / 8;
  const bytesPerFrame  = bytesPerSample * channels;
  const totalSamples   = Math.floor(dataSize / bytesPerFrame);
  const samples: number[] = new Array(totalSamples);
  const scale = bitsPerSample < 32 ? 1 / (2 ** (bitsPerSample - 1)) : 1;

  for (let i = 0; i < totalSamples; i++) {
    const base = dataOffset + i * bytesPerFrame;
    let monoSum = 0;

    for (let ch = 0; ch < channels; ch++) {
      const pos = base + ch * bytesPerSample;
      let s = 0;

      if (audioFormat === 3 && bitsPerSample === 32) {
        s = buffer.readFloatLE(pos);
      } else if (bitsPerSample === 16) {
        s = buffer.readInt16LE(pos) * scale;
      } else if (bitsPerSample === 24) {
        const b0 = buffer[pos], b1 = buffer[pos + 1], b2 = buffer[pos + 2];
        let v = (b2 << 16) | (b1 << 8) | b0;
        if (v & 0x800000) v -= 0x1000000;
        s = v / 0x800000;
      } else if (bitsPerSample === 32) {
        s = buffer.readInt32LE(pos) * scale;
      }

      monoSum += s;
    }

    samples[i] = monoSum / channels;
  }

  return { samples, sampleRate, durationSec: totalSamples / sampleRate, channels };
}
