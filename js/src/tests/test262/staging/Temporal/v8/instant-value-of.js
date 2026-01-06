// |reftest| skip-if(!this.hasOwnProperty('Temporal')) -- Temporal is not enabled unconditionally
// Copyright 2021 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: pending
description: >
  Automatically ported from instant-valueOf test
  in V8's mjsunit test instant-valueOf.js
features: [Temporal]
---*/

let d1 = Temporal.Now.instant();
assert.throws(TypeError, () => d1.valueOf());

reportCompare(0, 0);
