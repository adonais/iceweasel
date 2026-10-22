# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

from pathlib import Path

from mozunit import main

from mach.util import get_state_dir


def _make_state_dir(srcdirs, name, topsrcdir):
    state_dir = srcdirs / name
    state_dir.mkdir(parents=True)
    if topsrcdir is not None:
        (state_dir / "topsrcdir.txt").write_text(str(topsrcdir))
    return state_dir


def test_new_state_dir_removes_orphaned_ones(tmp_path, monkeypatch):
    state_path = tmp_path / "state"
    srcdirs = state_path / "srcdirs"
    checkouts = tmp_path / "checkouts"
    checkouts.mkdir()
    monkeypatch.setenv("MOZBUILD_STATE_PATH", str(state_path))

    existing = checkouts / "existing"
    existing.mkdir()
    kept_existing = _make_state_dir(srcdirs, "existing-1", existing)
    removed = _make_state_dir(srcdirs, "deleted-1", checkouts / "deleted")
    kept_unmounted = _make_state_dir(
        srcdirs, "unmounted-1", tmp_path / "unmounted" / "checkout"
    )
    kept_no_marker = _make_state_dir(srcdirs, "unknown-1", None)

    new_checkout = checkouts / "new"
    new_checkout.mkdir()
    new_state_dir = Path(
        get_state_dir(specific_to_topsrcdir=True, topsrcdir=new_checkout)
    )

    assert new_state_dir.is_dir()
    assert kept_existing.is_dir()
    assert not removed.exists()
    assert kept_unmounted.is_dir()
    assert kept_no_marker.is_dir()


def test_existing_state_dir_does_not_sweep(tmp_path, monkeypatch):
    state_path = tmp_path / "state"
    monkeypatch.setenv("MOZBUILD_STATE_PATH", str(state_path))
    checkout = tmp_path / "checkout"
    checkout.mkdir()
    get_state_dir(specific_to_topsrcdir=True, topsrcdir=checkout)

    orphan = _make_state_dir(state_path / "srcdirs", "deleted-1", tmp_path / "gone")
    get_state_dir(specific_to_topsrcdir=True, topsrcdir=checkout)

    assert orphan.is_dir()


if __name__ == "__main__":
    main()
