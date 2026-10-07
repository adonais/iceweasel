# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Map Cargo.lock onto SBOM records (see sbom.py for the record shape).

The Rust dependencies are the one part of the tree that already knows its own
dependency graph, its exact versions and, for registry crates, a checksum of
the published artifact. moz.yaml knows none of that: `third_party/rust` is
vendored wholesale, so without this the crates appear only as whatever
about:license attributes to them.

Like sbom.py this module does not import cyclonedx, so the mapping rules can be
unit tested from sites that do not vendor it.
"""

import collections
import json
import os
import subprocess

import mozpack.path as mozpath
import toml

VENDOR_DIR = "third_party/rust"

# The crates.io index. Anything else is a git dependency, whose version is the
# crate's own and therefore not a crates.io release.
REGISTRY_SOURCE = "registry+https://github.com/rust-lang/crates.io-index"


def parse_cargo_lock(path):
    """Return the third-party packages of a Cargo.lock, keyed by (name, version).

    Workspace members have no ``source`` and are dropped: they are Firefox's
    own crates, not third-party code, and the graph reads the same without
    them because every crate they pull in becomes a root of the forest.
    """
    document = toml.load(path)
    return {
        (package["name"], package["version"]): package
        for package in document.get("package", [])
        if package.get("source")
    }


def _resolve(dependency, packages, by_name):
    """Resolve one Cargo.lock dependency string to a package key.

    Cargo writes a bare ``name`` when the name is unambiguous and
    ``name version`` when several versions coexist.
    """
    parts = dependency.split()
    name = parts[0]
    if len(parts) > 1:
        return (name, parts[1]) if (name, parts[1]) in packages else None
    candidates = by_name.get(name, ())
    return candidates[0] if len(candidates) == 1 else None


def _vendored_metadata(topsrcdir, name):
    """Read the vendored crate's own Cargo.toml, as (package table, error).

    Cargo.lock carries no license, description or URL, so the manifest
    `mach vendor rust` checked in next to the code is the only source for them.
    A manifest that does not parse yields an error rather than an empty table:
    dropped silently, it would leave the SBOM reporting a crate that carries no
    license at all.
    """
    manifest = mozpath.join(topsrcdir, VENDOR_DIR, name, "Cargo.toml")
    if not os.path.exists(manifest):
        return {}, None
    try:
        return toml.load(manifest).get("package", {}), None
    except (OSError, UnicodeDecodeError, toml.TomlDecodeError) as error:
        return {}, str(error)


def _purl(package):
    qualifiers = {}
    if package["source"] != REGISTRY_SOURCE:
        qualifiers["vcs_url"] = package["source"]
    return ("cargo", None, package["name"], package["version"], qualifiers)


def dependency_kinds(metadata):
    """Map each third-party package of a `cargo metadata` document to its kinds.

    A crate is reached from the workspace as a normal, a build or a dev
    dependency, and only the first two end up in the product: `mockall` and
    `expect-test` are as vendored as `serde` but ship in nothing. Cargo.lock
    cannot answer this -- it is the flat union of all three -- so the kinds
    come from `cargo metadata`, whose resolve graph labels every edge.

    Returns {(name, version): sorted kinds}. A crate reached both ways carries
    both, which is the common case for something used in tests as well.
    """
    packages = {package["id"]: package for package in metadata["packages"]}
    nodes = {node["id"]: node for node in metadata["resolve"]["nodes"]}

    def edges(node_id):
        for dep in nodes[node_id]["deps"]:
            for dep_kind in dep["dep_kinds"]:
                yield dep["pkg"], dep_kind.get("kind") or "normal"

    queue = collections.deque()
    for member in metadata["workspace_members"]:
        queue.extend(edges(member))

    kinds = collections.defaultdict(set)
    seen = set()
    while queue:
        package_id, kind = queue.popleft()
        if (package_id, kind) in seen or package_id not in nodes:
            continue
        seen.add((package_id, kind))
        kinds[package_id].add(kind)
        for target, target_kind in edges(package_id):
            # A dependency's own dev-dependencies are never built, so the walk
            # stops there rather than dragging a whole test-only subtree in.
            if target_kind != "dev":
                queue.append((target, kind))

    return {
        (packages[package_id]["name"], packages[package_id]["version"]): sorted(values)
        for package_id, values in kinds.items()
        if packages[package_id].get("source")
    }


def collect_dependency_kinds(topsrcdir, topobjdir=None, cargo=None, log=None):
    """Run `cargo metadata` and reduce it to dependency kinds.

    ``cargo`` is the configuration's CARGO subst; automation has no bare
    `cargo` on PATH, so falling back to one only helps an unconfigured tree.

    Returns {} when the answer is not available rather than failing: the
    vendored-source replacement lives in the objdir's generated cargo config,
    so an unconfigured tree, a source tarball or a checkout with no cargo
    installed simply has no kinds to report. Each of those reasons is reported
    through ``log``, so an empty result is never just silence -- a cargo that
    fails and a cargo that is missing are not the same news.
    """

    def report(message):
        if log:
            log(f"cargo metadata: {message}")

    environment = dict(os.environ)
    if topobjdir:
        cargo_home = mozpath.join(topobjdir, ".cargo")
        if not os.path.isdir(cargo_home):
            report(
                f"{cargo_home} does not exist, so the vendored sources are "
                "not configured"
            )
            return {}
        environment["CARGO_HOME"] = cargo_home

    try:
        output = subprocess.run(
            [cargo or "cargo", "metadata", "--format-version", "1", "--offline"],
            cwd=topsrcdir,
            env=environment,
            capture_output=True,
            check=True,
            text=True,
        ).stdout
    except OSError as error:
        report(f"cannot run {cargo or 'cargo'}: {error}")
        return {}
    except subprocess.CalledProcessError as error:
        report(f"exited {error.returncode}: {(error.stderr or '').strip()}")
        return {}

    try:
        return dependency_kinds(json.loads(output))
    except (ValueError, KeyError) as error:
        report(f"output not understood: {type(error).__name__}: {error}")
        return {}


def crate_records(topsrcdir, lock_path=None, kinds=None):
    """Build (records, edges) for every third-party crate in Cargo.lock.

    ``edges`` maps a record's bom_ref to the bom_refs it depends on, which is
    what turns the SBOM into a graph rather than a flat list.

    ``kinds`` comes from collect_dependency_kinds() and is recorded but not
    yet serialized: knowing which crates are test-only is the prerequisite for
    telling an SBOM of what Firefox ships from an SBOM of what the repository
    builds with.
    """
    lock_path = lock_path or mozpath.join(topsrcdir, "Cargo.lock")
    if not os.path.exists(lock_path):
        return [], {}

    packages = parse_cargo_lock(lock_path)
    by_name = collections.defaultdict(list)
    for key in packages:
        by_name[key[0]].append(key)

    def bom_ref(key):
        name, version = key
        vendored = mozpath.join(VENDOR_DIR, name)
        if os.path.isdir(mozpath.join(topsrcdir, vendored)):
            return vendored
        return f"cargo:{name}@{version}"

    records = []
    edges = {}
    for key in sorted(packages):
        name, version = key
        package = packages[key]
        metadata, manifest_error = _vendored_metadata(topsrcdir, name)

        properties = {"moz:cargo.source": package["source"]}
        if manifest_error:
            properties["moz:cargo.manifest-unreadable"] = manifest_error
        licenses = []
        if metadata.get("license"):
            licenses = [metadata["license"]]
        elif metadata.get("license-file"):
            properties["moz:cargo.license-file"] = metadata["license-file"]

        hashes = []
        if package.get("checksum"):
            # Cargo.lock records the SHA-256 of the .crate archive published to
            # crates.io, which is exactly what an SBOM consumer needs to tell
            # whether the vendored copy came from the published release.
            hashes = [("SHA-256", package["checksum"])]

        resolved = {
            dependency: _resolve(dependency, packages, by_name)
            for dependency in package.get("dependencies", [])
        }
        # An edge Cargo.lock names but that matches no package it also lists.
        # Recorded rather than dropped: a graph missing edges silently reads
        # like a complete one.
        unresolved = sorted(spec for spec, key in resolved.items() if key is None)
        if unresolved:
            properties["moz:cargo.unresolved-dependencies"] = ",".join(unresolved)

        ref = bom_ref(key)
        records.append({
            "bom_ref": ref,
            "name": name,
            "version": version,
            "description": metadata.get("description"),
            "purl": _purl(package),
            "licenses": licenses,
            "website": metadata.get("homepage"),
            "vcs": metadata.get("repository"),
            "bugzilla": None,
            "hashes": hashes,
            "kinds": (kinds or {}).get(key, []),
            "properties": properties,
        })

        dependencies = sorted({bom_ref(key) for key in resolved.values() if key})
        if dependencies:
            edges[ref] = dependencies

    return records, edges
