/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

let collator = new Intl.Collator("en", { numeric: true });

assertDeepEq(['599', '600', '599B', '59A', '599A', '333A'].sort(collator.compare),
             ['59A', '333A', '599', '599A', '599B', '600']);
assertDeepEq(['899', '900', '8A'].sort(collator.compare),
             ['8A', '899', '900']);
assertDeepEq(['1662', '16A', '1660', '1600'].sort(collator.compare),
             ['16A', '1600', '1660', '1662']);

if (typeof reportCompare === "function")
  reportCompare(0, 0, "ok");
