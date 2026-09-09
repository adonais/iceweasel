# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Reviewer suggestion logic behind the "mach file-info reviewers" subcommand.

Three sources are consulted, in order: Phabricator's Herald rules, the in-tree
mots module ownership database, and the version control history.
"""

import json
import os
import re
import sys
import time
import urllib.request
from collections import defaultdict

import mozpack.path as mozpath

# Herald rules as scraped from Phabricator by the reviewer-selector tool. We use
# them to replicate the reviewers Herald would automatically add for a set of
# files. This dump is a bootstrapping measure: its format and freshness are not
# guaranteed, and this should eventually move to querying the reviewer-selector
# tool (or mots) directly rather than parsing the dump.
HERALD_RULES_URL = (
    "https://raw.githubusercontent.com/mozilla-conduit/reviewer-selector/"
    "main/herald_rules.json"
)
# Re-download the cached copy once it gets older than this.
HERALD_RULES_MAX_AGE = 24 * 60 * 60

# Number of recent commits to inspect when falling back to version control
# history to find past reviewers for a file.
RECENT_REVIEWERS_COMMIT_LIMIT = 100

# In-tree module ownership database, as maintained by the mots tool.
MOTS_CONFIG_PATH = "mots.yaml"
# Some mots modules also list external repositories, which no in-tree path can
# match.
MOTS_EXTERNAL_PATTERN_RE = re.compile(r"^https?://")


def load_herald_rules(offline=False):
    """Return the parsed herald_rules.json, fetching and caching it as needed.

    The file is cached under the mozbuild state directory and re-downloaded once
    the cached copy gets older than HERALD_RULES_MAX_AGE. When offline (or the
    download fails) any cached copy is used regardless of age; if none exists,
    None is returned.
    """
    from mach.util import get_state_dir

    cache_path = os.path.join(get_state_dir(), "herald_rules.json")

    fresh = False
    if os.path.exists(cache_path):
        age = time.time() - os.path.getmtime(cache_path)
        fresh = age < HERALD_RULES_MAX_AGE

    if not offline and not fresh:
        try:
            with urllib.request.urlopen(HERALD_RULES_URL, timeout=30) as fh:
                data = fh.read()
            rules = json.loads(data)
            with open(cache_path, "wb") as fh:
                fh.write(data)
            return rules
        except Exception as e:
            print(
                f"(could not update herald rules cache from {HERALD_RULES_URL}: "
                f"{e}; using cached copy if available)",
                file=sys.stderr,
            )

    if not os.path.exists(cache_path):
        return None

    with open(cache_path) as fh:
        return json.load(fh)


def herald_reviewers_for_files(rules_data, relpaths):
    """Return the reviewers Herald would auto-add for the given files.

    Returns (groups, individuals), each a dict mapping a reviewer target to
    whether it is added as a blocking reviewer by at least one matching rule.
    Only the file-based conditions of a rule are evaluated; conditions that
    depend on revision context (author, reviewers already on the revision,
    status, etc.) are ignored, since we only have a set of files to work from.
    """
    # Phabricator presents affected files with a leading slash, which is how the
    # rules' regexps and substrings are written, so match against that form.
    candidates = ["/" + p for p in relpaths]

    def condition_matches(condition, candidates):
        op = condition["operator"]
        value = condition["value"]
        if op in ("matches-regexp", "does-not-match-regexp"):
            try:
                matched = any(re.search(value, p) for p in candidates)
            except re.error:
                # A rule we can't evaluate shouldn't match.
                return False
            return matched if op == "matches-regexp" else not matched
        if op == "contains":
            return any(value in p for p in candidates)
        if op == "does-not-contain":
            return all(value not in p for p in candidates)
        # Unknown file operator: don't match on a condition we don't understand.
        return False

    groups = {}
    individuals = {}
    for rule in rules_data.get("rules", []):
        if rule.get("status") != "active":
            continue

        file_conditions = [
            c
            for c in rule.get("conditions", [])
            if c["type"] == "differential-affected-files"
        ]
        # Require at least one positive condition that actually matches a file.
        # Rules whose only file condition is negative (e.g. does-not-contain
        # "third_party"), or that have none at all, rely on non-file conditions
        # we don't evaluate to scope themselves, so they would otherwise fire
        # for essentially any path.
        positive = [
            c
            for c in file_conditions
            if c["operator"] in ("matches-regexp", "contains")
        ]
        if not positive:
            continue
        if not all(condition_matches(c, candidates) for c in file_conditions):
            continue

        for action in rule.get("actions", []):
            if action["type"] != "add-reviewers":
                continue
            for reviewer in action["reviewers"]:
                target = reviewer["target"]
                blocking = reviewer.get("blocking", False)
                bucket = groups if reviewer.get("is_group") else individuals
                bucket[target] = bucket.get(target, False) or blocking

    return groups, individuals


def reviewers_to_json(reviewers):
    """Serialize a {name: blocking} reviewer dict to a sorted list of dicts."""
    return [
        {"name": name, "blocking": blocking}
        for name, blocking in sorted(reviewers.items())
    ]


# Matches the "r=..." part of a commit message subject, capturing the
# comma-separated list of reviewers. A reviewer is a name made of word
# characters and hyphens, optionally prefixed with "#" (a group) and/or suffixed
# with "!" (blocking), e.g. "r=foo,#bar-reviewers,baz!".
_REVIEWER_RE = re.compile(r"\br=(#?[\w-]+!?(?:,#?[\w-]+!?)*)")


def parse_reviewers_from_subjects(subjects):
    """Tally reviewers from a list of commit message subjects.

    Returns (individuals, groups), each an ordered list of (name, count) tuples
    sorted by descending count. Groups are distinguished by their "#" prefix,
    which is Phabricator's marker for a reviewer group.
    """
    individuals = defaultdict(int)
    groups = defaultdict(int)
    for line in subjects:
        match = _REVIEWER_RE.search(line)
        if not match:
            continue
        for entry in match.group(1).split(","):
            name = entry.rstrip("!")  # Drop the "!" blocking marker.
            if name.startswith("#"):
                groups[name[1:]] += 1
            else:
                individuals[name] += 1

    def ranked(counter):
        return sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))

    return ranked(individuals), ranked(groups)


def _recent_commit_subjects(repo, relpaths):
    """Return the subjects of recent commits touching the given files.

    Works across the supported version control systems. A jj checkout uses a git
    backing store, so its history is read through the git backend.
    """
    limit = RECENT_REVIEWERS_COMMIT_LIMIT
    paths = list(relpaths)
    if repo.name == "hg":
        out = repo._run(
            "log",
            "-l",
            str(limit),
            "-T",
            "{desc|firstline}\n",
            "--",
            *paths,
        )
    else:
        # git, and jj (through its git backing store).
        git = repo._git if repo.name == "jj" else repo
        out = git._run(
            "log",
            "-n",
            str(limit),
            "--no-merges",
            "--format=%s",
            "--",
            *paths,
        )
    return out.splitlines()


def recent_reviewers_for_files(command_context, relpaths):
    """Tally reviewers from recent commits touching the given files.

    Reviewers are parsed from the "r=" trailers of recent commit message
    subjects. Returns (individuals, groups) as produced by
    parse_reviewers_from_subjects.
    """
    try:
        repo = command_context.repository
        subjects = _recent_commit_subjects(repo, relpaths)
    except Exception as e:
        print(f"(could not read version control history: {e})", file=sys.stderr)
        return [], []

    return parse_reviewers_from_subjects(subjects)


def load_mots_config(topsrcdir):
    """Return the parsed in-tree mots configuration, or None if unreadable."""
    import yaml

    path = mozpath.join(topsrcdir, MOTS_CONFIG_PATH)
    try:
        with open(path, encoding="utf-8") as fh:
            return yaml.safe_load(fh)
    except (OSError, yaml.YAMLError) as e:
        print(f"(could not read {path}: {e})", file=sys.stderr)
        return None


def _mots_pattern_matches(pattern, path):
    if MOTS_EXTERNAL_PATTERN_RE.match(pattern):
        return False
    # A pattern naming a directory covers everything under it, which is what
    # mozpath.match does for a pattern matching an ancestor of the path.
    pattern = pattern.rstrip("/")
    # mozpath.match matches every path against an empty pattern, which would
    # give a module with a bogus pattern ownership of the whole tree.
    if not pattern:
        return False
    return mozpath.match(path, pattern)


def _mots_module_matches(module, relpaths, parent=None):
    """Return the subset of relpaths owned by a mots module or submodule.

    A submodule that declares no patterns of its own inherits those of its
    parent, per key: mots lets a submodule set only its includes and still be
    bound by the parent's excludes. A submodule that declares an empty list
    means it has none, and does not inherit the parent's.
    """

    def patterns(key):
        for source in (module, parent):
            if source is not None and source.get(key) is not None:
                return source[key]
        return []

    includes = patterns("includes")
    excludes = patterns("excludes")
    return {
        p
        for p in relpaths
        if any(_mots_pattern_matches(i, p) for i in includes)
        and not any(_mots_pattern_matches(e, p) for e in excludes)
    }


def mots_modules_for_files(config, relpaths):
    """Return the mots modules owning the given files.

    Each entry is a dict describing one matching module or submodule, with the
    paths it owns. A submodule that narrows its parent's scope takes precedence
    over it, mirroring how mots builds its directory index. Two kinds of
    submodule are skipped instead, since attributing paths to them would hide
    the parent's reviewer group without offering a better one:

    * those with no reviewer group of their own, which have no reviewer to
      contribute at all;
    * those declaring no patterns, which inherit all of their parent's scope and
      so say nothing about which paths they own.
    """
    entries = []
    paths_by_entry = {}
    entries_by_path = defaultdict(list)

    def add(module, paths):
        entries.append(module)
        paths_by_entry[id(module)] = paths
        for path in paths:
            entries_by_path[path].append(module)

    for module in config.get("modules") or []:
        owned = _mots_module_matches(module, relpaths)
        for submodule in module.get("submodules") or []:
            if not submodule.get("includes"):
                continue
            if not (submodule.get("meta") or {}).get("review_group"):
                continue
            paths = _mots_module_matches(submodule, relpaths, parent=module)
            owned -= paths
            if paths:
                add(submodule, paths)
        if owned:
            add(module, owned)

    # A module can declare that it defers paths it shares with other modules.
    dropped = set()
    for path, matching in entries_by_path.items():
        if len(matching) < 2:
            continue
        preferred = {id(m) for m in matching if not m.get("exclude_module_paths")}
        if not preferred:
            continue
        for module in matching:
            if id(module) in preferred:
                continue
            paths_by_entry[id(module)] = paths_by_entry[id(module)] - {path}
            if not paths_by_entry[id(module)]:
                dropped.add(id(module))

    result = []
    for module in entries:
        if id(module) in dropped:
            continue
        # meta.group is a mailing list, not a Phabricator reviewer group, so only
        # meta.review_group is a usable reviewer.
        review_group = (module.get("meta") or {}).get("review_group")
        result.append({
            "machine_name": module.get("machine_name", ""),
            "name": module.get("name", ""),
            "review_group": review_group or "",
            "paths": sorted(paths_by_entry[id(module)]),
        })

    return sorted(result, key=lambda m: (m["name"], m["machine_name"]))


def mots_groups_for_files(config, relpaths):
    """Return the reviewer groups of the mots modules owning the given files.

    Returns a dict mapping a group name to the names of the modules it reviews.
    Modules without a review group contribute nothing: only groups are
    suggested, never individual owners or peers.
    """
    groups = defaultdict(list)
    for module in mots_modules_for_files(config, relpaths):
        if module["review_group"]:
            groups[module["review_group"]].append(
                module["name"] or module["machine_name"]
            )

    return {group: sorted(names) for group, names in sorted(groups.items())}
