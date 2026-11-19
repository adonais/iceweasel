# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This script lists the commits on a libwebrtc branch-head for a given
# chromium milestone.  It resolves the branch-head number from the milestone
# using lookup_branch_head.py and then lists the commits that are specific
# to that release branch (cherry-picked onto branch-heads/XXXX but not on
# main).
#
# The get_branch_head_commits() function is also imported by
# check_missing_branch_head_commits.py.

import argparse
import json
import sys
import urllib.error
import urllib.request

from lookup_branch_head import get_branch_head

upstream_url = "https://webrtc.googlesource.com/src"


def fetch_upstream_log(revision_range):
    # The upstream log query returns commits reachable from the end of the
    # range but not from the start, equivalent to "git log start..end".
    # Branch-heads typically have only a handful of commits, so a single
    # page is enough.  A "next" field means the results were truncated.
    url = f"{upstream_url}/+log/{revision_range}?format=JSON&n=1000"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            text = response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError) as e:
        sys.exit(f"error: unable to fetch {url}: {e}")
    # strip the XSSI protection prefix
    log = json.loads(text[text.index("\n") + 1 :])
    if "next" in log:
        sys.exit(f"error: more than 1000 commits found for {revision_range}")
    return log["log"]


def get_branch_head_commits(milestone):
    branch_head_num = get_branch_head(milestone)
    if branch_head_num is None:
        sys.exit(
            f"error: no branch_head info is found for chromium milestone '{milestone}'."
        )

    branch_head = f"branch-heads/{branch_head_num}"

    try:
        commits = fetch_upstream_log(f"refs/heads/main..refs/{branch_head}")
    except Exception as e:
        sys.exit(f"error: unable to fetch commits for {branch_head}: {e}")

    full_shas = [c["commit"] for c in commits]
    upstream_subjects = [c["message"].split("\n", 1)[0] for c in commits]
    oneline_commits = [
        f"{sha[:10]} {subject}" for sha, subject in zip(full_shas, upstream_subjects)
    ]

    return branch_head, full_shas, oneline_commits, upstream_subjects


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Show commits on the libwebrtc branch-head for a given chromium milestone"
    )
    parser.add_argument(
        "milestone", type=int, help="integer chromium milestone (example: 106)"
    )
    args = parser.parse_args()

    branch_head, full_shas, oneline_commits, upstream_subjects = (
        get_branch_head_commits(args.milestone)
    )

    print(f"chromium milestone {args.milestone} uses {branch_head}")

    if not oneline_commits:
        print(f"no branch-specific commits found on {branch_head}")
        sys.exit(0)

    print(f"\n{len(oneline_commits)} commit(s) on {branch_head}:")
    for commit in oneline_commits:
        print(commit)
