// Copyright (C) 2021 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-dataview.prototype.getint32
description: Throws a TypeError if buffer is out-of-bounds
features: [DataView, ArrayBuffer, resizable-arraybuffer]
---*/

assert.sameValue(
  typeof ArrayBuffer.prototype.resize,
  'function',
  'implements ArrayBuffer.prototype.resize'
);

var buffer = new ArrayBuffer(24, {maxByteLength: 32});
var sample = new DataView(buffer, 0, 16);

try {
  buffer.resize(32);
} catch (_) {}

assert.sameValue(sample.getInt32(0), 0, 'following grow');

try {
  buffer.resize(16);
} catch (_) {}

assert.sameValue(sample.getInt32(0), 0, 'following shrink (within bounds)');

var expectedError;
try {
  buffer.resize(8);
  expectedError = TypeError;
} catch (_) {
  expectedError = Test262Error;
}

assert.throws(expectedError, function() {
  sample.getInt32(0);
  throw new Test262Error('the operation completed successfully');
});

reportCompare(0, 0);
