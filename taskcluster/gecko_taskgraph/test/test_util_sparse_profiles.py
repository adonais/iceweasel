# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from pathlib import Path

import pytest
from mozunit import main

from gecko_taskgraph import GECKO
from gecko_taskgraph.util.sparse_profiles import (
    git_checkout_is_full,
    is_path_covered_by_taskgraph_sparse_profile,
    list_directory_files,
    load_sparse_profile,
    to_git_sparse_patterns,
)

SPARSE_PROFILES_DIR = Path(GECKO, "build", "sparse-profiles")

FAKE_FILES = {
    "": ["mach", "#odd", "star*.txt", "trailing "],
    "js/src/tests": ["jstests.list", "lib.py"],
    "dir with space": ["a b.txt"],
    "empty": [],
    "newline": ["line\nbreak"],
}


def fake_list_files(directory):
    return FAKE_FILES[directory]


@pytest.mark.parametrize(
    "pattern,expected",
    [
        ("path:mach", ["/mach"]),
        ("path:python/", ["/python"]),
        ("path:testing/mozbase/", ["/testing/mozbase"]),
        ("path:foo[1]*.txt", [r"/foo\[1]\*.txt"]),
        ("path:#hash", ["/#hash"]),
        ("glob:**/moz.build", ["moz.build"]),
        ("glob:**/*.toml", ["*.toml"]),
        ("glob:**/#hash", [r"\#hash"]),
        ("glob:**/!bang", [r"\!bang"]),
        ("glob:**/-dash", ["-dash"]),
        ("glob:docs/**", ["/docs/"]),
        ("glob:testing/perfdocs/generated/**", ["/testing/perfdocs/generated/"]),
        ("glob:testing/web-platform/*.py", ["/testing/web-platform/*.py"]),
        ("glob:**/docs/**.jpg", ["**/docs/**/*.jpg"]),
        ("glob:**/tooltool-manifests/**", ["tooltool-manifests/"]),
        ("glob:gfx/**/*.rs", ["/gfx/**/*.rs"]),
        ("re:^[^/]+$", ["/mach", "/#odd", r"/star\*.txt", "/trailing\\ "]),
        (
            "re:^js/src/tests/[^/]+$",
            ["/js/src/tests/jstests.list", "/js/src/tests/lib.py"],
        ),
        ("re:^dir with space/[^/]+$", ["/dir with space/a b.txt"]),
    ],
)
def test_translate_include(pattern, expected):
    assert to_git_sparse_patterns([pattern], [], fake_list_files) == expected


@pytest.mark.parametrize(
    "includes,excludes,message",
    [
        (["python"], [], "has no kind"),
        (["rootfilesin:python"], [], "unsupported pattern kind"),
        (["re:^python/.*\\.py$"], [], "unsupported regular expression"),
        (["path:"], [], "unsupported path"),
        (["path:."], [], "unsupported path"),
        (["path:../other"], [], "unsupported path"),
        (["path:/python"], [], "unsupported path"),
        (["path:python//foo"], [], "unsupported path"),
        (["path:back\\slash"], [], "unsupported path"),
        (["glob:{a,b}/**"], [], "brace expansion"),
        (["glob:a**b"], [], "whole path segment"),
        (["glob:foo/**bar**"], [], "whole path segment"),
        (["glob:**/back\\slash"], [], "backslashes"),
        (["glob:"], [], "names something"),
        (["glob:/foo"], [], "names something"),
        (["glob:**"], [], "names something"),
        (["glob:**/"], [], "names something"),
        (["glob:foo//bar"], [], "names something"),
        (["re:^/foo/[^/]+$"], [], "unsupported path"),
        (["re:^foo//bar/[^/]+$"], [], "unsupported path"),
        (["re:^empty/[^/]+$"], [], "lists no files"),
        (["re:^newline/[^/]+$"], [], "cannot be written"),
        (["path:python"], ["path:python/foo"], "cannot be translated"),
    ],
)
def test_translate_rejects(includes, excludes, message):
    with pytest.raises(ValueError, match=message):
        to_git_sparse_patterns(includes, excludes, fake_list_files)


def test_order_kept_and_deduplicated():
    includes = [
        "path:python",
        "re:^[^/]+$",
        "glob:**/moz.build",
        "path:mach",
        "path:python",
    ]
    assert to_git_sparse_patterns(includes, [], fake_list_files) == [
        "/python",
        "/mach",
        "/#odd",
        r"/star\*.txt",
        "/trailing\\ ",
        "moz.build",
    ]


def test_empty_translation_rejected():
    with pytest.raises(ValueError, match="translates to no patterns"):
        to_git_sparse_patterns([], [], fake_list_files)


def test_list_directory_files():
    root = list_directory_files("")
    assert "mach" in root and "moz.build" in root and "python" not in root
    testing = list_directory_files("testing")
    assert "moz.build" in testing and "mozbase" not in testing


def test_load_follows_includes(tmp_path):
    (tmp_path / "base").write_text(
        "[include]\npath:mach\n\n[exclude]\npath:mach/foo\n", encoding="utf-8"
    )
    (tmp_path / "child").write_text(
        "# comment\n%include base\n\n[include]\nglob:**/moz.build\n[exclude]\n"
        "glob:**/*.pyc\n",
        encoding="utf-8",
    )
    includes, excludes = load_sparse_profile("child", topsrcdir=tmp_path)
    assert includes == ["path:mach", "glob:**/moz.build"]
    assert excludes == ["path:mach/foo", "glob:**/*.pyc"]


def test_load_reports_file_and_line(tmp_path):
    (tmp_path / "bad").write_text(
        "[include]\npath:mach\nre:^python/.*$\n", encoding="utf-8"
    )
    with pytest.raises(ValueError, match="^bad:3: unsupported regular expression"):
        load_sparse_profile("bad", topsrcdir=tmp_path)


def test_load_missing_profile(tmp_path):
    with pytest.raises(FileNotFoundError, match="'missing' not found"):
        load_sparse_profile("missing", topsrcdir=tmp_path)


@pytest.mark.parametrize(
    "content,message",
    [
        ("path:mach\n[include]\npath:bar\n", "^bad:1: entry outside of a section"),
        (
            "[exclude]\npath:foo\n[include]\npath:bar\n",
            "^bad:3: includes must come before",
        ),
        ("%include bad\n", "^bad: %include cycle: bad > bad"),
        ("%include ../outside\n", "lies outside"),
    ],
)
def test_load_rejects_like_mercurial(tmp_path, content, message):
    (tmp_path / "bad").write_text(content, encoding="utf-8")
    (tmp_path.parent / "outside").write_text("[include]\npath:x\n", encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        load_sparse_profile("bad", topsrcdir=tmp_path)


@pytest.mark.parametrize(
    "content,expected",
    [
        pytest.param("[include]\npath:mach\n", False, id="no_marker"),
        pytest.param("# git-checkout: full\n[include]\npath:mach\n", True, id="marker"),
        pytest.param("#git-checkout:full\n[include]\npath:mach\n", True, id="tight"),
        pytest.param(
            "# git-checkout: fully\n[include]\npath:mach\n", False, id="other_comment"
        ),
        pytest.param("%include heavy\n[include]\npath:mach\n", True, id="inherited"),
    ],
)
def test_git_checkout_is_full(tmp_path, content, expected):
    (tmp_path / "heavy").write_text(
        "# git-checkout: full\n[include]\npath:x\n", encoding="utf-8"
    )
    (tmp_path / "profile").write_text(content, encoding="utf-8")
    assert git_checkout_is_full("profile", topsrcdir=tmp_path) is expected


def test_in_tree_profiles_marked_full_on_git():
    marked = {
        p.name
        for p in SPARSE_PROFILES_DIR.iterdir()
        if git_checkout_is_full(f"build/sparse-profiles/{p.name}")
    }
    assert marked == {
        "push-to-try",
        "sphinx-docs",
        "taskgraph",
        "toolchain-build",
        "webrender",
    }


def test_load_allows_diamond_includes(tmp_path):
    (tmp_path / "base").write_text("[include]\npath:mach\n", encoding="utf-8")
    (tmp_path / "left").write_text("%include base\n", encoding="utf-8")
    (tmp_path / "top").write_text("%include base\n%include left\n", encoding="utf-8")
    assert load_sparse_profile("top", topsrcdir=tmp_path) == (
        ["path:mach", "path:mach"],
        [],
    )


@pytest.mark.parametrize(
    "profile", sorted(p.name for p in SPARSE_PROFILES_DIR.iterdir())
)
def test_in_tree_profiles_translate(profile):
    includes, excludes = load_sparse_profile(f"build/sparse-profiles/{profile}")
    patterns = to_git_sparse_patterns(includes, excludes, list_directory_files)
    assert patterns
    for pattern in patterns:
        assert pattern and pattern[0] not in ("!", "#"), pattern
        assert not pattern.endswith("**"), pattern
        if pattern.startswith("**/"):
            assert "/" in pattern[3:].rstrip("/"), pattern


@pytest.mark.parametrize(
    "path,covered",
    [
        ("taskcluster/kinds/build/kind.yml", True),
        ("browser/config/version.txt", True),
        ("dom/base/moz.build", True),
        ("dom/base/nsDocument.cpp", False),
    ],
)
def test_taskgraph_profile_coverage(path, covered):
    assert is_path_covered_by_taskgraph_sparse_profile(path) is covered


if __name__ == "__main__":
    main()
