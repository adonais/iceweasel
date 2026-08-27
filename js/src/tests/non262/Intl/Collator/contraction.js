/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// https://bugzilla.mozilla.org/show_bug.cgi?id=2059047

let collator = new Intl.Collator("my");
assertEq(
  collator.compare(
    "",
    "\u102d\u102f\u1037"),
  -1);

if (typeof reportCompare === "function")
  reportCompare(0, 0, "ok");
