const tests = [
  // Inline buffer.
  {
    byteLength: 0,
    maxByteLength: 32,
  },
  {
    byteLength: 16,
    maxByteLength: 32,
  },
  {
    byteLength: 32,
    maxByteLength: 32,
  },

  // Malloced buffer.
  {
    byteLength: 0,
    maxByteLength: 1024,
  },
  {
    byteLength: 16,
    maxByteLength: 1024,
  },
  {
    byteLength: 1024,
    maxByteLength: 1024,
  },
];

for (let {byteLength, maxByteLength} of tests) {
  let source = new ArrayBuffer(byteLength, {maxByteLength});

  // Fill with a non-zero value.
  new Uint8Array(source).fill(0xff);

  // transfer() zeroes all bytes.
  let target = source.transfer(0);

  // Resize to the maximum byte length.
  target.resize(maxByteLength);

  // Ensure all bytes are zero.
  let u8 = new Uint8Array(target);
  let index = u8.findIndex(v => v !== 0);
  assertEq(index, -1, `bad byte: ${u8[index]}`);
}
