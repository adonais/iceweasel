import json
import os
import shutil
import tempfile
import unittest

import mozunit
from mozharness.mozilla.testing.per_test_base import SingleTestMixin


class Harness(SingleTestMixin):
    """Minimal host for the mixin: get_indexed_logs() reads these two flags."""

    def __init__(self, verify_enabled=False, per_test_coverage=False):
        super().__init__()
        self.verify_enabled = verify_enabled
        self.per_test_coverage = per_test_coverage


class TestChunkSuites(unittest.TestCase):
    def chunk(self, suites, total_chunks, this_chunk):
        harness = Harness()
        harness.suites = suites
        return harness._chunk_suites(total_chunks, this_chunk)

    def test_chunks_together_cover_each_test_once(self):
        tests = ["test_%02d.js" % i for i in range(23)]
        seen = []
        for n in range(1, 4):
            seen.extend(self.chunk({"xpcshell": list(tests)}, 3, n).get("xpcshell", []))

        self.assertEqual(sorted(seen), sorted(tests))
        self.assertEqual(len(seen), len(set(seen)))

    def test_chunk_does_not_depend_on_insertion_order(self):
        """find_modified_tests builds the suites by iterating a set, whose
        order varies between processes, so two tasks of the same push would
        otherwise slice different lists."""
        tests = ["test_%02d.js" % i for i in range(23)]

        self.assertEqual(
            self.chunk({"xpcshell": list(tests)}, 3, 2),
            self.chunk({"xpcshell": list(reversed(tests))}, 3, 2),
        )

    def test_tests_are_split_across_suites(self):
        suites = {"mochitest-plain": ["b.js", "a.js"], "xpcshell": ["d.js", "c.js"]}

        self.assertEqual(
            self.chunk(dict(suites), 2, 1), {"mochitest-plain": ["a.js", "b.js"]}
        )
        self.assertEqual(self.chunk(dict(suites), 2, 2), {"xpcshell": ["c.js", "d.js"]})

    def test_a_single_chunk_runs_everything(self):
        suites = {"xpcshell": ["b.js", "a.js"]}

        self.assertEqual(self.chunk(suites, 1, 1), {"xpcshell": ["a.js", "b.js"]})


class TestTestSummaryLogs(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(suffix=".mozharness")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    @property
    def summary(self):
        return os.path.join(self.dir, "summary.jsonl")

    def write_part(self, harness, contents):
        with open(harness.test_summary_file, "w", encoding="utf-8") as fh:
            fh.write(contents)

    def read_summary(self):
        with open(self.summary, encoding="utf-8") as fh:
            return fh.read()

    def test_verify_mode_gives_each_run_a_distinct_summary(self):
        harness = Harness(verify_enabled=True)
        _, _, first = harness.get_indexed_logs(self.dir, "mochitest-plain")
        _, _, second = harness.get_indexed_logs(self.dir, "mochitest-plain")

        self.assertEqual(
            os.path.basename(first), "mochitest-plain-test1_testsummary.jsonl"
        )
        self.assertEqual(
            os.path.basename(second), "mochitest-plain-test2_testsummary.jsonl"
        )

    def test_summary_is_unindexed_outside_verify_mode(self):
        harness = Harness()
        _, _, path = harness.get_indexed_logs(self.dir, "xpcshell")

        self.assertEqual(os.path.basename(path), "xpcshell_testsummary.jsonl")
        self.assertEqual(harness.test_summary_file, path)

    def test_parts_are_concatenated_in_order_and_removed(self):
        harness = Harness(verify_enabled=True)

        harness.get_indexed_logs(self.dir, "xpcshell")
        first = harness.test_summary_file
        self.write_part(harness, '{"action": "test_start", "test": "a"}\n')
        harness.append_test_summary(self.dir)

        harness.get_indexed_logs(self.dir, "xpcshell")
        second = harness.test_summary_file
        self.write_part(harness, '{"action": "test_start", "test": "b"}\n')
        harness.append_test_summary(self.dir)

        tests = [json.loads(line)["test"] for line in self.read_summary().splitlines()]
        self.assertEqual(tests, ["a", "b"])
        self.assertFalse(os.path.exists(first))
        self.assertFalse(os.path.exists(second))
        self.assertIsNone(harness.test_summary_file)

    def test_missing_part_is_a_noop(self):
        harness = Harness()
        harness.get_indexed_logs(self.dir, "reftest")

        harness.append_test_summary(self.dir)

        self.assertFalse(os.path.exists(self.summary))
        self.assertIsNone(harness.test_summary_file)

    def test_part_without_trailing_newline_does_not_glue(self):
        harness = Harness(verify_enabled=True)

        harness.get_indexed_logs(self.dir, "mochitest-plain")
        self.write_part(harness, '{"action": "test_start", "test": "a"}')
        harness.append_test_summary(self.dir)

        harness.get_indexed_logs(self.dir, "mochitest-plain")
        self.write_part(harness, '{"action": "test_start", "test": "b"}\n')
        harness.append_test_summary(self.dir)

        lines = self.read_summary().splitlines()
        self.assertEqual([json.loads(line)["test"] for line in lines], ["a", "b"])

    def test_empty_part_does_not_create_a_summary(self):
        harness = Harness()
        harness.get_indexed_logs(self.dir, "xpcshell")
        self.write_part(harness, "")

        harness.append_test_summary(self.dir)

        self.assertFalse(os.path.exists(self.summary))


if __name__ == "__main__":
    mozunit.main()
