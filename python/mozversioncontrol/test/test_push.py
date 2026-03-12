# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import subprocess

import mozunit
import pytest

from mozversioncontrol import get_repository_object

STEPS = {
    "hg": [
        """
        echo "second" > second
        hg add second
        hg commit -m "second commit"
        """,
    ],
    "git": [
        """
        echo "second" > second
        git add second
        git commit -m "second commit"
        """,
    ],
    "jj": [
        """
        echo "second" > second
        jj commit -m "second commit"
        jj bookmark create test-bookmark -r @-
        jj bookmark track test-bookmark --remote upstream
        """,
    ],
}


def verify_push_succeeded(repo):
    if repo.vcs == "hg":
        result = subprocess.run(
            ["hg", "log", "-r", "tip", "-T", "{desc}"],
            cwd=str(repo.dir.parent / "remoterepo"),
            capture_output=True,
            text=True,
            check=True,
        )
        assert "second commit" in result.stdout
    elif repo.vcs == "git":
        subprocess.run(
            ["git", "fetch"],
            cwd=str(repo.dir.parent / "remoterepo"),
            check=True,
        )
        result = subprocess.run(
            ["git", "log", "master", "-1", "--format=%s"],
            cwd=str(repo.dir.parent / "remoterepo"),
            capture_output=True,
            text=True,
            check=True,
        )
        assert "second commit" in result.stdout
    elif repo.vcs == "jj":
        subprocess.run(
            ["jj", "git", "fetch", "--remote", "upstream"],
            cwd=str(repo.dir),
            check=True,
        )
        result = subprocess.run(
            [
                "jj",
                "bookmark",
                "list",
                "--remote",
                "upstream",
                "test-bookmark",
            ],
            cwd=str(repo.dir),
            capture_output=True,
            text=True,
            check=True,
        )
        assert "second commit" in result.stdout


@pytest.mark.parametrize(
    "remote,ref",
    [
        pytest.param(None, None, id="no_args"),
        pytest.param("remote", None, id="with_remote"),
        pytest.param("remote", "ref", id="with_remote_and_ref"),
    ],
)
def test_push(repo, remote, ref):
    vcs = get_repository_object(repo.dir)

    repo.execute_next_step()

    if remote == "remote":
        if repo.vcs == "hg":
            remote = "../remoterepo"
        elif repo.vcs == "git":
            remote = "upstream"
        elif repo.vcs == "jj":
            remote = "upstream"

    if ref == "ref":
        if repo.vcs == "hg":
            ref = "."
        elif repo.vcs == "git":
            ref = "master"
        elif repo.vcs == "jj":
            ref = "test-bookmark"

    vcs.push(remote=remote, ref=ref)
    verify_push_succeeded(repo)


def test_push_ref_without_remote_raises(repo):
    vcs = get_repository_object(repo.dir)

    with pytest.raises(
        ValueError, match="Cannot specify ref without specifying remote"
    ):
        vcs.push(ref="some-ref")


def test_jj_push_url_to_name_translation(repo):
    """Test that jj translates git URLs to remote names"""
    if repo.vcs != "jj":
        pytest.skip("Only relevant for jj repos")

    vcs = get_repository_object(repo.dir)
    repo.execute_next_step()

    # Get the actual remote URL
    result = subprocess.run(
        ["jj", "git", "remote", "list"],
        cwd=str(repo.dir),
        capture_output=True,
        text=True,
        check=True,
    )

    # Extract the upstream URL from output
    for line in result.stdout.strip().splitlines():
        if line.startswith("upstream "):
            upstream_url = line.split(" ", 1)[1]
            break

    # Push using URL should work (it gets translated to "upstream")
    vcs.push(remote=upstream_url, ref="test-bookmark")


if __name__ == "__main__":
    mozunit.main()
