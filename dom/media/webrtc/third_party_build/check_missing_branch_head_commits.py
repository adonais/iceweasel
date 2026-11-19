# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This script identifies which commits on a libwebrtc branch-head are missing
# from a given Firefox branch.  It uses show_branch_head_commits.py to list
# the upstream branch-head commits and then checks whether each one has been
# vendored into Firefox.
#
# A commit is considered present in Firefox if any of the following apply:
#   - its full SHA appears in the "Upstream commit:" footer of a vendor commit
#   - its full SHA appears in a "(cherry picked from commit ...)" line
#   - its subject (after stripping the [MXXX] milestone prefix) is found as a
#     substring in any commit touching third_party/libwebrtc, catching manual
#     backports that don't use the standard vendoring format
#
# If --milestone is not provided, the script reads MOZ_NEXT_LIBWEBRTC_MILESTONE
# from default_config_env on the given Firefox branch.
#
# Missing commits can be ignored for a given Firefox major version by adding
# them to ignored_branch_head_commits.json on the given Firefox branch (or the
# file given by --exceptions-file), which holds a list of entries like:
#   {"firefox_version": 147, "upstream_sha": "<full or short sha>", "comment": "..."}

import argparse
import json
import re
import subprocess
import sys

from run_operations import run_git
from show_branch_head_commits import get_branch_head_commits

UPSTREAM_COMMIT_PREFIX = "Upstream commit: https://webrtc.googlesource.com/src/+/"
CHERRY_PICK_RE = re.compile(r"\(cherry picked from commit ([0-9a-f]+)\)")
BRACKET_PREFIXES_RE = re.compile(r"^(\[[^\]]*\]\s*)+")
EXCEPTIONS_PATH = "dom/media/webrtc/third_party_build/ignored_branch_head_commits.json"


def get_vendored_upstream_shas(firefox_path, firefox_branch):
    lines = run_git(
        f"git log --format=%b {firefox_branch} -- third_party/libwebrtc", firefox_path
    )
    shas = set()
    for line in lines:
        if line.startswith(UPSTREAM_COMMIT_PREFIX):
            shas.add(line[len(UPSTREAM_COMMIT_PREFIX) :])
        else:
            m = CHERRY_PICK_RE.search(line)
            if m:
                shas.add(m.group(1))
    return shas


def get_firefox_commit_text(firefox_path, firefox_branch):
    return set(
        run_git(
            f"git log --format=%s%n%b {firefox_branch} -- third_party/libwebrtc",
            firefox_path,
        )
    )


def is_subject_in_firefox(subject, ff_text):
    stripped = BRACKET_PREFIXES_RE.sub("", subject).strip()
    if not stripped:
        return False
    return any(stripped in line for line in ff_text)


def get_firefox_version(firefox_path, firefox_branch):
    res = subprocess.run(
        ["git", "show", f"{firefox_branch}:browser/config/version.txt"],
        capture_output=True,
        text=True,
        cwd=firefox_path,
        check=False,
    )
    if res.returncode != 0:
        return None
    return res.stdout.strip() or None


def read_exceptions(firefox_path, firefox_branch, exceptions_file):
    if exceptions_file is not None:
        with open(exceptions_file) as f:
            return f.read()
    # an older firefox_branch may not have an exceptions file
    res = subprocess.run(
        ["git", "show", f"{firefox_branch}:{EXCEPTIONS_PATH}"],
        capture_output=True,
        text=True,
        cwd=firefox_path,
        check=False,
    )
    if res.returncode != 0:
        return None
    return res.stdout


def get_ignored_commits(exceptions_text, firefox_version):
    if exceptions_text is None or firefox_version is None:
        return {}
    major_version = int(firefox_version.split(".")[0])
    entries = json.loads(exceptions_text)
    return {
        entry["upstream_sha"]: entry["comment"]
        for entry in entries
        if entry["firefox_version"] == major_version
    }


def get_ignore_comment(sha, ignored_commits):
    for ignored_sha, comment in ignored_commits.items():
        if not isinstance(ignored_sha, str):
            continue
        prefix = ignored_sha.strip().lower()
        if prefix and sha.startswith(prefix):
            return comment
    return None


def get_default_milestone(firefox_path, firefox_branch):
    # run_git calls sys.exit on failure; use subprocess directly so we can
    # handle the case where firefox_branch doesn't have default_config_env
    res = subprocess.run(
        [
            "git",
            "show",
            f"{firefox_branch}:dom/media/webrtc/third_party_build/default_config_env",
        ],
        capture_output=True,
        text=True,
        cwd=firefox_path,
        check=False,
    )
    if res.returncode != 0:
        return None
    for line in res.stdout.splitlines():
        if "MOZ_NEXT_LIBWEBRTC_MILESTONE=" in line and not line.strip().startswith("#"):
            return int(line.split("=")[-1].strip())
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Identify branch-head commits for a libwebrtc milestone missing from Firefox"
    )
    parser.add_argument(
        "firefox_branch",
        help="Firefox branch to check for vendored commits (example: origin/beta)",
    )
    parser.add_argument(
        "--milestone",
        type=int,
        default=None,
        help="integer chromium milestone (example: 106)",
    )
    parser.add_argument(
        "--firefox-path",
        default=".",
        help="path to Firefox repo (defaults to .)",
    )
    parser.add_argument(
        "--exceptions-file",
        default=None,
        help=f"path to a local ignored commits json file (defaults to {EXCEPTIONS_PATH} on firefox_branch)",
    )
    args = parser.parse_args()

    # try to detect the milestone using info from the libwebrtc update
    # in dom/media/webrtc/third_party_build/default_config_env
    if args.milestone is None:
        args.milestone = get_default_milestone(args.firefox_path, args.firefox_branch)
    if args.milestone is None:
        sys.exit(
            f"error: unable to determine milestone from {args.firefox_branch}; "
            "please provide --milestone"
        )

    # grab the branch-head commit for the milestone
    branch_head, full_shas, oneline_commits, upstream_subjects = (
        get_branch_head_commits(args.milestone)
    )

    firefox_version = get_firefox_version(args.firefox_path, args.firefox_branch)
    version_str = f" ({firefox_version})" if firefox_version else ""
    print(f"Firefox branch: {args.firefox_branch}{version_str}")
    print(f"chromium milestone {args.milestone} uses {branch_head}")

    if not oneline_commits:
        print(f"no branch-specific commits found on {branch_head}")
        sys.exit(0)

    print(f"\n{len(oneline_commits)} commit(s) on {branch_head}:")
    for commit in oneline_commits:
        print(commit)

    vendored = get_vendored_upstream_shas(args.firefox_path, args.firefox_branch)
    ff_text = get_firefox_commit_text(args.firefox_path, args.firefox_branch)

    # look for vendored shas, and if not found there, check for the
    # subject in the commit messages from third_party/libwebrtc as a
    # last ditch tactic since some branch-head cherry-picks
    # accidentally. leave out the commit sha they are cherry-picking.
    missing = [
        (sha, line)
        for sha, line, subject in zip(full_shas, oneline_commits, upstream_subjects)
        if sha not in vendored and not is_subject_in_firefox(subject, ff_text)
    ]

    exceptions_text = read_exceptions(
        args.firefox_path, args.firefox_branch, args.exceptions_file
    )
    ignored_commits = get_ignored_commits(exceptions_text, firefox_version)
    ignored = []
    remaining = []
    for sha, line in missing:
        comment = get_ignore_comment(sha, ignored_commits)
        if comment is None:
            remaining.append(line)
        else:
            ignored.append((sha, comment))
    missing = remaining

    if ignored:
        print(f"\n{len(ignored)} commit(s) ignored:")
        for sha, comment in ignored:
            print(f"{sha[:10]} {comment}")

    if not missing and not ignored:
        print(f"\nall {len(oneline_commits)} commit(s) already vendored into Firefox")
    elif not missing:
        print("\nno other commit(s) missing from Firefox")
    else:
        print(f"\n{len(missing)} commit(s) missing from Firefox:")
        for commit in missing:
            print(commit)
