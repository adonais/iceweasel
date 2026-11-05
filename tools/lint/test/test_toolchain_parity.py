# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import mozunit
import pytest

LINTER = "toolchain-parity"
PLATFORMS = (
    "linux64",
    "linux64-aarch64",
    "macosx64",
    "macosx64-aarch64",
    "win64",
    "win64-aarch64",
)
PARTIAL_PLATFORMS = ("linux64", "macosx64", "macosx64-aarch64", "win64")


@pytest.fixture(autouse=True)
def real_load_exclusions(monkeypatch, linter_module):
    """Isolate tests from the real (and evolving) exclusions.yml, handing
    back the un-stubbed loader for the one test that does want to read it.
    """
    original = linter_module._load_exclusions
    monkeypatch.setattr(linter_module, "_load_exclusions", dict)
    return original


def _task(kind, job_name, is_alias=False, source_file=None):
    label = f"{kind}-{job_name}"
    return label, {
        "label": f"{label}-original" if is_alias else label,
        "attributes": {
            "kind": kind,
            f"local-{kind}": True,
            "task-from": source_file,
        },
    }


def _patch_tasks(monkeypatch, tasks):
    monkeypatch.setattr(
        "mozbuild.toolchains.toolchain_task_definitions", lambda: dict(tasks)
    )


def test_full_coverage_not_flagged(global_lint, monkeypatch):
    tasks = [_task("toolchain", f"{p}-gecko-tool") for p in PLATFORMS]
    _patch_tasks(monkeypatch, tasks)
    assert global_lint([]) == []


def test_single_os_family_gap_not_flagged(global_lint, monkeypatch):
    # Only ever built on Linux hosts (e.g. a docker-only CI dependency) --
    # assumed intentional, not flagged.
    tasks = [
        _task("toolchain", "linux64-gecko-tool"),
        _task("toolchain", "linux64-aarch64-gecko-tool"),
    ]
    _patch_tasks(monkeypatch, tasks)
    assert global_lint([]) == []


def test_multi_os_family_gap_is_flagged(global_lint, monkeypatch):
    tasks = [_task("toolchain", f"{p}-gecko-tool") for p in PARTIAL_PLATFORMS]
    _patch_tasks(monkeypatch, tasks)
    results = global_lint([])
    assert len(results) == 1
    assert "gecko-tool" in results[0].message
    assert "win64-aarch64" in results[0].message
    assert "linux64-aarch64" in results[0].message


def test_alias_covered_gap_not_flagged(global_lint, monkeypatch):
    # toolchain_task_definitions() already expands toolchain-alias into a
    # synthetic entry for the aliased platform, completing the family.
    tasks = [
        _task("toolchain", "linux64-gecko-tool"),
        _task("toolchain", "linux64-aarch64-gecko-tool", is_alias=True),
        _task("toolchain", "macosx64-gecko-tool"),
        _task("toolchain", "macosx64-aarch64-gecko-tool"),
        _task("toolchain", "win64-gecko-tool"),
        _task("toolchain", "win64-aarch64-gecko-tool", is_alias=True),
    ]
    _patch_tasks(monkeypatch, tasks)
    assert global_lint([]) == []


def test_entirely_aliased_family_not_flagged(global_lint, monkeypatch):
    # e.g. "clang-toolchain" or bare "python": a convenience alias onto
    # whichever concrete version (clang-21/clang-22, python-3.9/python-3.11)
    # is currently the default. None of its platforms are directly defined,
    # so it isn't a real toolchain/fetch of its own -- the underlying
    # concrete families are checked independently instead.
    tasks = [
        _task("toolchain", "linux64-gecko-tool", is_alias=True),
        _task("toolchain", "macosx64-gecko-tool", is_alias=True),
        _task("toolchain", "macosx64-aarch64-gecko-tool", is_alias=True),
        _task("toolchain", "win64-gecko-tool", is_alias=True),
        # win64-aarch64 genuinely absent, but that shouldn't matter here.
    ]
    _patch_tasks(monkeypatch, tasks)
    assert global_lint([]) == []


def test_ignored_family_is_suppressed(global_lint, monkeypatch, linter_module):
    tasks = [_task("toolchain", f"{p}-gecko-tool") for p in PARTIAL_PLATFORMS]
    _patch_tasks(monkeypatch, tasks)
    monkeypatch.setattr(
        linter_module, "_load_exclusions", lambda: {("toolchain", "gecko-tool"): 1}
    )
    assert global_lint([]) == []


def test_ignore_list_is_scoped_by_kind(global_lint, monkeypatch, linter_module):
    # Ignoring ("toolchain", "thing") must not also suppress ("fetch", "thing").
    tasks = [
        _task(kind, f"{p}-thing")
        for kind in ("toolchain", "fetch")
        for p in PARTIAL_PLATFORMS
    ]
    _patch_tasks(monkeypatch, tasks)
    monkeypatch.setattr(
        linter_module, "_load_exclusions", lambda: {("toolchain", "thing"): 1}
    )
    results = global_lint([])
    assert len(results) == 1
    assert results[0].message.startswith("fetch 'thing'")


@pytest.mark.parametrize("kind", ("toolchain", "fetch"))
@pytest.mark.parametrize("source_file", (None, "gecko-tool.yml"))
def test_gap_location(global_lint, monkeypatch, kind, source_file):
    path = f"taskcluster/kinds/{kind}"
    if source_file:
        path = f"{path}/{source_file}"
    _patch_tasks(
        monkeypatch,
        [
            _task(kind, f"{p}-gecko-tool", source_file=path if source_file else None)
            for p in PARTIAL_PLATFORMS
        ],
    )
    results = global_lint([])
    assert len(results) == 1
    assert results[0].message.startswith(f"{kind} 'gecko-tool'")
    # mozlint normalizes issue paths to forward slashes on all platforms.
    assert results[0].path.endswith(path)


@pytest.mark.parametrize("job_name", ("windows-rs", "sysroot-aarch64-linux-gnu"))
def test_non_platform_prefixed_labels_are_ignored(global_lint, monkeypatch, job_name):
    # e.g. a single cross-platform source fetch like "windows-rs", or a
    # cross-compile target-triple name like "sysroot-aarch64-linux-gnu".
    tasks = [_task("fetch", job_name)]
    _patch_tasks(monkeypatch, tasks)
    assert global_lint([]) == []


@pytest.mark.parametrize("kind", ("toolchain", "fetch"))
@pytest.mark.parametrize("local", (True, False))
def test_unsupported_host_platform(global_lint, monkeypatch, kind, local):
    source = f"taskcluster/kinds/{kind}/samply.yml"
    label, task = _task(kind, "win32-samply", source_file=source)
    task["attributes"][f"local-{kind}"] = local
    _patch_tasks(
        monkeypatch,
        [
            *(_task(kind, f"{p}-samply") for p in PLATFORMS),
            (label, task),
        ],
    )
    results = global_lint([])
    if local:
        assert len(results) == 1
        assert "unsupported host platform 'win32'" in results[0].message
        assert results[0].path.endswith(source)
        assert f"local-{kind}: false" in results[0].hint
    else:
        assert results == []


@pytest.mark.parametrize("platforms", ((), PLATFORMS, PARTIAL_PLATFORMS))
def test_unsupported_platform_exclusion(
    global_lint, monkeypatch, linter_module, platforms
):
    _patch_tasks(
        monkeypatch, [_task("toolchain", f"{p}-samply") for p in (*platforms, "win32")]
    )
    monkeypatch.setattr(
        linter_module, "_load_exclusions", lambda: {("toolchain", "samply"): 1}
    )
    assert global_lint([]) == []


def test_unsupported_platform_exclusion_is_scoped_by_kind(
    global_lint, monkeypatch, linter_module
):
    _patch_tasks(
        monkeypatch, [_task(kind, "win32-samply") for kind in ("toolchain", "fetch")]
    )
    monkeypatch.setattr(
        linter_module, "_load_exclusions", lambda: {("toolchain", "samply"): 1}
    )
    results = global_lint([])
    assert len(results) == 1
    assert results[0].message.startswith("fetch-win32-samply ")


@pytest.mark.parametrize("kind", ("toolchain", "fetch"))
@pytest.mark.parametrize("excluded", (False, True))
@pytest.mark.parametrize("alias_first", (False, True))
def test_unsupported_platform_alias_is_not_reported_twice(
    global_lint, monkeypatch, linter_module, kind, excluded, alias_first
):
    label, task = _task(kind, "win32-node-22")
    task["attributes"][f"{kind}-alias"] = "win32-node"
    tasks = [(label, task), (f"{kind}-win32-node", task)]
    _patch_tasks(monkeypatch, tasks[::-1] if alias_first else tasks)
    if excluded:
        monkeypatch.setattr(
            linter_module, "_load_exclusions", lambda: {(kind, "node-22"): 1}
        )
    results = global_lint([])
    if excluded:
        assert results == []
    else:
        assert len(results) == 1
        assert results[0].message.startswith(f"{label} ")


@pytest.mark.parametrize("aliases", ("winappsdk-x86", ["winappsdk-x86"]))
def test_target_library_alias_is_allowed(global_lint, monkeypatch, aliases):
    label, task = _task("toolchain", "win32-WindowsAppSDK")
    task["attributes"]["toolchain-alias"] = aliases
    _patch_tasks(monkeypatch, [(label, task)])
    assert global_lint([]) == []


def test_stale_exclusion_on_closed_gap_is_flagged(
    global_lint, monkeypatch, linter_module
):
    # The family is now fully covered, so the exclusion no longer does
    # anything and should be cleaned up.
    tasks = [_task("toolchain", f"{p}-gecko-tool") for p in PLATFORMS]
    _patch_tasks(monkeypatch, tasks)
    monkeypatch.setattr(
        linter_module, "_load_exclusions", lambda: {("toolchain", "gecko-tool"): 1}
    )
    results = global_lint([])
    assert len(results) == 1
    assert "no longer has a platform gap" in results[0].message
    assert results[0].path.endswith("tools/lint/toolchain-parity/exclusions.yml")


def test_stale_exclusion_for_unknown_family_is_flagged(
    global_lint, monkeypatch, linter_module
):
    # A typo'd or since-renamed entry excludes nothing, and would silently
    # fail to suppress the gap it was meant to.
    _patch_tasks(monkeypatch, [])
    monkeypatch.setattr(
        linter_module, "_load_exclusions", lambda: {("toolchain", "no-such-tool"): 1}
    )
    results = global_lint([])
    assert len(results) == 1
    assert "no such family exists" in results[0].message


def test_stale_exclusion_reports_its_own_line(global_lint, monkeypatch, linter_module):
    # The lineno must point at the entry to delete, not the top of the file.
    _patch_tasks(monkeypatch, [])
    monkeypatch.setattr(
        linter_module, "_load_exclusions", lambda: {("toolchain", "upx"): 7}
    )
    results = global_lint([])
    assert len(results) == 1
    assert results[0].lineno == 7


def test_exclusions_are_loaded_with_their_line_numbers(
    real_load_exclusions, linter_module
):
    # Against the real exclusions.yml: every entry maps to the line it is
    # declared on, so that "drop this entry" points somewhere useful.
    exclusions = real_load_exclusions()
    assert exclusions, "expected the real exclusions.yml to be non-empty"
    with open(linter_module.EXCLUSIONS_PATH) as fh:
        lines = fh.read().splitlines()
    for (_kind, base_name), lineno in exclusions.items():
        assert lines[lineno - 1].strip() == f"- {base_name}"


def test_kinds_are_not_merged_across_families(global_lint, monkeypatch):
    # "thing" as a toolchain (fully covered) and "thing" as a fetch (same
    # base name, real gap) must be tracked independently -- the toolchain
    # variants must not mask the fetch gap, nor vice versa.
    tasks = [
        *(_task("toolchain", f"{p}-thing") for p in PLATFORMS),
        _task("fetch", "linux64-thing"),
        _task("fetch", "win64-thing"),
    ]
    _patch_tasks(monkeypatch, tasks)
    results = global_lint([])
    assert len(results) == 1
    assert results[0].message.startswith("fetch 'thing'")


if __name__ == "__main__":
    mozunit.main()
