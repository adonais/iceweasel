# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import os
import re

import yaml
from mozbuild.configure.constants import tier_1_host_toolchain_prefixes
from mozlint import result

# The hosts we publish prebuilt toolchains for, which is what
# bootstrap_toolchain() (used to fetch them for local dev, e.g. from
# `mach lint`) matches a developer's machine against.
PLATFORMS = sorted(tier_1_host_toolchain_prefixes.values(), key=len, reverse=True)
OS_FAMILIES = {
    prefix: kernel for (_, _, kernel), prefix in tier_1_host_toolchain_prefixes.items()
}

# The two taskgraph kinds that use the "local-<kind>" attribute convention
# (see bootstrap_toolchain_tasks()'s `t["attributes"].get(f"local-{t['kind']}")`).
KINDS = ("toolchain", "fetch")
PLATFORM_PREFIX = re.compile(r"(?:linux|macosx|win)[0-9]+(?=-|$)")


def _split_platform(job_name):
    """Split a job name into (platform, base_name).

    Returns (None, job_name) if it doesn't start with one of the recognized
    host-platform prefixes, e.g. a cross-compile target-triple name, or a
    single job serving all platforms.
    """
    for platform in PLATFORMS:
        if job_name == platform or job_name.startswith(platform + "-"):
            return platform, job_name[len(platform) :].lstrip("-")
    return None, job_name


EXCLUSIONS_PATH = os.path.join(os.path.dirname(__file__), "exclusions.yml")
EXCLUSIONS_RELPATH = "tools/lint/toolchain-parity/exclusions.yml"


def _load_exclusions():
    """Map each (kind, base_name) family permanently exempted from this check
    to the line it is declared on, so that a stale entry can be reported on
    the line that needs deleting.

    See exclusions.yml for the policy on adding new entries.
    """
    with open(EXCLUSIONS_PATH) as fh:
        root = yaml.compose(fh)
    if root is None:
        return {}
    return {
        (kind.value, entry.value): entry.start_mark.line + 1
        for kind, base_names in root.value
        for entry in base_names.value
    }


def lint(paths, config, **lintargs):
    from mozbuild.toolchains import toolchain_task_definitions

    exclusions = _load_exclusions()
    results = []

    def report(path, lineno, message, hint):
        results.append(
            result.from_config(
                config,
                path=path,
                lineno=lineno,
                message=message,
                hint=hint,
                level="error",
            )
        )

    families = {}
    suppressed = set()
    for label, task in toolchain_task_definitions().items():
        kind = task["attributes"]["kind"]
        if kind not in KINDS or not task["attributes"].get(f"local-{kind}"):
            continue
        job_name = label[len(kind) + 1 :]
        platform, base_name = _split_platform(job_name)
        if platform is not None:
            families.setdefault((kind, base_name), {})[platform] = (label, task)
        elif match := PLATFORM_PREFIX.match(job_name):
            if label != task["label"]:
                continue
            aliases = task["attributes"].get(f"{kind}-alias") or []
            if isinstance(aliases, str):
                aliases = [aliases]
            # Target libraries can be bootstrapped through a non-host alias.
            if any(not PLATFORM_PREFIX.match(alias) for alias in aliases):
                continue
            base_name = job_name[match.end() :].lstrip("-")
            if (kind, base_name) in exclusions:
                suppressed.add((kind, base_name))
                continue
            report(
                path=task["attributes"].get("task-from")
                or os.path.join("taskcluster", "kinds", kind),
                lineno=0,
                message=f"{label} is marked local-{kind} but uses unsupported host platform '{match[0]}'",
                hint=f"Set local-{kind}: false on this task, or correct its platform prefix.",
            )

    for (kind, base_name), by_platform in sorted(families.items()):
        # Alias entries retain the original task's label.
        if all(task["label"] != label for label, task in by_platform.values()):
            continue
        if len({OS_FAMILIES[p] for p in by_platform}) < 2:
            continue
        missing = set(PLATFORMS) - by_platform.keys()
        if not missing:
            continue
        if (kind, base_name) in exclusions:
            suppressed.add((kind, base_name))
            continue
        source_files = {
            task["attributes"].get("task-from") for _, task in by_platform.values()
        } - {None, ""}
        report(
            path=min(source_files)
            if source_files
            else os.path.join("taskcluster", "kinds", kind),
            lineno=0,
            message=(
                f"{kind} '{base_name}' is missing variant(s) for: "
                f"{', '.join(sorted(missing))}"
            ),
            hint=(
                "Add the missing variant(s), or a toolchain-alias if an existing "
                "build already covers it (see "
                "taskcluster/kinds/toolchain/mozcheck.yml for an example); if "
                f"the gap is intentional, add an entry to {EXCLUSIONS_RELPATH} "
                "instead."
            ),
        )

    for kind, base_name in sorted(exclusions.keys() - suppressed):
        if (kind, base_name) in families:
            reason = "no longer has a platform gap"
            hint = "Drop this entry: the check passes without it."
        else:
            reason = "no such family exists"
            hint = (
                "Drop this entry, or correct the spelling if the family was "
                "renamed -- as written it excludes nothing."
            )
        report(
            path=EXCLUSIONS_RELPATH,
            lineno=exclusions[(kind, base_name)],
            message=f"{kind} '{base_name}' is excluded but {reason}",
            hint=hint,
        )

    return {"results": results, "fixed": 0}
