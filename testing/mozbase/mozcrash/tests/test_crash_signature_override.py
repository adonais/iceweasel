#!/usr/bin/env python
# coding=UTF-8

import mozunit


def test_crash_signature_override_overrides_signature(
    check_for_crashes, write_minidump, make_annotations, capsys
):
    """When a minidump carries a CrashSignatureOverrideForTesting annotation,
    it must be used as the signature instead of the one derived from the
    crashing stack."""
    write_minidump(make_annotations(CrashSignatureOverrideForTesting="test signature"))

    assert 1 == check_for_crashes(quiet=False)

    out, _ = capsys.readouterr()
    assert "[test signature]" in out


if __name__ == "__main__":
    mozunit.main()
