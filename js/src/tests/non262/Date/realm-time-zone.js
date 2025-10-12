// |reftest| skip-if(!this.hasOwnProperty('Intl')||!xulRuntime.shell)

// Don't run in browser because `SpecialPowers.Cu.getJSTestingFunctions()` doesn't
// appear to be able to change time zone in other Realms.

const nsPerMinute = 60 * 1000 * 1000 * 1000;

// Default time zone for jstests is PST8PDT.
const defaultTimeZone = "PST8PDT";

function test(timeZone) {
  // The time zone of the initial global is correct.
  assertEq(getRealmTimeZone(), defaultTimeZone);

  // Create a new global with a different time zone.
  var g = newGlobal({timeZone});

  var initialTimeZone = timeZone ?? defaultTimeZone;

  // Ensure the new global has the expected time zone.
  assertEq(g.getRealmTimeZone(), initialTimeZone);

  // Create a Date object in the new global.
  var d = new g.Date();

  // Call getTimeZoneOffset to fill the local date-time slots in |d|.
  assertEq(
    d.getTimezoneOffset() * nsPerMinute,
    -d.toTemporalInstant().toZonedDateTimeISO(initialTimeZone).offsetNanoseconds
  );

  // Change the time zone of the new global.
  g.setRealmTimeZone("Asia/Tokyo");

  // Ensure the new global has the expected time zone.
  assertEq(g.getRealmTimeZone(), "Asia/Tokyo");

  // The time zone of the initial global hasn't changed.
  assertEq(getRealmTimeZone(), defaultTimeZone);

  // Ensure the local date-time slots in |d| don't return stale values.
  assertEq(
    d.getTimezoneOffset() * nsPerMinute,
    -d.toTemporalInstant().toZonedDateTimeISO("Asia/Tokyo").offsetNanoseconds
  );

  // Change the time zone of the new global to use the default time zone.
  g.setRealmTimeZone(undefined);

  // Ensure the new global has the expected time zone.
  assertEq(g.getRealmTimeZone(), defaultTimeZone);

  // Ensure the local date-time slots in |d| don't return stale values.
  assertEq(
    d.getTimezoneOffset() * nsPerMinute,
    -d.toTemporalInstant().toZonedDateTimeISO(defaultTimeZone).offsetNanoseconds
  );
}

test();
test("Europe/London");

if (typeof reportCompare === "function")
  reportCompare(true, true);
