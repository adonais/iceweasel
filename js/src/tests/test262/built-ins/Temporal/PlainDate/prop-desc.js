// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2021 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.plaindate
description: The "PlainDate" property of Temporal
includes: [propertyHelper.js]
features: [Temporal]
---*/

assert.sameValue(
  typeof Temporal.PlainDate,
  "function",
  "`typeof PlainDate` is `function`"
);

verifyProperty(Temporal, "PlainDate", {
  writable: true,
  enumerable: false,
  configurable: true,
});

reportCompare(0, 0);
