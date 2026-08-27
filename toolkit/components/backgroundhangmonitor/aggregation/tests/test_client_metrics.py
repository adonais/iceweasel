# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Tests for the HyperLogLog affected-client counting."""

import json
import os
import sys

import mozunit

_HERE = os.path.dirname(os.path.abspath(__file__))
_AGGREGATION_DIR = os.path.dirname(_HERE)
if _AGGREGATION_DIR not in sys.path:
    sys.path.insert(0, _AGGREGATION_DIR)

from client_metrics import HyperLogLog  # noqa: E402


def test_hll_estimate_is_within_error_bound():
    # p=14 -> ~0.81% standard error; allow a comfortable 3% for test stability.
    for n in (100, 1000, 100000):
        hll = HyperLogLog(p=14)
        for i in range(n):
            hll.add(f"c{i}")
        estimate = hll.count()
        assert abs(estimate - n) / n < 0.03, f"n={n} estimate={estimate}"


def test_hll_small_cardinality_uses_linear_counting():
    hll = HyperLogLog(p=14)
    for i in range(50):
        hll.add(i)
    # Small cardinalities should be near-exact via linear counting.
    assert abs(hll.count() - 50) <= 2


def test_hll_dedups_repeats():
    hll = HyperLogLog(p=14)
    for i in range(5000):
        hll.add(f"client-{i}")
        hll.add(f"client-{i}")  # duplicate must not change the distinct count
    assert abs(hll.count() - 5000) / 5000 < 0.03


def test_hll_merge_matches_union():
    a = HyperLogLog(p=14)
    b = HyperLogLog(p=14)
    for i in range(0, 6000):
        a.add(i)
    for i in range(3000, 9000):  # overlaps a on [3000, 6000)
        b.add(i)
    a.merge(b)
    # Union cardinality is 9000; merged sketch should estimate close to it.
    assert abs(a.count() - 9000) / 9000 < 0.03


def test_round_trip_preserves_the_sketch():
    hll = HyperLogLog(p=14)
    for i in range(4000):
        hll.add(f"c{i}")
    data = hll.serialize()
    assert data["p"] == 14

    restored = HyperLogLog.deserialize(data)
    assert restored.registers == hll.registers
    assert restored.count() == hll.count()


def test_round_trip_of_an_almost_empty_sketch():
    # The case sparse encoding used to exist for: nearly every register zero.
    hll = HyperLogLog(p=11)
    for i in range(5):
        hll.add(f"c{i}")
    restored = HyperLogLog.deserialize(hll.serialize())
    assert restored.registers == hll.registers
    assert restored.count() == hll.count()


def test_serialized_size_is_fixed_regardless_of_cardinality():
    # Dense is chosen partly so one popular signature cannot blow up the file.
    small = HyperLogLog(p=11)
    for i in range(5):
        small.add(f"c{i}")
    big = HyperLogLog(p=11)
    for i in range(100_000):
        big.add(f"c{i}")
    assert len(json.dumps(small.serialize())) == len(json.dumps(big.serialize()))


def test_merged_unions_sketches():
    # Same union as test_hll_merge_matches_union, but through the serialized form
    # roll-up persists: two overlapping day sketches merge to the 9000 union.
    a = HyperLogLog(p=14)
    b = HyperLogLog(p=14)
    for i in range(0, 6000):
        a.add(i)
    for i in range(3000, 9000):
        b.add(i)
    merged = HyperLogLog.merged([a.serialize(), b.serialize()])
    assert abs(merged.count() - 9000) / 9000 < 0.03


def test_merged_ignores_none_and_empty():
    assert HyperLogLog.merged([]) is None
    assert HyperLogLog.merged([None, None]) is None
    hll = HyperLogLog(p=14)
    for i in range(30):
        hll.add(i)
    merged = HyperLogLog.merged([None, hll.serialize(), None])
    assert merged.count() == hll.count()


if __name__ == "__main__":
    mozunit.main()
