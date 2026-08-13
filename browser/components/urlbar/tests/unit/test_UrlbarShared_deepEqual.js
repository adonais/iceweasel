/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests for UrlbarShared.deepEqual().

"use strict";

add_task(function test_primitives() {
  Assert.ok(UrlbarShared.deepEqual(1, 1));
  Assert.ok(UrlbarShared.deepEqual("a", "a"));
  Assert.ok(UrlbarShared.deepEqual(true, true));
  Assert.ok(UrlbarShared.deepEqual(null, null));
  Assert.ok(UrlbarShared.deepEqual(undefined, undefined));

  Assert.ok(!UrlbarShared.deepEqual(1, 2));
  Assert.ok(!UrlbarShared.deepEqual(1, "1"));
  Assert.ok(!UrlbarShared.deepEqual("a", "b"));
  Assert.ok(!UrlbarShared.deepEqual(true, false));
  Assert.ok(!UrlbarShared.deepEqual(null, undefined));
  Assert.ok(!UrlbarShared.deepEqual(0, null));
});

add_task(function test_mismatched_types() {
  Assert.ok(!UrlbarShared.deepEqual(null, {}));
  Assert.ok(!UrlbarShared.deepEqual({}, null));
  Assert.ok(!UrlbarShared.deepEqual(1, {}));
  Assert.ok(!UrlbarShared.deepEqual("a", ["a"]));
});

add_task(function test_arrays() {
  Assert.ok(UrlbarShared.deepEqual([], []));
  Assert.ok(UrlbarShared.deepEqual([1, 2, 3], [1, 2, 3]));
  Assert.ok(UrlbarShared.deepEqual([[1], [2]], [[1], [2]]));

  Assert.ok(!UrlbarShared.deepEqual([1, 2], [1, 2, 3]));
  Assert.ok(!UrlbarShared.deepEqual([1, 2, 3], [1, 2]));
  Assert.ok(!UrlbarShared.deepEqual([1, 2, 3], [1, 3, 2]));
});

add_task(function test_objects() {
  Assert.ok(UrlbarShared.deepEqual({}, {}));
  Assert.ok(UrlbarShared.deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 }));
  // Key order doesn't matter.
  Assert.ok(UrlbarShared.deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }));
  Assert.ok(
    UrlbarShared.deepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } })
  );

  Assert.ok(!UrlbarShared.deepEqual({ a: 1 }, { a: 2 }));
  Assert.ok(!UrlbarShared.deepEqual({ a: 1 }, { a: 1, b: 2 }));
  Assert.ok(!UrlbarShared.deepEqual({ a: 1, b: 2 }, { a: 1 }));
  Assert.ok(
    !UrlbarShared.deepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })
  );
});

add_task(function test_mismatched_keys_same_count() {
  // Same number of keys, different keys: the value of a missing key reads as
  // undefined on both sides, so this must not be treated as equal.
  Assert.ok(
    !UrlbarShared.deepEqual({ a: undefined }, { b: "whatever" }),
    "differing keys with undefined value must not compare equal"
  );
  Assert.ok(!UrlbarShared.deepEqual({ a: 1 }, { b: 1 }));
  Assert.ok(!UrlbarShared.deepEqual({ a: 1, b: 2 }, { a: 1, c: 2 }));
});

add_task(function test_mixed_structures() {
  const searchMode = {
    engineName: "Example",
    isPreview: false,
    source: 3,
  };
  Assert.ok(UrlbarShared.deepEqual(searchMode, { ...searchMode }));
  Assert.ok(
    !UrlbarShared.deepEqual(searchMode, { ...searchMode, isPreview: true })
  );

  const buttons = [
    { name: "one", l10n: { id: "a" } },
    { name: "two", l10n: { id: "b" } },
  ];
  Assert.ok(
    UrlbarShared.deepEqual(buttons, [
      { name: "one", l10n: { id: "a" } },
      { name: "two", l10n: { id: "b" } },
    ])
  );
  Assert.ok(
    !UrlbarShared.deepEqual(buttons, [
      { name: "one", l10n: { id: "a" } },
      { name: "two", l10n: { id: "c" } },
    ])
  );
});
