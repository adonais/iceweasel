/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// https://bugzilla.mozilla.org/show_bug.cgi?id=2042751

let collator = new Intl.Collator("en");
assertEq(
  collator.compare(
    "\u0F57\u0F4D\u0F73\u0F39\u0F9F\u0F75\u0F4B",
    "\u0F57\u0F4D\u0F73\u0F39\u0F9F\u0F75\u0F4B\u0F47\u0F0D\u0F73\u0F69\u0F8F"),
  -1);

if (typeof reportCompare === "function")
  reportCompare(0, 0, "ok");
