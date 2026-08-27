# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import pytest
from mozunit import main
from taskgraph.transforms.base import RepoConfig

from gecko_taskgraph.test.conftest import FakeParameters, FakeTransformConfig
from gecko_taskgraph.transforms.job.common import (
    _rewrite_repo_configs_for_git_mirror,
    clone_type,
)


def make_config(**params):
    return FakeTransformConfig(params=FakeParameters(params))


@pytest.mark.parametrize(
    "params,clone_with,expected",
    (
        pytest.param(
            {
                "repository_type": "hg",
                "head_git_repository": "https://github.com/mozilla-firefox/firefox",
                "head_git_rev": "abc123",
            },
            "git",
            "git",
            id="hg-repo-with-mirror-opted-into-git",
        ),
        pytest.param(
            {
                "repository_type": "hg",
                "head_git_repository": "https://github.com/mozilla-firefox/firefox",
                "head_git_rev": "abc123",
            },
            "hg",
            "hg",
            id="hg-repo-with-mirror-opted-into-hg",
        ),
        pytest.param(
            {
                "repository_type": "hg",
                "head_git_repository": None,
                "head_git_rev": None,
            },
            "git",
            "hg",
            id="hg-repo-without-mirror-falls-back-to-hg",
        ),
        pytest.param(
            {
                "repository_type": "hg",
                "head_git_repository": "https://github.com/mozilla-firefox/firefox",
                "head_git_rev": None,
            },
            "git",
            "hg",
            id="hg-repo-with-missing-git-rev-falls-back-to-hg",
        ),
        pytest.param(
            {
                "repository_type": "git",
                "head_git_repository": None,
                "head_git_rev": None,
            },
            "hg",
            "git",
            id="native-git-repo-ignores-clone-with",
        ),
    ),
)
def test_clone_type(params, clone_with, expected):
    config = make_config(**params)
    job = {"run": {"clone-with": clone_with}}
    assert clone_type(config, job) == expected


def test_rewrite_repo_configs_for_git_mirror():
    config = make_config(
        head_git_repository="https://github.com/mozilla-firefox/firefox",
        head_git_rev="abc123",
    )
    repo_configs = {
        "gecko": RepoConfig(
            prefix="gecko",
            name="Mozilla Firefox",
            base_repository="https://hg.mozilla.org/mozilla-central",
            head_repository="https://hg.mozilla.org/mozilla-central",
            head_ref="tip",
            head_rev="deadbeef",
            type="hg",
            ssh_secret_name="project/some/ssh-secret",
        ),
        "comm": RepoConfig(
            prefix="comm",
            name="Comm Central",
            base_repository="https://hg.mozilla.org/comm-central",
            head_repository="https://hg.mozilla.org/comm-central",
            head_ref="tip",
            head_rev="cafef00d",
            type="hg",
        ),
    }

    rewritten = _rewrite_repo_configs_for_git_mirror(config, repo_configs)

    gecko = rewritten["gecko"]
    assert gecko.type == "git"
    assert gecko.base_repository == "https://github.com/mozilla-firefox/firefox"
    assert gecko.head_repository == "https://github.com/mozilla-firefox/firefox"
    assert gecko.head_rev == "abc123"
    assert gecko.head_ref is None
    assert gecko.ssh_secret_name is None

    # Other repos (e.g. comm-central) are left untouched.
    assert rewritten["comm"] == repo_configs["comm"]


if __name__ == "__main__":
    main()
