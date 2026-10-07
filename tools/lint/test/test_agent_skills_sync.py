# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import pathlib
import sys

import mozunit
import pytest

LINTER = "agent-skills-sync"
fixed = 0


@pytest.fixture(autouse=True)
def _reset_fixed(monkeypatch):
    monkeypatch.setattr(sys.modules[__name__], "fixed", 0)


def _vcs(added_or_modified=None, deleted=None):
    return {
        "added_or_modified": set(added_or_modified or []),
        "deleted": set(deleted or []),
    }


@pytest.fixture
def patch_vcs(linter_module, monkeypatch):
    def _patch(added_or_modified=None, deleted=None):
        monkeypatch.setattr(
            linter_module,
            "_collect_vcs_changes",
            lambda root: _vcs(added_or_modified=added_or_modified, deleted=deleted),
        )

    return _patch


@pytest.fixture(autouse=True)
def track_written_files(linter_module, monkeypatch):
    """Count every file a test writes as tracked, since tracking is what the
    linter reads to tell a skill's content from junk. A test that needs an
    untracked file says so with patch_tracked.
    """

    def _collect(root):
        return {
            p.relative_to(root).as_posix()
            for prefix in (".claude/skills", ".agents/skills")
            for p in (root / prefix).rglob("*")
            if p.is_file()
        }

    monkeypatch.setattr(linter_module, "_collect_tracked", _collect)


@pytest.fixture
def patch_tracked(linter_module, monkeypatch):
    def _patch(*paths):
        monkeypatch.setattr(linter_module, "_collect_tracked", lambda root: set(paths))

    return _patch


def _write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def _setup_tree(root, claude_files=None, agent_files=None):
    for rel, content in (claude_files or {}).items():
        _write(root / ".claude" / "skills" / rel, content)
    for rel, content in (agent_files or {}).items():
        _write(root / ".agents" / "skills" / rel, content)


def test_in_sync(global_lint, tmp_path):
    _setup_tree(
        tmp_path,
        claude_files={"foo/SKILL.md": b"same"},
        agent_files={"foo/SKILL.md": b"same"},
    )
    results = global_lint([], root=str(tmp_path))
    assert results == []


def test_missing_in_agent(global_lint, tmp_path):
    _setup_tree(tmp_path, claude_files={"foo/SKILL.md": b"data"})
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 1
    assert results[0].level == "error"
    assert results[0].message == (
        "Missing counterpart .agents/skills/foo/SKILL.md. "
        "Run `./mach lint -l agent-skills-sync --fix`."
    )
    assert (
        pathlib.Path(results[0].path).as_posix().endswith(".claude/skills/foo/SKILL.md")
    )


def test_missing_in_claude(global_lint, tmp_path):
    _setup_tree(tmp_path, agent_files={"foo/SKILL.md": b"data"})
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 1
    assert results[0].level == "error"
    assert "Missing counterpart" in results[0].message
    assert ".claude/skills/foo/SKILL.md" in results[0].message


def test_content_mismatch(global_lint, tmp_path):
    _setup_tree(
        tmp_path,
        claude_files={"foo/SKILL.md": b"claude"},
        agent_files={"foo/SKILL.md": b"agent"},
    )
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 2
    assert all(r.level == "error" for r in results)
    assert all("differs from" in r.message for r in results)


def test_non_markdown_content_mismatch(global_lint, tmp_path):
    _setup_tree(
        tmp_path,
        claude_files={"foo/scripts/run.py": b"claude"},
        agent_files={"foo/scripts/run.py": b"agent"},
    )
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 2
    assert all(r.level == "error" for r in results)
    assert all("differs from" in r.message for r in results)


def test_non_markdown_missing_counterpart(global_lint, tmp_path):
    _setup_tree(tmp_path, claude_files={"foo/scripts/run.py": b"data"})
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 1
    assert results[0].level == "error"
    assert ".agents/skills/foo/scripts/run.py" in results[0].message


@pytest.mark.skipif(
    sys.platform == "win32", reason="Windows has no executable permission bit"
)
def test_fix_propagates_executable_mode(global_lint, tmp_path, patch_vcs):
    patch_vcs(added_or_modified=[".claude/skills/foo/scripts/run.sh"])
    _setup_tree(tmp_path, claude_files={"foo/scripts/run.sh": b"#!/bin/sh\n"})
    (tmp_path / ".claude" / "skills" / "foo" / "scripts" / "run.sh").chmod(0o755)
    results = global_lint([], root=str(tmp_path), fix=True)
    assert results == []
    assert fixed == 1
    mirrored = tmp_path / ".agents" / "skills" / "foo" / "scripts" / "run.sh"
    assert mirrored.stat().st_mode & 0o111


def test_fix_propagates_add_to_agent(global_lint, tmp_path, patch_vcs):
    patch_vcs(added_or_modified=[".claude/skills/foo/SKILL.md"])
    _setup_tree(tmp_path, claude_files={"foo/SKILL.md": b"data"})
    results = global_lint([], root=str(tmp_path), fix=True)
    assert results == []
    assert fixed == 1
    assert (
        tmp_path / ".agents" / "skills" / "foo" / "SKILL.md"
    ).read_bytes() == b"data"


def test_fix_propagates_add_to_claude(global_lint, tmp_path, patch_vcs):
    patch_vcs(added_or_modified=[".agents/skills/foo/SKILL.md"])
    _setup_tree(tmp_path, agent_files={"foo/SKILL.md": b"data"})
    results = global_lint([], root=str(tmp_path), fix=True)
    assert results == []
    assert fixed == 1
    assert (
        tmp_path / ".claude" / "skills" / "foo" / "SKILL.md"
    ).read_bytes() == b"data"


def test_fix_propagates_delete_from_claude(global_lint, tmp_path, patch_vcs):
    # User deleted .claude/skills/foo/SKILL.md; agent still has it.
    patch_vcs(deleted=[".claude/skills/foo/SKILL.md"])
    _setup_tree(tmp_path, agent_files={"foo/SKILL.md": b"data"})
    results = global_lint([], root=str(tmp_path), fix=True)
    assert results == []
    assert fixed == 1
    assert not (tmp_path / ".agents" / "skills" / "foo" / "SKILL.md").exists()


def test_fix_propagates_delete_from_agent(global_lint, tmp_path, patch_vcs):
    patch_vcs(deleted=[".agents/skills/foo/SKILL.md"])
    _setup_tree(tmp_path, claude_files={"foo/SKILL.md": b"data"})
    results = global_lint([], root=str(tmp_path), fix=True)
    assert results == []
    assert fixed == 1
    assert not (tmp_path / ".claude" / "skills" / "foo" / "SKILL.md").exists()


def test_fix_handles_rename_on_claude_side(global_lint, tmp_path, patch_vcs):
    # Simulate renaming .claude/skills/old/SKILL.md -> .claude/skills/new/SKILL.md.
    # VCS reports the old path as deleted and the new path as added on the
    # claude side; the agent side still has the old path.
    patch_vcs(
        added_or_modified=[".claude/skills/new/SKILL.md"],
        deleted=[".claude/skills/old/SKILL.md"],
    )
    _setup_tree(
        tmp_path,
        claude_files={"new/SKILL.md": b"data"},
        agent_files={"old/SKILL.md": b"data"},
    )
    results = global_lint([], root=str(tmp_path), fix=True)
    assert results == []
    assert fixed == 2
    assert (
        tmp_path / ".agents" / "skills" / "new" / "SKILL.md"
    ).read_bytes() == b"data"
    assert not (tmp_path / ".agents" / "skills" / "old" / "SKILL.md").exists()


def test_fix_one_sided_without_vcs_signal_errors(global_lint, tmp_path, patch_vcs):
    # VCS available but neither side shows the file as added or deleted.
    patch_vcs()
    _setup_tree(tmp_path, claude_files={"foo/SKILL.md": b"data"})
    results = global_lint([], root=str(tmp_path), fix=True)
    assert len(results) == 1
    assert fixed == 0
    assert "resolve manually" in results[0].message
    # And the existing file was NOT deleted or copied.
    assert (tmp_path / ".claude" / "skills" / "foo" / "SKILL.md").exists()
    assert not (tmp_path / ".agents" / "skills" / "foo" / "SKILL.md").exists()


def test_fix_one_sided_without_vcs_available_errors(global_lint, tmp_path):
    # tmp_path is not a repo, so _collect_vcs_changes returns None.
    _setup_tree(tmp_path, claude_files={"foo/SKILL.md": b"data"})
    results = global_lint([], root=str(tmp_path), fix=True)
    assert len(results) == 1
    assert fixed == 0
    assert "resolve manually" in results[0].message


def test_fix_resolves_content_mismatch_via_vcs_claude_changed(
    global_lint, tmp_path, patch_vcs
):
    patch_vcs(added_or_modified=[".claude/skills/foo/SKILL.md"])
    _setup_tree(
        tmp_path,
        claude_files={"foo/SKILL.md": b"new"},
        agent_files={"foo/SKILL.md": b"old"},
    )
    results = global_lint([], root=str(tmp_path), fix=True)
    assert results == []
    assert fixed == 1
    assert (tmp_path / ".agents" / "skills" / "foo" / "SKILL.md").read_bytes() == b"new"


def test_fix_resolves_content_mismatch_via_vcs_agent_changed(
    global_lint, tmp_path, patch_vcs
):
    patch_vcs(added_or_modified=[".agents/skills/foo/SKILL.md"])
    _setup_tree(
        tmp_path,
        claude_files={"foo/SKILL.md": b"old"},
        agent_files={"foo/SKILL.md": b"new"},
    )
    results = global_lint([], root=str(tmp_path), fix=True)
    assert results == []
    assert fixed == 1
    assert (tmp_path / ".claude" / "skills" / "foo" / "SKILL.md").read_bytes() == b"new"


def test_fix_cannot_resolve_content_mismatch_when_both_changed(
    global_lint, tmp_path, patch_vcs
):
    patch_vcs(
        added_or_modified=[
            ".claude/skills/foo/SKILL.md",
            ".agents/skills/foo/SKILL.md",
        ],
    )
    _setup_tree(
        tmp_path,
        claude_files={"foo/SKILL.md": b"c"},
        agent_files={"foo/SKILL.md": b"a"},
    )
    results = global_lint([], root=str(tmp_path), fix=True)
    assert len(results) == 2
    assert fixed == 0
    assert all("resolve manually" in r.message for r in results)


def test_untracked_files_are_ignored(global_lint, tmp_path, patch_tracked):
    patch_tracked(".claude/skills/foo/SKILL.md", ".agents/skills/foo/SKILL.md")
    _setup_tree(
        tmp_path,
        claude_files={
            "foo/SKILL.md": b"same",
            "foo/.DS_Store": b"noise",
            "foo/scripts/__pycache__/run.cpython-314.pyc": b"noise",
            "foo/scripts/run.py.orig": b"noise",
        },
        agent_files={"foo/SKILL.md": b"same"},
    )
    results = global_lint([], root=str(tmp_path))
    assert results == []


def test_tracked_file_of_any_type_is_synced(global_lint, tmp_path, patch_tracked):
    patch_tracked(".claude/skills/foo/data/fixture.json")
    _setup_tree(tmp_path, claude_files={"foo/data/fixture.json": b"{}"})
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 1
    assert ".agents/skills/foo/data/fixture.json" in results[0].message


def test_copy_counts_as_present_before_it_is_tracked(
    global_lint, tmp_path, patch_vcs, patch_tracked
):
    patch_vcs(added_or_modified=[".claude/skills/foo/SKILL.md"])
    patch_tracked(".claude/skills/foo/SKILL.md")
    _setup_tree(tmp_path, claude_files={"foo/SKILL.md": b"data"})
    assert global_lint([], root=str(tmp_path), fix=True) == []
    assert fixed == 1
    assert global_lint([], root=str(tmp_path)) == []


def test_untracked_counterpart_differing_reports_the_difference(
    global_lint, tmp_path, patch_tracked
):
    patch_tracked(".claude/skills/foo/SKILL.md")
    _setup_tree(
        tmp_path,
        claude_files={"foo/SKILL.md": b"c"},
        agent_files={"foo/SKILL.md": b"a"},
    )
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 2
    assert all("differs from" in r.message for r in results)


def test_nothing_tracked_compares_nothing(global_lint, tmp_path, patch_tracked):
    patch_tracked()
    _setup_tree(tmp_path, claude_files={"foo/SKILL.md": b"data"})
    assert global_lint([], root=str(tmp_path)) == []


def test_unreadable_vcs_errors(global_lint, tmp_path, linter_module, monkeypatch):
    monkeypatch.setattr(linter_module, "_collect_tracked", lambda root: None)
    _setup_tree(tmp_path, claude_files={"foo/SKILL.md": b"data"})
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 1
    assert "Cannot read which files VCS tracks" in results[0].message


def test_mixed_run_partial_resolution(global_lint, tmp_path, patch_vcs):
    # resolvable/SKILL.md is added on claude -> propagate to agent.
    # ambiguous/SKILL.md exists only on claude with no VCS signal -> error.
    patch_vcs(
        added_or_modified=[".claude/skills/resolvable/SKILL.md"],
    )
    _setup_tree(
        tmp_path,
        claude_files={
            "resolvable/SKILL.md": b"data",
            "ambiguous/SKILL.md": b"data",
        },
    )
    results = global_lint([], root=str(tmp_path), fix=True)
    assert fixed == 1
    assert len(results) == 1
    assert "resolve manually" in results[0].message
    assert ".claude/skills/ambiguous/SKILL.md" in results[0].message
    assert (
        tmp_path / ".agents" / "skills" / "resolvable" / "SKILL.md"
    ).read_bytes() == b"data"
    assert not (tmp_path / ".agents" / "skills" / "ambiguous" / "SKILL.md").exists()


def test_identical_content_both_changed_is_in_sync(global_lint, tmp_path, patch_vcs):
    # VCS reports both sides modified, but the actual contents are identical.
    # The read_bytes() equality short-circuits before any VCS check.
    patch_vcs(
        added_or_modified=[
            ".claude/skills/foo/SKILL.md",
            ".agents/skills/foo/SKILL.md",
        ],
    )
    _setup_tree(
        tmp_path,
        claude_files={"foo/SKILL.md": b"same"},
        agent_files={"foo/SKILL.md": b"same"},
    )
    results = global_lint([], root=str(tmp_path), fix=True)
    assert results == []
    assert fixed == 0


if __name__ == "__main__":
    mozunit.main()
