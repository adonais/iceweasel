# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Check the packaged Gradle dependency cache against the inventories that
`--write-verification-metadata` leaves behind, so that an incomplete archive
fails here rather than much later, as a confusing resolution failure in a task
that fetched it.

Everything the inventories list is expected to be in the packaged tree, since
the enumeration passes resolve either through the local Nexus or from a
repository that is packaged as it stands. What comes from somewhere else, and
so is legitimately absent, is named by --unproxied.

This fails the task only for something that makes the packaged cache unusable:
a component in none of the repositories, a file missing from one that is
packaged, or a file whose contents do not match what was recorded. Each of those
becomes a resolution failure in a task that fetches the archive. Everything else
worth saying, an inventory that contradicts itself or an entry too malformed to
check, is a warning, because the archive still works and a red toolchain task
would cost more than it tells anyone.
"""

import argparse
import hashlib
import sys
import xml.etree.ElementTree as ET
from collections import namedtuple
from pathlib import Path

# Grown past what a bare tuple should carry, and callers want them by name.
Result = namedtuple("Result", "artifacts redirected unpackaged problems anomalies")

# What each kind of finding means, and what the reader should do about it. The
# three want different things, so they are reported apart rather than as one
# undifferentiated list.
GUIDANCE = {
    "absent": (
        "component",
        "{count} {noun} resolved by an enumeration pass, but in none of the "
        "packaged repositories",
        "If a repository this task does not package serves these, name its path "
        "prefix with --unproxied.",
    ),
    "missing": (
        "file",
        "{count} {noun} resolved from a component that is packaged, but not "
        "packaged along with it",
        "The archive is incomplete rather than wrong, which is the intermittent "
        "packaging fault this check exists to catch. Re-running the task usually "
        "produces a complete one.",
    ),
    "corrupt": (
        "file",
        "{count} packaged {noun} whose contents do not match the recorded checksum",
        "The archive is damaged rather than incomplete. Re-running the task "
        "usually produces a good one; if it does not, suspect the Nexus storage "
        "the packaging copies from.",
    ),
}


def local_name(tag):
    return tag.rpartition("}")[2]


def coordinates(component):
    group, name, version = component
    return f"{group}:{name}:{version}"


def relative_directory(component):
    group, name, version = component
    return Path(*group.split("."), name, version)


def parse_inventory(path):
    """Read one inventory into {component: {filename: {sha256, ...}}}.

    An artifact carries a set because the same one can be recorded more than
    once, by two passes or twice within a pass, and the records can disagree. A
    file matching any of them is the one Gradle resolved. `None` is in the set
    when a record carried no checksum, which leaves nothing to check but the
    file's existence.

    Returns the components and a list of anomalies: things worth saying out
    loud that do not themselves make the packaged cache unusable.
    """
    components = {}
    anomalies = []
    for element in ET.parse(path).getroot().iter():
        if local_name(element.tag) != "component":
            continue
        group = element.get("group")
        name = element.get("name")
        version = element.get("version")
        if not (group and name and version):
            anomalies.append(f"{path.name}: a component has no coordinates, skipped")
            continue

        artifacts = {}
        for artifact in element:
            if local_name(artifact.tag) != "artifact":
                continue
            filename = artifact.get("name")
            if not filename:
                anomalies.append(
                    f"{path.name}: {group}:{name}:{version} records an artifact "
                    "with no name, skipped"
                )
                continue
            checksum = next(
                (
                    child.get("value")
                    for child in artifact
                    if local_name(child.tag) == "sha256"
                ),
                None,
            )
            artifacts.setdefault(filename, set()).add(checksum)

        if artifacts:
            recorded = components.setdefault((group, name, version), {})
            for filename, checksums in artifacts.items():
                recorded.setdefault(filename, set()).update(checksums)
    return components, anomalies


def merge_inventories(paths):
    """Union the inventories, reporting what each one contributed.

    Each enumeration pass covers one Gradle build, and a component resolved by
    more than one pass only has to be packaged once.
    """
    merged = {}
    counts = {}
    anomalies = []
    for path in paths:
        components, found = parse_inventory(path)
        anomalies.extend(found)
        counts[path] = len(components)
        for component, artifacts in components.items():
            recorded = merged.setdefault(component, {})
            for filename, checksums in artifacts.items():
                recorded.setdefault(filename, set()).update(checksums)

    # Disagreeing records mean something served more than one file under one set
    # of coordinates. Only one of them can be packaged, and downstream resolves
    # whichever that is, so this is worth saying without failing the task over.
    for component, artifacts in merged.items():
        for filename, checksums in artifacts.items():
            if len({checksum for checksum in checksums if checksum}) > 1:
                anomalies.append(
                    f"{coordinates(component)} -> {filename} is recorded with "
                    "more than one checksum; any of them is accepted"
                )
    return merged, counts, anomalies


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def index_by_name(repositories):
    """Map file name to the paths it is packaged at, across every repository.

    A component's module metadata can name a file that a different module
    publishes: Gradle records guava's -jre jar under its -android component, and
    Kotlin Multiplatform modules redirect to a platform-specific module. The
    file is packaged, just not in the directory the component's own coordinates
    point at.

    A match here therefore says the bytes are in the archive under the module
    that publishes them, which is where a resolver following the same redirect
    will look, rather than that they are at this component's coordinates.
    """
    index = {}
    for repository in repositories:
        for path in repository.rglob("*"):
            if path.is_file():
                index.setdefault(path.name, []).append(path)
    return index


def is_unproxied(relative_dir, unproxied):
    """Whether a prefix names this component's directory or one above it.

    Matched a path component at a time, so that a prefix cannot exempt a
    longer-named sibling: org/mozilla/geckoview must not cover
    org/mozilla/geckoviewextra.
    """
    return any(
        Path(prefix) == relative_dir or Path(prefix) in relative_dir.parents
        for prefix in unproxied
    )


def verify(inventory, repositories, unproxied=()):
    problems = []
    unpackaged = []
    anomalies = []
    artifacts = 0
    redirected = 0
    packaged = None

    for component, expected in sorted(inventory.items()):
        relative_dir = relative_directory(component)

        # Downstream tasks are given every one of these as a repository, so an
        # artifact only has to be in one of them.
        directories = [
            repository / relative_dir
            for repository in repositories
            if (repository / relative_dir).is_dir()
        ]

        # Whether this task packages a component is a property of its
        # coordinates, not of what happens to be on disk, so the exemption is
        # taken before anything is looked for.
        if is_unproxied(relative_dir, unproxied):
            unpackaged.append(component)
            if directories:
                anomalies.append(
                    f"{coordinates(component)} is exempt from packaging but is "
                    "partly packaged anyway; the exemption may be stale"
                )
            continue

        if not directories:
            problems.append(("absent", component, relative_dir.as_posix()))
            continue

        checksums = None
        for filename, recorded in sorted(expected.items()):
            wanted = {checksum for checksum in recorded if checksum}
            found = next(
                (d / filename for d in directories if (d / filename).is_file()), None
            )
            if found:
                if wanted and sha256(found) not in wanted:
                    problems.append(("corrupt", component, str(found)))
                else:
                    artifacts += 1
                continue

            # Not where this component's coordinates point, so look for the
            # bytes elsewhere in the packaged tree: under the module that
            # publishes that file name, or under another name here.
            if packaged is None:
                packaged = index_by_name(repositories)
            elsewhere = [
                path
                for path in packaged.get(filename, [])
                if path.parent not in directories
            ]
            if wanted and any(sha256(path) in wanted for path in elsewhere):
                redirected += 1
                continue

            if checksums is None:
                checksums = {
                    sha256(path)
                    for directory in directories
                    for path in directory.iterdir()
                    if path.is_file()
                }
            if wanted & checksums:
                redirected += 1
            else:
                problems.append(("missing", component, filename))

    return Result(artifacts, redirected, unpackaged, problems, anomalies)


def report(problems):
    """Print the findings grouped by what went wrong, since what to do about an
    absent component and an incompletely packaged one are not the same.

    Treeherder's log parser surfaces a line containing "FATAL ERROR" and nothing
    else here, so that one line carries the tally and the rest of the detail is
    left for whoever opens the log.
    """
    by_kind = {
        kind: found
        for kind in GUIDANCE
        if (
            found := [
                (component, detail)
                for found_kind, component, detail in problems
                if found_kind == kind
            ]
        )
    }

    def counted(kind, found):
        noun = GUIDANCE[kind][0]
        return f"{len(found)} {noun}{'' if len(found) == 1 else 's'} {kind}"

    tally = ", ".join(counted(kind, found) for kind, found in by_kind.items())
    print(f"FATAL ERROR: the packaged dependency cache is incomplete: {tally}.")

    for kind, found in by_kind.items():
        noun, header, advice = GUIDANCE[kind]
        count = len(found)
        if count != 1:
            noun += "s"
        print("\n" + header.format(count=count, noun=noun) + ":")
        for component, detail in found:
            if kind == "absent":
                print(f"  {kind}: {coordinates(component)} (looked for {detail})")
            elif kind == "missing":
                print(f"  {kind}: {coordinates(component)} -> {detail}")
            else:
                print(f"  {kind}: {detail}")
        print(advice)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--inventories",
        required=True,
        type=Path,
        help="directory of verification-metadata.dryrun.xml files collected by "
        "`mach android gradle-dependencies`, one per enumeration pass",
    )
    parser.add_argument(
        "--unproxied",
        action="append",
        default=[],
        metavar="PREFIX",
        help="path prefix served by a repository this task does not package, so "
        "is expected to be absent from the packaged tree; repeatable",
    )
    parser.add_argument(
        "repository",
        nargs="+",
        type=Path,
        help="packaged repository directories to check, e.g. central google",
    )
    args = parser.parse_args()

    paths = sorted(args.inventories.glob("*.xml"))
    if not paths:
        print(
            f"FATAL ERROR: no inventories in {args.inventories}. Did the "
            "enumeration passes run?"
        )
        return 1

    # Otherwise a repository that moved would just stop contributing, and the
    # components it holds would be reported as absent from all of them.
    missing_repositories = [str(path) for path in args.repository if not path.is_dir()]
    if missing_repositories:
        print(
            f"FATAL ERROR: not a packaged repository: {', '.join(missing_repositories)}"
        )
        return 1

    # An empty prefix is every component's parent, so it would quietly excuse
    # the whole tree and leave nothing for this to check.
    if any(Path(prefix) == Path(".") for prefix in args.unproxied):
        print(
            "FATAL ERROR: --unproxied needs a path prefix. Drop the flag rather "
            "than passing an empty one, which would exempt every component."
        )
        return 1

    inventory, counts, anomalies = merge_inventories(paths)
    for path, count in counts.items():
        print(f"  {path.stem}: {count} components")
    if not inventory:
        print("FATAL ERROR: the inventories list no components at all.")
        return 1

    result = verify(inventory, args.repository, args.unproxied)

    # Not fatal by design: none of these makes the packaged cache unusable
    # downstream, and this task should only fail for something that does.
    for anomaly in anomalies + result.anomalies:
        print(f"  WARNING: {anomaly}")

    unverified = len(result.unpackaged) + len({
        component for _, component, _ in result.problems
    })
    print(
        f"verified {result.artifacts + result.redirected} artifacts across "
        f"{len(inventory) - unverified} of {len(inventory)} components "
        f"({result.redirected} found under the module that publishes them)"
    )
    for component in result.unpackaged:
        print(f"  not packaged, as expected: {coordinates(component)}")

    if result.problems:
        report(result.problems)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
