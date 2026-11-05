# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import shutil
import subprocess
import tempfile
from pathlib import Path

import mozunit
import pytest

from mozversioncontrol import get_repository_object


def test_is_shallow_full_clone(repo):
    assert not get_repository_object(repo.dir).is_shallow


@pytest.mark.parametrize("vcs", ["git", "jj"])
def test_is_shallow_shallow_clone(vcs, monkeypatch):
    if vcs == "jj":
        if not shutil.which("jj"):
            pytest.skip("jj unavailable")
        monkeypatch.setenv("JJ_CONFIG", "")
        monkeypatch.delenv("MOZ_AVOID_JJ_VCS", raising=False)

    # Use tempfile since pytest's tempdir is too long for jj on Windows
    with tempfile.TemporaryDirectory(prefix=f"{vcs}-shallow") as td:
        src = Path(td) / "src"
        src.mkdir()
        for cmd in (
            ["git", "init", "-b", "master"],
            ["git", "config", "user.name", "Testing McTesterson"],
            ["git", "config", "user.email", "test@example.org"],
            ["git", "commit", "--allow-empty", "-m", "first"],
            ["git", "commit", "--allow-empty", "-m", "second"],
        ):
            subprocess.check_call(cmd, cwd=src)

        clone = Path(td) / "clone"
        subprocess.check_call(["git", "clone", "--depth", "1", src.as_uri(), clone])
        if vcs == "jj":
            subprocess.check_call(["jj", "git", "init", "--colocate"], cwd=clone)

        repo = get_repository_object(clone)
        assert repo.name == vcs
        assert repo.is_shallow


if __name__ == "__main__":
    mozunit.main()
