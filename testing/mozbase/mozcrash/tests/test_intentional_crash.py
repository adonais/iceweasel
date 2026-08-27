#!/usr/bin/env python
# coding=UTF-8

import mozunit


def test_intentional_crash_is_not_a_failure(
    check_for_crashes, write_minidump, make_annotations, capsys
):
    """A crash carrying the IntentionalCrashForTesting annotation was
    deliberately triggered by test automation and must not be counted as a
    failure."""
    write_minidump(
        make_annotations(
            CrashSignatureOverrideForTesting="test signature",
            IntentionalCrashForTesting="1",
        )
    )

    assert 0 == check_for_crashes(quiet=False)

    out, _ = capsys.readouterr()
    assert "PROCESS-CRASH" not in out
    assert "not a failure" in out


def test_crash_without_intentional_annotation_is_a_failure(
    check_for_crashes, write_minidump, make_annotations, capsys
):
    """A crash without the IntentionalCrashForTesting annotation is a regular
    failure, even if it carries the CrashSignatureOverrideForTesting
    annotation."""
    write_minidump(make_annotations(CrashSignatureOverrideForTesting="test signature"))

    assert 1 == check_for_crashes(quiet=False)

    out, _ = capsys.readouterr()
    assert "PROCESS-CRASH" in out


def test_intentional_crash_dump_is_not_saved(
    check_for_crashes, write_minidump, make_annotations, tmpdir
):
    """An intentional crash is not a failure, so its dump must not be copied to
    the save path (and needlessly uploaded to the artifacts)."""
    write_minidump(make_annotations(IntentionalCrashForTesting="1"))

    save_path = tmpdir.mkdir("saved")

    assert 0 == check_for_crashes(dump_save_path=str(save_path))

    assert not save_path.listdir()


def test_unintentional_crash_dump_is_saved(
    check_for_crashes, write_minidump, make_annotations, tmpdir
):
    """A regular crash is a failure, so its dump must be copied to the save path
    for upload to the artifacts."""
    write_minidump(make_annotations())

    save_path = tmpdir.mkdir("saved")

    assert 1 == check_for_crashes(dump_save_path=str(save_path))

    assert save_path.listdir()


if __name__ == "__main__":
    mozunit.main()
