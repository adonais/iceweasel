// Shared crashtest helper: build a PCM WAV file as an ArrayBuffer.
function buildWav(channels, rate, seconds) {
  const PCM_FORMAT = 1;                          // WAVE_FORMAT_PCM
  const BYTES_PER_SAMPLE = 2;                    // 16-bit samples
  const BITS_PER_SAMPLE = 8 * BYTES_PER_SAMPLE;
  const FMT_CHUNK_BYTES = 16;                    // size of a PCM "fmt " chunk body
  const HEADER_BYTES = 44;                       // canonical PCM WAV header length
  const RIFF_FIELDS_BEFORE_SIZE = 8;             // "RIFF" + the size field itself

  const blockAlign = channels * BYTES_PER_SAMPLE;
  const byteRate = rate * blockAlign;
  const frames = Math.floor(rate * seconds);
  const dataSize = frames * blockAlign;

  const buf = new ArrayBuffer(HEADER_BYTES + dataSize);
  const v = new DataView(buf);

  // Sequential writer so the header reads top-to-bottom instead of by offset.
  let pos = 0;
  const tag = s => { for (let i = 0; i < s.length; i++) v.setUint8(pos++, s.charCodeAt(i)); };
  const u16 = n => { v.setUint16(pos, n, true); pos += 2; };
  const u32 = n => { v.setUint32(pos, n, true); pos += 4; };
  const s16 = n => { v.setInt16(pos, n, true); pos += 2; };

  // RIFF chunk descriptor.
  tag("RIFF");
  u32(HEADER_BYTES - RIFF_FIELDS_BEFORE_SIZE + dataSize); // bytes after this field
  tag("WAVE");
  // "fmt " sub-chunk.
  tag("fmt ");
  u32(FMT_CHUNK_BYTES);
  u16(PCM_FORMAT);
  u16(channels);
  u32(rate);
  u32(byteRate);
  u16(blockAlign);
  u16(BITS_PER_SAMPLE);
  // "data" sub-chunk.
  tag("data");
  u32(dataSize);

  // Interleaved 16-bit PCM: a quiet sine, identical across every channel.
  const AMPLITUDE = 12000;
  const SINE_STEP = 0.05;
  for (let f = 0; f < frames; f++) {
    const sample = Math.round(Math.sin(f * SINE_STEP) * AMPLITUDE);
    for (let c = 0; c < channels; c++) { s16(sample); }
  }
  return buf;
}
