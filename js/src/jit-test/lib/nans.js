const NaNs = {
  Float16: [
    0x7C01, // smallest SNaN
    0x7DFF, // largest SNaN
    0x7E01, // smallest QNaN
    0x7FFF, // largest QNaN
    0xFC01, // smallest SNaN, sign-bit set
    0xFDFF, // largest SNaN, sign-bit set
    0xFE01, // smallest QNaN, sign-bit set
    0xFFFF, // largest QNaN, sign-bit set
  ],
  Float32: [
    [0x7F80_0001], // smallest SNaN
    [0x7FBF_FFFF], // largest SNaN
    [0x7FC0_0000], // smallest QNaN
    [0x7FFF_FFFF], // largest QNaN
    [0xFF80_0001], // smallest SNaN, sign-bit set
    [0xFFBF_FFFF], // largest SNaN, sign-bit set
    [0xFFC0_0000], // smallest QNaN, sign-bit set
    [0xFFFF_FFFF], // largest QNaN, sign-bit set
  ],
  Float64: [
    [0x7FF0_0000_0000_0001n], // smallest SNaN
    [0x7FF7_FFFF_FFFF_FFFFn], // largest SNaN
    [0x7FF8_0000_0000_0000n], // smallest QNaN
    [0x7FFF_FFFF_FFFF_FFFFn], // largest QNaN
    [0xFFF0_0000_0000_0001n], // smallest SNaN, sign-bit set
    [0xFFF7_FFFF_FFFF_FFFFn], // largest SNaN, sign-bit set
    [0xFFF8_0000_0000_0000n], // smallest QNaN, sign-bit set
    [0xFFFF_FFFF_FFFF_FFFFn], // largest QNaN, sign-bit set

    [valueAsRawBits(undefined)],
    [valueAsRawBits(null)],
    [valueAsRawBits(123456)],
  ],
};

function assertSameNaNPayload(FloatArray, input, output, message = "") {
  if (message) {
    message += ": ";
  }

  let exponentWidth;
  let significandWidth;
  switch (FloatArray.BYTES_PER_ELEMENT) {
    case 8:
      exponentWidth = 11n;
      significandWidth = 52n;
      break;
    case 4:
      exponentWidth = 8n;
      significandWidth = 23n;
      break;
    case 2:
      exponentWidth = 5n;
      significandWidth = 10n;
      break;
    default:
      throw "bad typed array";
  }

  // The exponent bits in the floating point representation.
  const exponentBits = ((1n << exponentWidth) - 1n) << significandWidth;

  // The significand bits in the floating point representation.
  const significandBits = (1n << significandWidth) - 1n;

  // Assert `input` is a NaN value.
  assertEq(
    BigInt(input) & exponentBits,
    exponentBits,
    message + "all exponent bits must be set"
  );
  assertEq(
    (BigInt(input) & significandBits) !== 0n,
    true,
    message + "significand must be non-zero"
  );

  // Assert `output` is a NaN value.
  assertEq(
    BigInt(output) & exponentBits,
    exponentBits,
    message + "all exponent bits must be set"
  );
  assertEq(
    (BigInt(output) & significandBits) !== 0n,
    true,
    message + "significand must be non-zero"
  );

  // Extract payload and mask off the quiet NaN bit.
  let inputPayload = BigInt(input) & (significandBits >> 1n);
  let outputPayload = BigInt(output) & (significandBits >> 1n);

  // If the output has a NaN payload, then the input must have a payload, too.
  if (outputPayload) {
    assertEq(
      outputPayload,
      inputPayload,
      `${message}${outputPayload.toString(16)} != ${inputPayload.toString(16)}`
    );
  }
}

function testWithFloatTypedArrays(f, ...args) {
  function testWith(FloatArray, UintArray, NaNs) {
    // Create a copy to avoid type pollution.
    var clone = Function(`return ${f}`)();

    clone(FloatArray, UintArray, NaNs, ...args);
  }

  testWith(Float64Array, BigUint64Array, NaNs.Float64);
  testWith(Float32Array, Uint32Array, NaNs.Float32);
  testWith(Float16Array, Uint16Array, NaNs.Float16);
}
