# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import importlib
import json
import os

import mozunit
import pytest

LINTER = "pnpm-audit"

KNOWN_ADVISORY = "GHSA-7p8r-x3mc-p8w7"

FILE_A_BUG = (
    "\n\nThis test runs against the live npm advisory database, which changes "
    "over time. This failure is most likely caused by the database changing "
    "rather than a regression in the pnpm-audit linter. Please file a new bug "
    "blocking bug 2065363 instead of backing out a push."
)


@pytest.fixture(scope="module")
def pnpm_audit():
    return importlib.import_module("pnpm-audit")


@pytest.fixture
def needs_pnpm(pnpm_audit):
    if not pnpm_audit.locate_pnpm():
        pytest.skip("pnpm is not available, run `mach lint -l pnpm-audit --setup`")


def test_lint_pnpm_audit_reports_a_known_advisory(lint, paths, needs_pnpm):
    test_file = os.path.join("vulnerable", "pnpm-lock.yaml")
    results = lint(paths(test_file))

    matched = [r for r in results if KNOWN_ADVISORY in r.message]
    assert matched, (
        f"{KNOWN_ADVISORY} was not reported for {test_file}, got "
        f"{[r.message.splitlines()[0] for r in results]}{FILE_A_BUG}"
    )
    assert matched[0].level == "error"
    assert "Depends on a vulnerable version of fast-uri." in matched[0].message
    assert "Patched versions: >=3.1.5" in matched[0].message

    for result in results:
        assert "vulnerable/pnpm-lock.yaml" in result.relpath


def test_lint_pnpm_audit_clean(lint, paths, needs_pnpm):
    test_file = os.path.join("clean", "pnpm-lock.yaml")
    results = lint(paths(test_file))

    assert not results, (
        f"Expected no advisories for {test_file}, but got "
        f"{len(results)}: {[r.message.splitlines()[0] for r in results]}"
        f"{FILE_A_BUG}"
    )


def test_severity_level_maps_high_and_critical_to_errors(pnpm_audit):
    assert pnpm_audit.severity_level("critical") == "error"
    assert pnpm_audit.severity_level("high") == "error"
    assert pnpm_audit.severity_level("moderate") == "warning"
    assert pnpm_audit.severity_level("low") == "warning"
    assert pnpm_audit.severity_level("info") == "warning"


def test_build_message_lists_the_dependency_paths(pnpm_audit):
    advisory = {
        "module_name": "fast-uri",
        "title": "fast-uri vulnerable to host confusion",
        "severity": "high",
        "github_advisory_id": KNOWN_ADVISORY,
        "vulnerable_versions": ">=3.0.0 <3.1.5",
        "patched_versions": ">=3.1.5",
        "findings": [
            {
                "version": "3.1.4",
                "paths": [f".>webpack>ajv{index}>fast-uri" for index in range(5)],
            }
        ],
    }

    message = pnpm_audit.build_message(advisory, verbose=False)

    assert "Installed versions: 3.1.4" in message
    assert ".>webpack>ajv0>fast-uri" in message
    assert ".>webpack>ajv4>fast-uri" not in message
    assert "and 2 more, re-run with -v to see them all" in message

    verbose = pnpm_audit.build_message(advisory, verbose=True)

    assert ".>webpack>ajv4>fast-uri" in verbose
    assert "and 2 more" not in verbose


def test_is_excluded_matches_on_a_substring(pnpm_audit):
    message = pnpm_audit.build_message(
        {
            "module_name": "fast-uri",
            "title": "fast-uri vulnerable to host confusion",
            "severity": "high",
        },
        verbose=False,
    )

    assert pnpm_audit.is_excluded(message, ["vulnerable version of fast-uri."])
    assert not pnpm_audit.is_excluded(message, ["vulnerable version of webpack."])


class FakeCompleted:
    def __init__(self, stdout, stderr="", returncode=1):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


def run_with_output(pnpm_audit, monkeypatch, stdout, returncode=1):
    monkeypatch.setattr(
        pnpm_audit.subprocess,
        "run",
        lambda *args, **kwargs: FakeCompleted(stdout, "", returncode),
    )
    return pnpm_audit.run_audit("node", "pnpm.cjs", "somewhere")


def test_run_audit_raises_when_the_registry_is_unreachable(pnpm_audit, monkeypatch):
    stdout = json.dumps({"error": {"code": "pnpm", "message": "fetch failed"}})

    with pytest.raises(RuntimeError) as raised:
        run_with_output(pnpm_audit, monkeypatch, stdout)

    assert "fetch failed" in str(raised.value)


def test_run_audit_raises_when_the_output_is_not_a_report(pnpm_audit, monkeypatch):
    with pytest.raises(RuntimeError) as raised:
        run_with_output(pnpm_audit, monkeypatch, json.dumps([]))

    assert "did not return a report" in str(raised.value)


def test_run_audit_raises_on_malformed_output(pnpm_audit, monkeypatch):
    with pytest.raises(RuntimeError) as raised:
        run_with_output(pnpm_audit, monkeypatch, "not json at all")

    assert "did not return JSON" in str(raised.value)


def test_run_audit_raises_without_an_advisories_section(pnpm_audit, monkeypatch):
    with pytest.raises(RuntimeError) as raised:
        run_with_output(pnpm_audit, monkeypatch, json.dumps({"metadata": {}}))

    assert "no advisories section" in str(raised.value)


def test_run_audit_accepts_a_clean_report(pnpm_audit, monkeypatch):
    stdout = json.dumps({"advisories": {}, "metadata": {}})

    report = run_with_output(pnpm_audit, monkeypatch, stdout, returncode=0)

    assert report["advisories"] == {}


def test_run_audit_keeps_advisories_reported_on_a_nonzero_exit(pnpm_audit, monkeypatch):
    advisories = {"1130720": {"module_name": "fast-uri", "severity": "high"}}
    stdout = json.dumps({"advisories": advisories, "metadata": {}})

    report = run_with_output(pnpm_audit, monkeypatch, stdout)

    assert report["advisories"]["1130720"]["module_name"] == "fast-uri"


if __name__ == "__main__":
    mozunit.main()
