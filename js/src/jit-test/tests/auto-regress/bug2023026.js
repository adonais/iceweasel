var epochNanoseconds = 1n << 64n;
assertEq(new Temporal.Instant(epochNanoseconds).epochNanoseconds, epochNanoseconds);
