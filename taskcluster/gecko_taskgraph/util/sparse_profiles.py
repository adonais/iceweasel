# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import functools
import re
from pathlib import Path

from taskgraph.util.vcs import get_repository

from gecko_taskgraph import GECKO

_DIRECTORY_LISTING_RE = re.compile(r"^\^(?:(?P<dir>[^\\^$*+?()|\[\]]+)/)?\[\^/\]\+\$$")
_GIT_PATTERN_METACHARS_RE = re.compile(r"([*?\[\\])")
_GIT_FULL_CHECKOUT_RE = re.compile(r"#\s*git-checkout:\s*full$")


def _escape(name):
    if any(c in name for c in "\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029"):
        raise ValueError(f"file name {name!r} cannot be written as a git pattern")
    escaped = _GIT_PATTERN_METACHARS_RE.sub(r"\\\1", name)
    if escaped.endswith(" "):
        escaped = f"{escaped[:-1]}\\ "
    return escaped


def _escape_leading(pattern):
    return f"\\{pattern}" if pattern[:1] in ("#", "!") else pattern


def _repository_path(value, pattern):
    parts = value.rstrip("/").split("/")
    if (
        "\\" in value
        or value.startswith("/")
        or any(p in ("", ".", "..") for p in parts)
    ):
        raise ValueError(
            f"unsupported path in {pattern!r}: use a repository relative path "
            "with forward slashes"
        )
    return "/".join(parts)


def _glob_to_git(glob):
    if "{" in glob or "}" in glob:
        raise ValueError(f"unsupported glob {glob!r}: brace expansion has no git form")
    if "\\" in glob:
        raise ValueError(f"unsupported glob {glob!r}: backslashes have no git form")
    stripped = glob.rstrip("/")
    if (
        not stripped
        or stripped == "**"
        or glob.startswith("/")
        or "" in stripped.split("/")
    ):
        raise ValueError(
            f"unsupported glob {glob!r}: use a repository relative glob that "
            "names something"
        )
    segments = []
    for segment in stripped.split("/"):
        if "**" in segment and segment != "**":
            head, _, tail = segment.partition("**")
            if head or "**" in tail:
                raise ValueError(
                    f"unsupported glob {glob!r}: '**' must be a whole path "
                    "segment or lead one"
                )
            segments.extend(["**", f"*{tail}"])
        else:
            segments.append(segment)
    trailing = ""
    if len(segments) > 1 and segments[-1] == "**":
        segments.pop()
        trailing = "/"
    if segments[0] == "**" and len(segments) == 2:
        return _escape_leading(f"{segments[1]}{trailing}")
    pattern = "/".join(segments) + trailing
    if segments[0] != "**":
        pattern = f"/{pattern}"
    return pattern


def _parse(pattern):
    """Check one profile line and return its kind with the value in git form:
    an anchored path, a git glob, or the directory a listing names."""
    kind, sep, value = pattern.partition(":")
    if not sep:
        raise ValueError(f"pattern {pattern!r} has no kind, use path:, glob: or re:")
    if kind == "path":
        return kind, f"/{_escape(_repository_path(value, pattern))}"
    if kind == "glob":
        return kind, _glob_to_git(value)
    if kind == "re":
        match = _DIRECTORY_LISTING_RE.match(value)
        if not match:
            raise ValueError(
                f"unsupported regular expression {value!r}: only ^[^/]+$ and "
                "^<dir>/[^/]+$ have a git form"
            )
        return kind, _repository_path(match["dir"], pattern) if match["dir"] else ""
    raise ValueError(f"unsupported pattern kind {kind!r} in {pattern!r}")


def _translate(pattern, list_files):
    kind, value = _parse(pattern)
    if kind != "re":
        return [value]
    prefix = f"/{value}/" if value else "/"
    names = list(list_files(value))
    if not names:
        raise ValueError(f"{pattern!r} lists no files at this revision")
    return [f"{prefix}{_escape(name)}" for name in names]


def load_sparse_profile(profile_path, topsrcdir=GECKO):
    """Return the ordered ``(includes, excludes)`` pattern lines of a Mercurial
    sparse profile, following ``%include`` directives. Every line is checked
    against the subset that translates to git, and a line outside it raises
    ``ValueError`` naming the file and line number."""
    includes, excludes, _ = _load_sparse_profile(profile_path, topsrcdir)
    return includes, excludes


def git_checkout_is_full(profile_path, topsrcdir=GECKO):
    """Return whether the profile, or one it includes, carries the comment line
    ``# git-checkout: full``, which asks git tasks to check out the whole tree.
    A profile whose patterns match files all over the tree fetches their blobs
    one by one and ends up slower than a full clone, while Mercurial, which
    already holds every file, only writes fewer of them."""
    return _load_sparse_profile(profile_path, topsrcdir)[2]


def _load_sparse_profile(profile_path, topsrcdir):
    includes = []
    excludes = []
    marked_full = []
    root = Path(topsrcdir).resolve()
    stack = []

    def parse(relpath):
        full_path = (root / relpath).resolve()
        if root not in full_path.parents:
            raise ValueError(f"{relpath}: sparse profile lies outside {topsrcdir}")
        if not full_path.exists():
            raise FileNotFoundError(
                f"Sparse profile '{full_path.stem}' not found at {full_path}"
            )
        if relpath in stack:
            raise ValueError(
                f"{relpath}: %include cycle: {' > '.join(stack + [relpath])}"
            )
        stack.append(relpath)
        section = None
        lines = full_path.read_text(encoding="utf-8").splitlines()
        for lineno, raw_line in enumerate(lines, 1):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                if _GIT_FULL_CHECKOUT_RE.match(line):
                    marked_full.append(relpath)
                continue
            if line.startswith("%include "):
                parse(line[len("%include ") :].strip())
            elif line == "[include]":
                if section is excludes:
                    raise ValueError(
                        f"{relpath}:{lineno}: includes must come before excludes"
                    )
                section = includes
            elif line == "[exclude]":
                section = excludes
            elif section is None:
                raise ValueError(
                    f"{relpath}:{lineno}: entry outside of a section: {line}"
                )
            else:
                try:
                    _parse(line)
                except ValueError as e:
                    raise ValueError(f"{relpath}:{lineno}: {e}") from None
                section.append(line)
        stack.pop()

    parse(profile_path)
    return includes, excludes, bool(marked_full)


def to_git_sparse_patterns(includes, excludes, list_files):
    """Translate Mercurial sparse profile lines into ``git sparse-checkout``
    patterns for ``--no-cone`` mode. ``list_files(directory)`` names the files
    directly inside a directory (``""`` for the root) and expands the
    ``re:^dir/[^/]+$`` listings. Every result is a positive pattern, so the
    patterns of two profiles can be combined by appending one to the other."""
    if excludes:
        raise ValueError(
            "[exclude] sections cannot be translated: a git sparse checkout is "
            "only ever widened, so an exclusion could not be honoured once a "
            "cache holds the files"
        )
    patterns = []
    for pattern in includes:
        patterns.extend(_translate(pattern, list_files))
    if not patterns:
        raise ValueError("the profile translates to no patterns")
    return list(dict.fromkeys(patterns))


@functools.cache
def _repository():
    return get_repository(GECKO)


@functools.cache
def list_directory_files(directory):
    """Return the names of the files directly inside ``directory`` (``""`` for
    the root) at the checked out revision. The list comes from the repository
    rather than the working copy, so a sparse checkout does not hide any."""
    repo = _repository()
    if repo.tool == "hg":
        out = repo.run(
            "--encoding",
            "utf-8",
            "files",
            "-r",
            ".",
            "-0",
            "-I",
            f"rootfilesin:{directory or '.'}",
            return_codes=[1],
        )
        paths = [p.replace("\\", "/") for p in out.split("\0") if p]
    else:
        args = ["ls-tree", "-z", "HEAD"]
        if directory:
            args.append(f"{directory}/")
        paths = [
            entry.split("\t", 1)[1]
            for entry in repo.run(*args).split("\0")
            if entry and entry.split("\t", 1)[0].split(" ")[1] == "blob"
        ]
    return sorted(p.rsplit("/", 1)[-1] for p in paths)


@functools.cache
def _get_taskgraph_sparse_profile():
    """
    Parse the taskgraph sparse profile and return the paths and globs it includes.
    """
    includes, _ = load_sparse_profile("build/sparse-profiles/taskgraph")
    paths = {
        Path(line[len("path:") :].strip())
        for line in includes
        if line.startswith("path:")
    }
    globs = {
        line[len("glob:") :].strip() for line in includes if line.startswith("glob:")
    }
    return paths, globs


@functools.cache
def is_path_covered_by_taskgraph_sparse_profile(path):
    """
    Check if a given path would be included in the taskgraph sparse checkout.
    """
    profile_paths, profile_globs = _get_taskgraph_sparse_profile()
    path = Path(path)

    for profile_path in profile_paths:
        if path == profile_path or profile_path in path.parents:
            return True

    # Path.match requires at least one directory for ** patterns to match
    # root-level files, so we prepend a fake parent directory
    path_with_parent = Path("_", path)
    for pattern in profile_globs:
        if path_with_parent.match(pattern):
            return True

    return False
