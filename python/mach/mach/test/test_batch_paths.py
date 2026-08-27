# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import sys

import mozunit
import pytest

from mach.util import MAX_COMMAND_LINE_LENGTH, batch_paths


def test_empty():
    assert list(batch_paths([])) == []


def test_single_batch_when_under_budget():
    paths = [f"third_party/rust/crate{i}/.cargo-checksum.json" for i in range(10)]
    assert list(batch_paths(paths)) == [paths]


def test_only_windows_is_limited():
    paths = [f"third_party/rust/crate{i}/Cargo.toml.orig" for i in range(5000)]
    batches = list(batch_paths(paths))
    if sys.platform == "win32":
        assert len(batches) > 1
        for batch in batches:
            assert sum(len(p) + 3 for p in batch) <= MAX_COMMAND_LINE_LENGTH
    else:
        assert batches == [paths]
    assert [p for batch in batches for p in batch] == paths


@pytest.mark.skipif(sys.platform != "win32", reason="paths are only batched on Windows")
def test_splits_when_over_budget():
    paths = ["a" * 10 for _ in range(10)]
    # Each path costs len(path) + 3, so a budget of 26 fits two per batch.
    assert list(batch_paths(paths, budget=26)) == [
        [paths[0], paths[1]],
        [paths[2], paths[3]],
        [paths[4], paths[5]],
        [paths[6], paths[7]],
        [paths[8], paths[9]],
    ]


@pytest.mark.skipif(sys.platform != "win32", reason="paths are only batched on Windows")
def test_every_path_is_preserved():
    paths = [f"path/number/{i}" for i in range(1000)]
    batches = list(batch_paths(paths, budget=100))
    assert [p for batch in batches for p in batch] == paths
    assert len(batches) > 1


@pytest.mark.skipif(sys.platform != "win32", reason="paths are only batched on Windows")
def test_oversized_path_is_not_dropped():
    paths = ["short", "b" * 200, "also-short"]
    batches = list(batch_paths(paths, budget=50))
    assert [p for batch in batches for p in batch] == paths


if __name__ == "__main__":
    mozunit.main()
