# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Generate a CycloneDX software bill of materials for the configured tree.

``generate_file`` is the GENERATED_FILES entry point the build uses, so the
document is produced from the objdir that built the product, by the same build
graph that produces everything else. `mach sbom` calls ``generate()``, which is
also how an unconfigured tree gets the moz.yaml-only subset.
"""

import os
import sys


class SbomError(Exception):
    """A condition that must not silently shrink the document."""


def build_document(
    topsrcdir,
    topobjdir,
    repo,
    substs=None,
    version=None,
    product_name=None,
    strict=False,
    log=None,
):
    """Return the SBOM as a JSON string.

    ``topobjdir`` may name a directory that holds no licenses.json, in which
    case the document is built from the moz.yaml manifests alone. ``substs``
    is empty for an unconfigured tree. Raises ``SbomError`` where ``strict``
    asks for a hard failure.
    """
    from mozbuild.vendor.sbom import (
        collect_records,
        components_for_unmatched,
        load_license_notices,
        merge_license_notices,
        unattached_notices,
    )
    from mozbuild.vendor.sbom_cargo import collect_dependency_kinds, crate_records
    from mozbuild.vendor.sbom_cyclonedx import build_bom, to_json, utc_timestamp

    substs = substs or {}
    log = log or (lambda message: None)

    records, errors = collect_records(repo, topsrcdir, log=log)
    if errors and strict:
        raise SbomError(f"{len(errors)} manifest(s) failed to load.")

    # Cargo.lock describes third_party/rust exactly: versions, checksums and
    # the crate-to-crate graph, none of which moz.yaml has. `cargo metadata`
    # adds what Cargo.lock cannot express: whether a crate is reached as a
    # normal, a build or a dev dependency, and so whether it ships at all.
    kinds = collect_dependency_kinds(topsrcdir, topobjdir, substs.get("CARGO"), log=log)
    crates, dependencies = crate_records(topsrcdir, kinds=kinds)
    records.extend(crates)

    if kinds:
        shipped = sum(1 for c in crates if {"normal", "build"} & set(c["kinds"]))
        dev_only = sum(1 for c in crates if c["kinds"] == ["dev"])
        log(
            f"{len(crates)} crates: {shipped} built into the product, "
            f"{dev_only} test-only, "
            f"{len(crates) - shipped - dev_only} not reached by cargo metadata.",
        )
    else:
        log(
            "cargo metadata unavailable; crate dependency kinds not collected.",
        )

    # The build backend writes this from the tree-wide moz.build LICENSES
    # declarations. It is absent in an unconfigured tree, in which case the
    # SBOM is built from moz.yaml alone.
    notices = load_license_notices(os.path.join(topobjdir, "licenses.json"))
    if notices:
        merge_license_notices(records, notices)
        # Licensed code with no moz.yaml still has to appear, or the SBOM would
        # describe less than about:license does.
        records.extend(
            components_for_unmatched(
                records,
                notices,
                lambda path: os.path.isfile(os.path.join(topsrcdir, path)),
            )
        )
        product_notices = unattached_notices(records, notices)
    else:
        product_notices = []
        log(
            "licenses.json not found; run ./mach build-backend for license data.",
        )

    # MOZ_APP_BASENAME, not MOZ_APP_DISPLAYNAME: the display name is the
    # branding, which is "Firefox" for both desktop and Android official builds
    # and moves with the channel otherwise. The basename is "Firefox" or
    # "Fennec", which is the distinction the SBOM needs.
    if product_name is None:
        product_name = substs.get("MOZ_APP_BASENAME") or "Firefox"

    if version is None:
        version = substs.get("MOZ_APP_VERSION_DISPLAY") or substs.get("MOZ_APP_VERSION")
    if version is None:
        with open(
            os.path.join(topsrcdir, "browser", "config", "version_display.txt"),
            encoding="utf-8",
        ) as version_file:
            version = version_file.read().strip()

    # head_rev, not head_ref: the latter is a branch name under git, which
    # would make the BOM serial number move with the branch.
    source_revision = repo.head_rev

    # Default to the head commit time rather than the wall clock, so that two
    # runs over the same checkout produce byte-identical output.
    # SOURCE_DATE_EPOCH wins where release engineering sets it.
    source_date_epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if source_date_epoch:
        try:
            commit_time = int(source_date_epoch)
        except ValueError:
            raise SbomError(
                "SOURCE_DATE_EPOCH must be an integer number of seconds since "
                f"the epoch, not {source_date_epoch!r}."
            )
    else:
        # A source tarball has no VCS, so no commit time to fall back on.
        commit_time = repo.get_commit_time() or 0
    timestamp = utc_timestamp(commit_time)

    unrecognized = []
    records.sort(key=lambda record: record["bom_ref"])

    bom = build_bom(
        records,
        version,
        source_revision,
        timestamp,
        product_notices,
        product_name=product_name,
        dependencies=dependencies,
        unrecognized=unrecognized,
    )
    document = to_json(bom)

    if unrecognized:
        log(
            f"{len(unrecognized)} license value(s) are neither an SPDX id nor "
            "an expression and are recorded as free text: "
            f"{', '.join(sorted(set(unrecognized)))}."
        )
    log(
        f"{len(records)} components ({len(crates)} crates, "
        f"{len(notices)} license notices).",
    )
    return document


def generate(
    topsrcdir,
    topobjdir,
    repo,
    substs=None,
    output=None,
    version=None,
    product_name=None,
    strict=False,
):
    """Write the SBOM to ``output``, or to stdout. Returns a process exit code."""

    def log(message):
        print(message, file=sys.stderr)

    try:
        document = build_document(
            topsrcdir,
            topobjdir,
            repo,
            substs=substs,
            version=version,
            product_name=product_name,
            strict=strict,
            log=log,
        )
    except SbomError as error:
        log(str(error))
        return 1

    if output:
        with open(output, "w", encoding="utf-8", newline="\n") as output_file:
            output_file.write(document)
        log(f"Wrote the SBOM to {output}.")
    else:
        sys.stdout.write(document)

    return 0


def generate_file(output):
    """GENERATED_FILES entry point, wired up from the top-level moz.build.

    Strict: a moz.yaml the SBOM cannot parse is a hole in the document, and a
    build that ships one should fail rather than describe less than it ships.
    """
    import buildconfig
    from mozversioncontrol import get_repository_object

    def log(message):
        print(message, file=sys.stderr)

    output.write(
        build_document(
            buildconfig.topsrcdir,
            buildconfig.topobjdir,
            get_repository_object(buildconfig.topsrcdir),
            substs=buildconfig.substs,
            strict=True,
            log=log,
        )
    )
