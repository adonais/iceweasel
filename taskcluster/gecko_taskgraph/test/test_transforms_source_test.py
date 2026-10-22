# Any copyright is dedicated to the public domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import pytest
from mozunit import main
from taskgraph.util.path import match

from gecko_taskgraph.transforms.source_test import (
    ignore_try_task_config,
    root_json_files,
)


@pytest.mark.parametrize(
    "job,expected",
    [
        pytest.param({"name": "no-when"}, None, id="no-when"),
        pytest.param({"name": "null-when", "when": None}, None, id="null-when"),
        pytest.param(
            {"name": "no-json", "when": {"files-changed": ["**/*.js"]}},
            ["**/*.js"],
            id="no-json",
        ),
        pytest.param(
            {
                "name": "json",
                "when": {"files-changed": ["**/*.js", "**/*.json", "**/*.jsx"]},
            },
            ["**/*.js", "*/**/*.json", *root_json_files(), "**/*.jsx"],
            id="json",
        ),
    ],
)
def test_ignore_try_task_config(run_transform, job, expected):
    jobs = list(run_transform(ignore_try_task_config, job))
    assert len(jobs) == 1
    assert (jobs[0].get("when") or {}).get("files-changed") == expected


@pytest.mark.parametrize(
    "path,expected",
    [
        ("try_task_config.json", False),
        ("package.json", True),
        ("taskcluster/try_task_config.json", True),
        ("browser/foo/bar.json", True),
        ("browser/foo/bar.jsonc", False),
    ],
)
def test_json_patterns_match(run_transform, path, expected):
    job = {"name": "json", "when": {"files-changed": ["**/*.json"]}}
    patterns = next(run_transform(ignore_try_task_config, job))["when"]["files-changed"]
    assert any(match(path, p) for p in patterns) == expected


if __name__ == "__main__":
    main()
