import json
import urllib.parse
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import mozunit
import pytest
from mozversioncontrol.repo.git import GitRepository
from responses import RequestsMock
from tryselect import push
from tryselect.util.taskcluster import TC_ROOT_URL
from tryselect.util.taskcluster import get_client as real_get_client


@pytest.mark.parametrize(
    "method,labels,params,routes,expected",
    (
        pytest.param(
            "fuzzy",
            ["task-foo", "task-bar"],
            None,
            None,
            {
                "parameters": {
                    "optimize_target_tasks": False,
                    "try_task_config": {
                        "env": {"TRY_SELECTOR": "fuzzy"},
                        "tasks": ["task-bar", "task-foo"],
                    },
                },
                "version": 2,
            },
            id="basic",
        ),
        pytest.param(
            "fuzzy",
            ["task-foo"],
            {"existing_tasks": {"task-foo": "123", "task-bar": "abc"}},
            None,
            {
                "parameters": {
                    "existing_tasks": {"task-bar": "abc"},
                    "optimize_target_tasks": False,
                    "try_task_config": {
                        "env": {"TRY_SELECTOR": "fuzzy"},
                        "tasks": ["task-foo"],
                    },
                },
                "version": 2,
            },
            id="existing_tasks",
        ),
        pytest.param(
            "fuzzy",
            ["task-" + str(i) for i in range(1001)],  # 1001 tasks, over threshold
            None,
            None,
            {
                "parameters": {
                    "optimize_target_tasks": False,
                    "try_task_config": {
                        "env": {"TRY_SELECTOR": "fuzzy"},
                        "priority": "lowest",
                        "tasks": sorted(["task-" + str(i) for i in range(1001)]),
                    },
                },
                "version": 2,
            },
            id="large_push_with_priority",
        ),
        pytest.param(
            "fuzzy",
            ["task-" + str(i) for i in range(500)],  # 500 tasks with rebuild=3
            {"try_task_config": {"rebuild": 3}},
            None,
            {
                "parameters": {
                    "optimize_target_tasks": False,
                    "try_task_config": {
                        "env": {"TRY_SELECTOR": "fuzzy"},
                        "priority": "lowest",
                        "rebuild": 3,
                        "tasks": sorted(["task-" + str(i) for i in range(500)]),
                    },
                },
                "version": 2,
            },
            id="large_push_with_rebuild",
        ),
        pytest.param(
            "fuzzy",
            ["task-" + str(i) for i in range(100)],  # Under threshold
            None,
            None,
            {
                "parameters": {
                    "optimize_target_tasks": False,
                    "try_task_config": {
                        "env": {"TRY_SELECTOR": "fuzzy"},
                        "tasks": sorted(["task-" + str(i) for i in range(100)]),
                    },
                },
                "version": 2,
            },
            id="small_push_no_priority",
        ),
        pytest.param(
            "fuzzy",
            [
                "task-" + str(i) for i in range(1001)
            ],  # Large push with existing priority
            {"try_task_config": {"priority": "low"}},
            None,
            {
                "parameters": {
                    "optimize_target_tasks": False,
                    "try_task_config": {
                        "env": {"TRY_SELECTOR": "fuzzy"},
                        "priority": "low",  # Should keep existing priority
                        "tasks": sorted(["task-" + str(i) for i in range(1001)]),
                    },
                },
                "version": 2,
            },
            id="large_push_existing_priority",
        ),
    ),
)
def test_generate_try_task_config(method, labels, params, routes, expected):
    # Simulate user responding "yes" to the large push prompt
    with patch("builtins.input", return_value="y"):
        assert (
            push.generate_try_task_config(method, labels, params=params, routes=routes)
            == expected
        )


def test_large_push_user_declines():
    """Test that when user declines large push warning, the system exits."""
    with patch("builtins.input", return_value="n"):
        with pytest.raises(SystemExit) as exc_info:
            push.generate_try_task_config(
                "fuzzy",
                ["task-" + str(i) for i in range(1001)],
            )
        assert exc_info.value.code == 1


def test_large_push_warning_message(capsys):
    """Test that the warning message is displayed for large pushes."""
    with patch("builtins.input", return_value="y"):
        push.generate_try_task_config(
            "fuzzy",
            ["task-" + str(i) for i in range(1001)],
        )
        captured = capsys.readouterr()
        assert "Your push would schedule at least 1001 tasks" in captured.out
        assert "lowest priority" in captured.out


def test_get_sys_argv():
    input_argv = [
        "./mach",
        "try",
        "fuzzy",
        "--full",
        "--artifact",
        "--push-to-vcs",
        "--query",
        "'android-hw !shippable !nofis",
        "--no-push",
    ]
    expected_string = './mach try fuzzy --full --artifact --push-to-vcs --query "\'android-hw !shippable !nofis" --no-push'
    assert push.get_sys_argv(input_argv) == expected_string


def test_get_sys_argv_2():
    input_argv = [
        "./mach",
        "try",
        "fuzzy",
        "--query",
        "'test-linux1804-64-qr/opt-mochitest-plain-",
        "--worker-override=t-linux-large=gecko-t/t-linux-2204-wayland-experimental",
        "--no-push",
    ]
    expected_string = './mach try fuzzy --query "\'test-linux1804-64-qr/opt-mochitest-plain-" --worker-override=t-linux-large=gecko-t/t-linux-2204-wayland-experimental --no-push'
    assert push.get_sys_argv(input_argv) == expected_string


@pytest.mark.parametrize(
    "url,push_to_vcs,expect_direct_push",
    [
        pytest.param(
            "https://example.com/fake-try-repo",
            False,
            True,
            id="non_hg_remote_https",
        ),
        pytest.param(
            "git@github.com:mozilla/fake-try.git",
            False,
            True,
            id="non_hg_remote_git",
        ),
        pytest.param(
            "https://hg.mozilla.org/other-repo",
            False,
            True,
            id="non_hg_remote_partial_match",
        ),
        pytest.param(
            "ssh://hg.mozilla.org/try",
            False,
            False,
            id="hg_remote_uses_lando",
        ),
        pytest.param(
            "ssh://hg.mozilla.org/try",
            True,
            True,
            id="push_to_vcs",
        ),
    ],
)
def test_push_to_try_routing(
    mock_push_to_lando_try,
    url,
    push_to_vcs,
    expect_direct_push,
):
    mock_vcs = MagicMock()
    mock_vcs.get_remote_url.return_value = url
    mock_vcs.branch = "feature-branch"

    mock_metrics = MagicMock()
    mock_metrics.mach_try.commit_prep.start = MagicMock()
    mock_metrics.mach_try.commit_prep.stop = MagicMock()

    with ExitStack() as stack:
        stack.enter_context(patch("tryselect.push.vcs", mock_vcs))
        stack.enter_context(patch("tryselect.push.MACH_TRY_REMOTE", url))
        mock_lando = stack.enter_context(mock_push_to_lando_try)
        stack.enter_context(patch("tryselect.push.check_working_directory"))
        stack.enter_context(
            patch(
                "tryselect.push.generate_try_task_config",
                return_value={"tasks": ["task1"]},
            )
        )
        stack.enter_context(
            patch("tryselect.push.push_to_git_backing", return_value="deadbeef")
        )
        stack.enter_context(patch("tryselect.push.write_task_config_history"))

        push._is_hg_try.cache_clear()

        push.push_to_try(
            "fuzzy",
            "try: test",
            mock_metrics,
            push_to_vcs=push_to_vcs,
            dry_run=False,
        )

        if expect_direct_push:
            mock_lando.assert_not_called()
            mock_vcs.push_to_try.assert_called_once()
        else:
            mock_lando.assert_called_once()
            mock_vcs.push_to_try.assert_not_called()


@pytest.fixture
def mock_tc_secret(monkeypatch):
    monkeypatch.setattr(push, "get_client", real_get_client)
    monkeypatch.setenv("MOZ_AUTOMATION", "1")
    monkeypatch.setenv("TASKCLUSTER_ROOT_URL", TC_ROOT_URL)
    monkeypatch.setenv("TASKCLUSTER_CLIENT_ID", "test-client")
    monkeypatch.setenv("TASKCLUSTER_ACCESS_TOKEN", "test-token")
    secret_url = f"{TC_ROOT_URL}/api/secrets/v1/secret/{urllib.parse.quote(push.GIT_BACKING_SECRET, '')}"
    with RequestsMock() as rsps:
        rsps.add(rsps.GET, secret_url, json={"secret": {"ssh_privkey": "fake-key\n"}})
        yield


def test_push_to_git_backing_returns_git_push_sha(
    tmp_path, monkeypatch, mock_tc_secret
):
    """push_to_git_backing pushes to git-backing with SSH and returns the git SHA."""
    git_repo = GitRepository(tmp_path)
    monkeypatch.setattr(push, "vcs", git_repo)

    def mock_run(*args, **kwargs):
        if args[0] == "rev-parse":
            return "gitsha456\n"
        return None

    with patch.object(git_repo, "_run", side_effect=mock_run), patch.object(
        git_repo, "push"
    ) as mock_push:
        result = push.push_to_git_backing("try")

    assert result == "gitsha456"
    mock_push.assert_called_once()
    env = mock_push.call_args.kwargs.get("env", {})
    assert "-o IdentitiesOnly=yes" in env.get("GIT_SSH_COMMAND", "")
    assert "-o StrictHostKeyChecking=accept-new" in env.get("GIT_SSH_COMMAND", "")


def test_push_to_try_skips_git_backing_for_hg_repos():
    """push_to_try skips git-backing when the local vcs is hg."""
    url = "ssh://hg.mozilla.org/try"
    mock_metrics = MagicMock()
    mock_git_backing = MagicMock()

    push.vcs.name = "hg"
    push.vcs.get_remote_url.return_value = url

    with ExitStack() as stack:
        stack.enter_context(patch("tryselect.push.MACH_TRY_REMOTE", url))
        stack.enter_context(patch("tryselect.push.GIT_BACKING_ENABLED", True))
        stack.enter_context(patch("tryselect.push.check_working_directory"))
        stack.enter_context(patch("tryselect.push.write_task_config_history"))
        stack.enter_context(
            patch("tryselect.push.push_to_git_backing", mock_git_backing)
        )
        push._is_hg_try.cache_clear()

        push.push_to_try(
            "fuzzy",
            "try: test",
            mock_metrics,
            try_task_config={
                "version": 2,
                "parameters": {"try_task_config": {"tasks": ["task1"]}},
            },
            push_to_vcs=True,
            dry_run=False,
        )

    mock_git_backing.assert_not_called()


def test_push_to_try_injects_git_backing_params():
    """push_to_try injects head_git_repository and head_git_rev into try_task_config."""
    url = "ssh://hg.mozilla.org/try"
    mock_metrics = MagicMock()

    push.vcs.get_remote_url.return_value = url

    with ExitStack() as stack:
        stack.enter_context(patch("tryselect.push.MACH_TRY_REMOTE", url))
        stack.enter_context(patch("tryselect.push.GIT_BACKING_ENABLED", True))
        stack.enter_context(patch("tryselect.push.check_working_directory"))
        stack.enter_context(patch("tryselect.push.write_task_config_history"))
        stack.enter_context(
            patch("tryselect.push.push_to_git_backing", return_value="deadbeef123")
        )
        push._is_hg_try.cache_clear()

        push.push_to_try(
            "fuzzy",
            "try: test",
            mock_metrics,
            try_task_config={
                "version": 2,
                "parameters": {"try_task_config": {"tasks": ["task1"]}},
            },
            push_to_vcs=True,
            dry_run=False,
        )

    call_kwargs = push.vcs.push_to_try.call_args.kwargs
    config = json.loads(call_kwargs["changed_files"]["try_task_config.json"])
    assert config["parameters"]["head_git_repository"] == push.GIT_BACKING_REPO
    assert config["parameters"]["head_git_rev"] == "deadbeef123"


def test_push_to_try_skips_git_backing_when_disabled():
    """When GIT_BACKING_ENABLED is False, push_to_git_backing is not called and
    head_git_repository/head_git_rev are not injected."""
    url = "ssh://hg.mozilla.org/try"
    mock_metrics = MagicMock()
    mock_git_backing = MagicMock()

    with ExitStack() as stack:
        stack.enter_context(patch("tryselect.push.MACH_TRY_REMOTE", url))
        stack.enter_context(patch("tryselect.push.GIT_BACKING_ENABLED", False))
        stack.enter_context(patch("tryselect.push.check_working_directory"))
        stack.enter_context(patch("tryselect.push.write_task_config_history"))
        stack.enter_context(
            patch("tryselect.push.push_to_git_backing", mock_git_backing)
        )
        push._is_hg_try.cache_clear()

        push.push_to_try(
            "fuzzy",
            "try: test",
            mock_metrics,
            try_task_config={
                "version": 2,
                "parameters": {"try_task_config": {"tasks": ["task1"]}},
            },
            push_to_vcs=True,
            dry_run=False,
        )

    mock_git_backing.assert_not_called()
    call_kwargs = push.vcs.push_to_try.call_args.kwargs
    config = json.loads(call_kwargs["changed_files"]["try_task_config.json"])
    assert "head_git_repository" not in config.get("parameters", {})
    assert "head_git_rev" not in config.get("parameters", {})


if __name__ == "__main__":
    mozunit.main()
