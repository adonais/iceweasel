// Test helpers for constructing H.264 bitstream pieces and inspecting or
// rewriting fragmented-MP4 init segments. The current set covers:
//   - a minimal SPS NAL builder (BitWriter / escapeEmulationBytes / buildSPSNALU),
//   - generic MP4 box navigation (findBox / enclosingBoxes / splice),
//   - splicing a replacement SPS into an init segment's avcC box
//     (spliceSPSIntoInitSegment),
//   - reading the track display dimensions from tkhd (parseDisplayDimensions).
//
// One use today is crafting an init segment whose SPS carries arbitrary
// pic_width_in_mbs_minus1 / pic_height_in_map_units_minus1 values (to exercise
// the parser's dimension handling) while keeping the rest of the container
// intact, but the pieces are deliberately independent so further H.264 / MP4
// test utilities (other NAL types, PPS rewriting, more box fields, etc.) can be
// added here as needed.

// Minimal bitstream writer for Exp-Golomb (ue) and fixed-width fields.
class BitWriter {
  constructor() {
    this.bytes = [];
    this.cur = 0;
    this.bits = 0;
  }
  writeBit(b) {
    this.cur = (this.cur << 1) | (b ? 1 : 0);
    if (++this.bits === 8) {
      this.bytes.push(this.cur & 0xff);
      this.cur = 0;
      this.bits = 0;
    }
  }
  writeBits(value, n) {
    const v = BigInt.asUintN(64, BigInt(value));
    for (let i = n - 1; i >= 0; i--) {
      this.writeBit(Number((v >> BigInt(i)) & 1n));
    }
  }
  writeUE(v) {
    const value = BigInt(v) + 1n;
    let leading = 0;
    let t = value;
    while (t > 1n) {
      t >>= 1n;
      leading++;
    }
    for (let i = 0; i < leading; i++) {
      this.writeBit(0);
    }
    this.writeBit(1);
    for (let i = leading - 1; i >= 0; i--) {
      this.writeBit(Number((value >> BigInt(i)) & 1n));
    }
  }
  closeWithRbspTrailing() {
    this.writeBit(1);
    while (this.bits !== 0) {
      this.writeBit(0);
    }
  }
  u8() {
    return new Uint8Array(this.bytes);
  }
}

// Insert H.264 emulation-prevention bytes (00 00 0x -> 00 00 03 0x).
function escapeEmulationBytes(rbsp) {
  const out = [];
  for (let i = 0; i < rbsp.length; i++) {
    const v = rbsp[i];
    if (
      out.length >= 2 &&
      v <= 0x03 &&
      out[out.length - 2] === 0 &&
      out[out.length - 1] === 0
    ) {
      out.push(0x03);
    }
    out.push(v);
  }
  return new Uint8Array(out);
}

// Build a minimal, syntactically valid Constrained Baseline SPS NAL unit with
// the caller-supplied picture dimensions (in macroblock / map-unit units, minus
// one, per the spec). The other fields are fixed to the simplest legal values:
// no cropping, frame_mbs_only, no VUI.
function buildSPSNALU(picWidthInMbsMinus1, picHeightInMapUnitsMinus1) {
  const bw = new BitWriter();
  // NAL header: forbidden_zero=0, nal_ref_idc=3, nal_unit_type=7 (SPS).
  bw.writeBits((0 << 7) | (3 << 5) | 7, 8);
  bw.writeBits(0x42, 8); // profile_idc = Constrained Baseline
  bw.writeBits(0x00, 8); // constraint_setN_flags + reserved
  bw.writeBits(0x0a, 8); // level_idc = 1
  bw.writeUE(0); // seq_parameter_set_id
  bw.writeUE(0); // log2_max_frame_num_minus4
  bw.writeUE(2); // pic_order_cnt_type = 2
  bw.writeUE(1); // max_num_ref_frames
  bw.writeBit(0); // gaps_in_frame_num_value_allowed_flag
  bw.writeUE(picWidthInMbsMinus1);
  bw.writeUE(picHeightInMapUnitsMinus1);
  bw.writeBit(1); // frame_mbs_only_flag
  bw.writeBit(0); // direct_8x8_inference_flag
  bw.writeBit(0); // frame_cropping_flag
  bw.writeBit(0); // vui_parameters_present_flag
  bw.closeWithRbspTrailing();
  return escapeEmulationBytes(bw.u8());
}

function readU32BE(buf, off) {
  return (
    ((buf[off] << 24) >>> 0) |
    (buf[off + 1] << 16) |
    (buf[off + 2] << 8) |
    buf[off + 3]
  );
}

function writeU32BE(buf, off, value) {
  buf[off] = (value >>> 24) & 0xff;
  buf[off + 1] = (value >>> 16) & 0xff;
  buf[off + 2] = (value >>> 8) & 0xff;
  buf[off + 3] = value & 0xff;
}

// Find the first occurrence of an MP4 box with the given 4-char type tag.
// Returns the offset of the 4-byte size header preceding the type, or -1.
function findBox(buf, tag) {
  for (let i = 0; i + 8 <= buf.length; i++) {
    if (
      buf[i + 4] === tag.charCodeAt(0) &&
      buf[i + 5] === tag.charCodeAt(1) &&
      buf[i + 6] === tag.charCodeAt(2) &&
      buf[i + 7] === tag.charCodeAt(3)
    ) {
      const size = readU32BE(buf, i);
      if (size >= 8 && i + size <= buf.length) {
        return i;
      }
    }
  }
  return -1;
}

// List every box whose payload range contains `target`. Returns array of
// {offset, tag, size} entries, outermost first.
function enclosingBoxes(buf, target) {
  const out = [];
  let pos = 0;
  while (pos + 8 <= buf.length) {
    const size = readU32BE(buf, pos);
    if (size < 8 || pos + size > buf.length) {
      break;
    }
    const tag = String.fromCharCode(
      buf[pos + 4],
      buf[pos + 5],
      buf[pos + 6],
      buf[pos + 7]
    );
    if (target >= pos + 8 && target < pos + size) {
      out.push({ offset: pos, tag, size });
      // recurse into this container box
      pos += 8;
      // skip per-box version/flags for stsd which has an extra 8-byte header
      if (tag === "stsd") {
        pos += 8;
      }
      // skip the avc1 sample entry's fixed 78-byte payload before nested boxes
      else if (tag === "avc1") {
        pos += 78;
      }
    } else {
      pos += size;
    }
  }
  return out;
}

// Splice `replacement` into `buf` at [start, start+removeLength), returning a
// new Uint8Array.
function splice(buf, start, removeLength, replacement) {
  const out = new Uint8Array(buf.length - removeLength + replacement.length);
  out.set(buf.subarray(0, start), 0);
  out.set(replacement, start);
  out.set(buf.subarray(start + removeLength), start + replacement.length);
  return out;
}

// Given an init segment and an SPS NALU body, rebuild the avcC box with the new
// SPS (keeping the original PPS) and patch every enclosing box size so the
// resulting init segment stays self-consistent. Returns a new Uint8Array.
function spliceSPSIntoInitSegment(initSegment, spsNalu) {
  let buf = new Uint8Array(initSegment);
  const avccOffset = findBox(buf, "avcC");
  is(avccOffset >= 0, true, "avcC box found");
  const avccSize = readU32BE(buf, avccOffset);
  const bodyStart = avccOffset + 8;

  // Parse avcC body: 1+1+1+1+1 fixed, then numOfSPS (3 reserved bits + 5),
  // SPS entries (each prefixed by u16 length), numOfPPS, PPS entries.
  let p = bodyStart;
  const configurationVersion = buf[p++];
  const profileIndication = buf[p++];
  const profileCompatibility = buf[p++];
  const levelIndication = buf[p++];
  const lengthSizeFlag = buf[p++];
  const numSPSByte = buf[p++];
  const numSPS = numSPSByte & 0x1f;
  is(numSPS >= 1, true, "init segment has at least one SPS");
  // Skip first SPS to find PPS section.
  const firstSpsLength = (buf[p] << 8) | buf[p + 1];
  p += 2 + firstSpsLength;
  // Skip any additional SPSs (rare).
  for (let i = 1; i < numSPS; i++) {
    const len = (buf[p] << 8) | buf[p + 1];
    p += 2 + len;
  }
  // PPS section.
  const numPPS = buf[p++];
  const ppsEntries = [];
  for (let i = 0; i < numPPS; i++) {
    const len = (buf[p] << 8) | buf[p + 1];
    ppsEntries.push(buf.subarray(p + 2, p + 2 + len));
    p += 2 + len;
  }

  // Build the new avcC body: keep header bytes, replace SPS, keep PPS.
  const ppsBytes = ppsEntries.reduce((acc, e) => {
    return new Uint8Array([
      ...acc,
      (e.length >> 8) & 0xff,
      e.length & 0xff,
      ...e,
    ]);
  }, new Uint8Array());
  const spsBytes = new Uint8Array([
    (spsNalu.length >> 8) & 0xff,
    spsNalu.length & 0xff,
    ...spsNalu,
  ]);
  const newBody = new Uint8Array([
    configurationVersion,
    profileIndication,
    profileCompatibility,
    levelIndication,
    lengthSizeFlag,
    0xe0 | 1, // 3 reserved bits + numOfSequenceParameterSets = 1
    ...spsBytes,
    numPPS,
    ...ppsBytes,
  ]);
  const newAvccSize = 8 + newBody.length;

  // Build the new avcC box (size + tag + body).
  const newAvccBox = new Uint8Array(newAvccSize);
  writeU32BE(newAvccBox, 0, newAvccSize);
  newAvccBox[4] = 0x61; // 'a'
  newAvccBox[5] = 0x76; // 'v'
  newAvccBox[6] = 0x63; // 'c'
  newAvccBox[7] = 0x43; // 'C'
  newAvccBox.set(newBody, 8);

  // Find every enclosing box and capture sizes BEFORE splicing.
  const enclosing = enclosingBoxes(buf, avccOffset);
  const delta = newAvccSize - avccSize;
  // Splice avcC.
  buf = splice(buf, avccOffset, avccSize, newAvccBox);
  // Update each enclosing box's size by delta.
  for (const box of enclosing) {
    writeU32BE(buf, box.offset, box.size + delta);
  }
  return buf;
}

// Read the track's display dimensions from the tkhd box of an init segment.
// width/height are the last two 32-bit fields of tkhd, stored as 16.16
// fixed-point (ISO/IEC 14496-12); the integer part is the display size.
// Returns {width, height}.
function parseDisplayDimensions(initSegment) {
  const buf = new Uint8Array(initSegment);
  const tkhdOffset = findBox(buf, "tkhd");
  is(tkhdOffset >= 0, true, "tkhd box found");
  const tkhdSize = readU32BE(buf, tkhdOffset);
  return {
    width: readU32BE(buf, tkhdOffset + tkhdSize - 8) >>> 16,
    height: readU32BE(buf, tkhdOffset + tkhdSize - 4) >>> 16,
  };
}
