# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import json
import os
import subprocess

from mozbuild.nodeutil import find_node_executable
from mozlint import result
from mozlint.pathutils import expand_exclusions

ERROR_SEVERITIES = ("critical", "high")

SHOWN_PATHS = 3

NO_NODE_MESSAGE = """
Could not find a node executable. Run `mach bootstrap` and try again.
""".strip()

NO_PNPM_MESSAGE = """
Could not find or bootstrap pnpm. Check the output above and try again.
""".strip()

REGISTRY_MESSAGE = """
This usually means pnpm could not reach the npm registry to download the
advisory database, which evolves independently of this repository. Please file
a new bug blocking bug 2065363 instead of backing out a push.
""".strip()


def to_str_paths(finding, verbose):
    paths = finding.get("paths") or []
    if not paths:
        return ""

    shown = paths if verbose else paths[:SHOWN_PATHS]
    lines = [f"\n  {path}" for path in shown]
    remaining = len(paths) - len(shown)
    if remaining:
        lines.append(f"\n  and {remaining} more, re-run with -v to see them all")
    return "\nDependency paths:" + "".join(lines)


def build_message(advisory, verbose):
    module = advisory["module_name"]
    message = f"Depends on a vulnerable version of {module}."

    message += f"\n\nAdvisory:\n{advisory['title']}"
    message += f"\nPackage: {module}"

    identifier = advisory.get("github_advisory_id") or advisory.get("id")
    if identifier:
        message += f"\nID: {identifier}"

    message += f"\nSeverity: {advisory['severity']}"

    cwe = advisory.get("cwe")
    if cwe:
        message += f"\nCWE: {cwe}"

    url = advisory.get("url")
    if url:
        message += f"\nURL: {url}"

    findings = advisory.get("findings") or []
    installed = sorted({
        finding["version"] for finding in findings if "version" in finding
    })
    if installed:
        message += f"\n\nInstalled versions: {', '.join(installed)}"

    for key, label in (
        ("vulnerable_versions", "Vulnerable versions"),
        ("patched_versions", "Patched versions"),
    ):
        if advisory.get(key):
            message += f"\n{label}: {advisory[key]}"

    for finding in findings:
        message += to_str_paths(finding, verbose)

    return message


def severity_level(severity):
    return "error" if severity in ERROR_SEVERITIES else "warning"


def build_issue(config, path, message, level):
    return result.from_config(
        config,
        **{
            "path": path,
            "message": message,
            "lineno": -1,
            "column": -1,
            "level": level,
        },
    )


def is_excluded(message, exclusions):
    return any(exclusion in message for exclusion in exclusions)


def locate_pnpm():
    from mozbuild.bootstrap import bootstrap_toolchain

    return bootstrap_toolchain("pnpm/bin/pnpm.cjs")


def audit_failed(args, completed, reason):
    message = [
        f"pnpm audit {reason} (exit code {completed.returncode}) while running:",
        "  " + " ".join(args),
    ]
    for name, stream in (("stdout", completed.stdout), ("stderr", completed.stderr)):
        if stream.strip():
            message.append(f"\n{name}:")
            message.append(stream.rstrip())
    message.append(f"\n{REGISTRY_MESSAGE}")
    return RuntimeError("\n".join(message))


def run_audit(node, pnpm, directory):
    args = [node, pnpm, "audit", "--json", "--dir", directory]
    completed = subprocess.run(
        args,
        capture_output=True,
        text=True,
        check=False,
    )

    try:
        report = json.loads(completed.stdout)
    except json.JSONDecodeError:
        raise audit_failed(args, completed, "did not return JSON")

    if not isinstance(report, dict):
        raise audit_failed(args, completed, "did not return a report")

    error = report.get("error")
    if error:
        detail = error.get("message", error) if isinstance(error, dict) else error
        raise audit_failed(args, completed, f"reported an error, {detail}")

    if not isinstance(report.get("advisories"), dict):
        raise audit_failed(args, completed, "returned no advisories section")

    return report


def lint(paths, config, log, **lintargs):
    node, _ = find_node_executable()
    if not node:
        raise RuntimeError(NO_NODE_MESSAGE)

    pnpm = locate_pnpm()
    if not pnpm:
        raise RuntimeError(NO_PNPM_MESSAGE)

    verbose = lintargs.get("show_verbose", False)
    exclusions = config.get("exclude-error", [])

    results = []
    for path in expand_exclusions(paths, config, lintargs["root"]):
        report = run_audit(node, pnpm, os.path.dirname(path))

        for advisory in report["advisories"].values():
            message = build_message(advisory, verbose)
            if is_excluded(message, exclusions):
                continue
            level = severity_level(advisory["severity"])
            results.append(build_issue(config, path, message, level))

    return results


def setup(root, log, **lintargs):
    node, _ = find_node_executable()
    if not node:
        log.error(NO_NODE_MESSAGE)
        return 1

    if not locate_pnpm():
        log.error(NO_PNPM_MESSAGE)
        return 1

    return 0
