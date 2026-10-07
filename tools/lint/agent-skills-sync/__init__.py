# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import pathlib
import shutil
import subprocess

from mozlint import result
from mozversioncontrol import (
    InvalidRepoPath,
    MissingVCSInfo,
    MissingVCSTool,
    get_repository_object,
)

CLAUDE_SKILLS = ".claude/skills"
AGENT_SKILLS = ".agents/skills"


def _error(config, path, message):
    return result.from_config(
        config,
        path=str(path),
        lineno=0,
        message=message,
        level="error",
    )


def _collect_tracked(root):
    """Return the repo-relative POSIX paths tracked under either skill
    directory, or None if VCS cannot answer. The finder wants the repo root,
    which is all a source checkout has to go on to read .gitignore.
    """
    try:
        repo = get_repository_object(str(root))
        finder = repo.get_tracked_files_finder(str(root))
    except (
        InvalidRepoPath,
        MissingVCSTool,
        MissingVCSInfo,
        subprocess.CalledProcessError,
    ):
        return None
    if finder is None:
        return set()
    return {
        path
        for prefix in (CLAUDE_SKILLS, AGENT_SKILLS)
        for path, _ in finder.find(f"{prefix}/**")
    }


def _rels(prefix, tracked):
    """The tracked paths under prefix, relative to it. An untracked file under
    a skill is junk, and whether a tracked one exists is a separate question,
    so a file --fix has just copied counts as present before VCS knows about
    it.
    """
    return {
        path[len(prefix) + 1 :] for path in tracked if path.startswith(f"{prefix}/")
    }


def _collect_vcs_changes(root):
    """Return a mapping of repo-relative POSIX paths for added/modified and
    deleted files in the working copy, or None if VCS state is unavailable.
    """
    try:
        repo = get_repository_object(str(root))
        added_or_modified = repo.get_changed_files(diff_filter="AM", mode="all")
        deleted = repo.get_changed_files(diff_filter="D", mode="all")
    except (InvalidRepoPath, MissingVCSTool, MissingVCSInfo):
        return None
    return {
        "added_or_modified": {
            pathlib.PurePath(p).as_posix() for p in added_or_modified
        },
        "deleted": {pathlib.PurePath(p).as_posix() for p in deleted},
    }


def lint(paths, config, fix=None, **lintargs):
    root = pathlib.Path(lintargs["root"]).resolve()
    claude_root = root / CLAUDE_SKILLS
    agent_root = root / AGENT_SKILLS

    vcs_changes = _collect_vcs_changes(root) if fix else None

    tracked = _collect_tracked(root)
    if tracked is None:
        return {
            "results": [
                _error(
                    config,
                    claude_root,
                    "Cannot read which files VCS tracks, which is what tells a "
                    "skill's own files from junk.",
                )
            ],
            "fixed": 0,
        }

    rels = _rels(CLAUDE_SKILLS, tracked) | _rels(AGENT_SKILLS, tracked)
    claude_rels = {rel for rel in rels if (claude_root / rel).is_file()}
    agent_rels = {rel for rel in rels if (agent_root / rel).is_file()}

    results = []
    fixed = 0

    for rel in sorted(claude_rels.symmetric_difference(agent_rels)):
        claude_path = claude_root / rel
        agent_path = agent_root / rel
        claude_display = f"{CLAUDE_SKILLS}/{rel}"
        agent_display = f"{AGENT_SKILLS}/{rel}"

        if rel in claude_rels:
            existing_path, missing_path = claude_path, agent_path
            existing_display, missing_display = claude_display, agent_display
        else:
            existing_path, missing_path = agent_path, claude_path
            existing_display, missing_display = agent_display, claude_display

        if fix and vcs_changes is not None:
            existing_added = existing_display in vcs_changes["added_or_modified"]
            missing_deleted = missing_display in vcs_changes["deleted"]
            if existing_added and not missing_deleted:
                missing_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(existing_path, missing_path)
                fixed += 1
                continue
            if missing_deleted and not existing_added:
                existing_path.unlink()
                fixed += 1
                continue

        if fix:
            results.append(
                _error(
                    config,
                    existing_path,
                    f"{existing_display} has no counterpart {missing_display}. "
                    "Cannot determine from VCS whether to propagate an add or "
                    "a delete; resolve manually.",
                )
            )
        else:
            results.append(
                _error(
                    config,
                    existing_path,
                    f"Missing counterpart {missing_display}. Run "
                    "`./mach lint -l agent-skills-sync --fix`.",
                )
            )

    for rel in sorted(claude_rels.intersection(agent_rels)):
        claude_path = claude_root / rel
        agent_path = agent_root / rel
        if claude_path.read_bytes() == agent_path.read_bytes():
            continue

        claude_display = f"{CLAUDE_SKILLS}/{rel}"
        agent_display = f"{AGENT_SKILLS}/{rel}"

        if fix and vcs_changes is not None:
            claude_changed = claude_display in vcs_changes["added_or_modified"]
            agent_changed = agent_display in vcs_changes["added_or_modified"]
            if claude_changed and not agent_changed:
                shutil.copy(claude_path, agent_path)
                fixed += 1
                continue
            if agent_changed and not claude_changed:
                shutil.copy(agent_path, claude_path)
                fixed += 1
                continue

        if fix:
            claude_msg = (
                f"This file differs from {agent_display}. Both (or neither) "
                "sides modified in VCS; resolve manually."
            )
            agent_msg = (
                f"This file differs from {claude_display}. Both (or neither) "
                "sides modified in VCS; resolve manually."
            )
        else:
            claude_msg = (
                f"This file differs from {agent_display}. Try "
                "`./mach lint -l agent-skills-sync --fix`, else resolve "
                "manually."
            )
            agent_msg = (
                f"This file differs from {claude_display}. Try "
                "`./mach lint -l agent-skills-sync --fix`, else resolve "
                "manually."
            )
        results.append(_error(config, claude_path, claude_msg))
        results.append(_error(config, agent_path, agent_msg))

    return {"results": results, "fixed": fixed}
