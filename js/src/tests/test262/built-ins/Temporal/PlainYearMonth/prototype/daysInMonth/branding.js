// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2021 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-get-temporal.plainyearmonth.prototype.daysinmonth
description: Throw a TypeError if the receiver is invalid
features: [Symbol, Temporal]
---*/

const daysInMonth = Object.getOwnPropertyDescriptor(Temporal.PlainYearMonth.prototype, "daysInMonth").get;

assert.sameValue(typeof daysInMonth, "function");

assert.throws(TypeError, () => daysInMonth.call(undefined), "undefined");
assert.throws(TypeError, () => daysInMonth.call(null), "null");
assert.throws(TypeError, () => daysInMonth.call(true), "true");
assert.throws(TypeError, () => daysInMonth.call(""), "empty string");
assert.throws(TypeError, () => daysInMonth.call(Symbol()), "symbol");
assert.throws(TypeError, () => daysInMonth.call(1), "1");
assert.throws(TypeError, () => daysInMonth.call({}), "plain object");
assert.throws(TypeError, () => daysInMonth.call(Temporal.PlainYearMonth), "Temporal.PlainYearMonth");
assert.throws(TypeError, () => daysInMonth.call(Temporal.PlainYearMonth.prototype), "Temporal.PlainYearMonth.prototype");

reportCompare(0, 0);
