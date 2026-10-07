/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var collator = new Intl.Collator("en", { numeric: true });

assertEq(collator.compare("0가", "0가1"), -1);
assertEq(collator.compare("0가1", "0가"), 1);
assertEq(collator.compare("0가", "0가a"), -1);
assertEq(collator.compare("0가a", "0가"), 1);
assertEq(collator.compare("0각", "0각1"), -1);
assertEq(collator.compare("0각1", "0각"), 1);
assertEq(collator.compare("0각", "0각a"), -1);
assertEq(collator.compare("0각a", "0각"), 1);

assertEq(collator.compare("2가", "2가1"), -1);
assertEq(collator.compare("2가1", "2가"), 1);
assertEq(collator.compare("2가", "2가a"), -1);
assertEq(collator.compare("2가a", "2가"), 1);
assertEq(collator.compare("2각", "2각1"), -1);
assertEq(collator.compare("2각1", "2각"), 1);
assertEq(collator.compare("2각", "2각a"), -1);
assertEq(collator.compare("2각a", "2각"), 1);

if (typeof reportCompare === "function")
  reportCompare(0, 0, "ok");
