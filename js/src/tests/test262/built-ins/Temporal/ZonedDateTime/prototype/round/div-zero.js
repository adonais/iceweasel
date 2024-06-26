// |reftest| skip-if(!this.hasOwnProperty('Temporal')) -- Temporal is not enabled unconditionally
// Copyright (C) 2021 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.zoneddatetime.prototype.round
description: RangeError thrown if the calculated day length is zero
features: [Temporal]
---*/

class TimeZone extends Temporal.TimeZone {
  #calls = 0;
  getPossibleInstantsFor(dateTime) {
    if (++this.#calls === 2) {
      return super.getPossibleInstantsFor(dateTime.withCalendar("iso8601").subtract({ days: 1 }));
    }
    return super.getPossibleInstantsFor(dateTime);
  }
}

const zdt = new Temporal.ZonedDateTime(0n, new TimeZone("UTC"));

assert.throws(RangeError, () => zdt.round({ smallestUnit: "day" }), `zero day-length with smallestUnit 'day'`);

reportCompare(0, 0);
