# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Map the npm lockfiles of the shipped bundles onto SBOM records.

webpack folds React, Redux and Fluent into the newtab, aboutwelcome and
asrouter bundles, so those packages leave no vendored directory and no
moz.yaml. The product document reports the runtime closure only: most of a
lockfile is build toolchain, and that document describes what ships. The rest,
webpack and babel among it, goes to the build tooling document.

Like sbom.py this module does not import cyclonedx.
"""

import base64
import binascii
import functools
import json
import os
import re

import mozpack.path as mozpath
import yaml

from mozbuild.vendor.sbom import clean_version
from mozbuild.vendor.vendor_node import PRUNED_PACKAGES

# An allowlist rather than a glob over the tree's package.json files, almost
# all of which are test scaffolding.
SHIPPED_MANIFESTS = (
    # newtab's bundles are generated at build time from the checked-in
    # third_party/node/node_modules, so this is the lockfile that ships.
    "third_party/node",
    # Bundled by a developer, checked in and packaged by jar.mn.
    "browser/components/aboutwelcome",
    "browser/components/asrouter",
)

# pnpm appends the resolved peers: "4.4.2(react-dom@19.2.0(react@19.2.0))".
RE_PEER_SUFFIX = re.compile(r"\(.*\)$")

HASH_ALGORITHMS = {"sha512": "SHA-512", "sha384": "SHA-384", "sha256": "SHA-256"}


def split_key(key):
    """Split a "name@version" lockfile key, scope and peer suffix included."""
    name, _, version = RE_PEER_SUFFIX.sub("", key).rpartition("@")
    return name, version


def is_type_only(name):
    """Is it a package vendor_node.py prunes because it only carries types?

    Nothing bundles those, and pruning leaves no package.json to read.
    """
    return name.partition("/")[0] in PRUNED_PACKAGES


def hashes_for(integrity):
    """Convert a Subresource Integrity string to CycloneDX (algorithm, hex) pairs."""
    pairs = []
    for token in (integrity or "").split():
        algorithm, _, encoded = token.partition("-")
        name = HASH_ALGORITHMS.get(algorithm.lower())
        if not name or not encoded:
            continue
        try:
            pairs.append((name, base64.b64decode(encoded, validate=True).hex()))
        except (binascii.Error, ValueError):
            continue
    return pairs


def npm_purl(name, version):
    namespace = None
    if name.startswith("@") and "/" in name:
        namespace, _, name = name.partition("/")
    return ("npm", namespace, name, version, {})


def bom_ref(name, version):
    return f"npm:{name}@{version}"


def _entry(integrity, license, installed, manifest_error=None, unresolved=()):
    return {
        "integrity": integrity,
        "license": license,
        "manifest_error": manifest_error,
        "installed": {installed} if installed else set(),
        "dependencies": set(),
        "unresolved": set(unresolved),
    }


def _merge(packages, key, entry):
    merged = packages.setdefault(key, entry)
    if merged is not entry:
        merged["dependencies"] |= entry["dependencies"]
        merged["unresolved"] |= entry["unresolved"]
        merged["installed"] |= entry["installed"]
        for field in ("integrity", "license", "manifest_error"):
            merged[field] = merged[field] or entry[field]


def _dependency_path(install_path, dependency, by_path):
    """Resolve a dependency the way Node does: nearest node_modules first."""
    prefix = install_path
    while True:
        candidate = (
            f"{prefix}/node_modules/{dependency}"
            if prefix
            else f"node_modules/{dependency}"
        )
        if candidate in by_path:
            return candidate
        if not prefix:
            return None
        prefix = prefix.rpartition("/node_modules/")[0]


def package_lock_packages(document, dev=False):
    """Packages of a loaded package-lock.json v2/v3, as {(name, version): entry}.

    The runtime packages, or with ``dev`` the ones only the build needs.
    """
    by_path = {
        install_path: entry
        for install_path, entry in (document.get("packages") or {}).items()
        # "" is the importer; a `link` is a workspace member, not a package.
        if install_path
        and entry.get("version")
        and not entry.get("link")
        and not is_type_only(
            entry.get("name") or install_path.rpartition("node_modules/")[2]
        )
    }

    def key(install_path):
        entry = by_path[install_path]
        name = entry.get("name") or install_path.rpartition("node_modules/")[2]
        return name, entry["version"]

    packages = {}
    for install_path, entry in by_path.items():
        # `devOptional` is also an optional dependency of a runtime package,
        # so unlike `dev` it can ship.
        if bool(entry.get("dev")) != dev:
            continue
        record = _entry(entry.get("integrity"), entry.get("license"), install_path)
        for section, optional in (
            ("dependencies", False),
            ("optionalDependencies", True),
        ):
            for dependency in entry.get(section) or {}:
                if is_type_only(dependency):
                    continue
                resolved = _dependency_path(install_path, dependency, by_path)
                if resolved:
                    record["dependencies"].add(key(resolved))
                # An optional dependency missing from the lockfile was not
                # installed.
                elif not optional:
                    record["unresolved"].add(dependency)
        _merge(packages, key(install_path), record)
    return packages


def pnpm_packages(document, node_modules, copies, dev=False):
    """Packages of a loaded pnpm-lock.yaml v9, as {(name, version): entry}.

    pnpm records neither `dev` nor licenses, so the runtime closure is walked
    from the importers' `dependencies` and `optionalDependencies` and the
    license read from the checked-in copy. An optional package with no
    checked-in copy was not installed, so it is not bundled either. With
    ``dev``, the closure of `devDependencies` is walked instead; npm_records
    drops what a runtime closure also reaches.
    """
    importers = (document.get("importers") or {}).values()

    def roots(*sections):
        return [
            (child, section == "optionalDependencies")
            for importer in importers
            for section in sections
            for child in _pnpm_children(importer.get(section))
        ]

    sections = ("devDependencies",) if dev else ("dependencies", "optionalDependencies")
    return _walk_pnpm(document, node_modules, copies, roots(*sections))


def _pnpm_children(section):
    for name, spec in (section or {}).items():
        version = spec.get("version") if isinstance(spec, dict) else spec
        if version:
            yield f"{name}@{version}"


def _walk_pnpm(document, node_modules, copies, queue):
    """Walk a pnpm-lock.yaml from (snapshot key, optional) roots."""
    metadata = document.get("packages") or {}
    snapshots = document.get("snapshots") or {}

    packages = {}
    seen = set()
    while queue:
        snapshot_key, optional = queue.pop()
        if snapshot_key in seen:
            continue

        name, version = split_key(snapshot_key)
        if not name or not version or is_type_only(name):
            continue

        installed, license, error = _installed_copy(node_modules, copies, name, version)
        if installed is None and optional:
            continue
        seen.add(snapshot_key)

        snapshot = snapshots.get(snapshot_key)
        integrity = (
            (metadata.get(f"{name}@{version}") or {}).get("resolution") or {}
        ).get("integrity")
        # Without a snapshot the package's own edges are unknown, not absent.
        record = _entry(
            integrity,
            license,
            installed,
            error,
            unresolved=() if snapshot is not None else (snapshot_key,),
        )
        for section, is_optional in (
            ("dependencies", False),
            ("optionalDependencies", True),
        ):
            for child in _pnpm_children((snapshot or {}).get(section)):
                queue.append((child, is_optional))
                record["dependencies"].add(split_key(child))
        _merge(packages, (name, version), record)

    # An optional child that was not installed is no dependency.
    walked = set(packages)
    for entry in packages.values():
        entry["dependencies"] &= walked
    return packages


def _index_copies(node_modules):
    """Map each package name to its checked-in directories, top-level first."""
    copies = {}
    for walked, subdirectories, files in os.walk(node_modules):
        directory = mozpath.normsep(walked)
        subdirectories.sort()
        parent = mozpath.dirname(directory)
        basename = mozpath.basename(directory)
        if directory == node_modules or basename == "node_modules":
            continue
        if basename.startswith("@") and (
            parent == node_modules or mozpath.basename(parent) == "node_modules"
        ):
            continue
        # Only a package's own node_modules can hold further packages.
        subdirectories[:] = [d for d in subdirectories if d == "node_modules"]
        if "package.json" in files:
            name = mozpath.relpath(directory, node_modules).rpartition("node_modules/")[
                2
            ]
            copies.setdefault(name, []).append(directory)
    for directories in copies.values():
        directories.sort(key=lambda d: (d.count("/node_modules/"), d))
    return copies


def _installed_copy(node_modules, copies, name, version):
    """Find the checked-in copy of name@version, as (path, license, error).

    It is the only source of a pnpm package's license, so a missing copy is an
    error rather than a package that looks unlicensed. With a hoisted layout
    the top-level copy may be another version; the right one is then nested.
    """
    error = None
    for directory in copies.get(name, ()):
        document, read_error = read_package_json(directory)
        if document.get("version") == version:
            path = mozpath.join(
                "node_modules", mozpath.relpath(directory, node_modules)
            )
            return path, document.get("license"), None
        error = error or read_error
    return None, None, error or f"no node_modules copy of {name}@{version}"


def read_package_json(directory):
    """Read a package.json, as (document, error). A missing file is not an error."""
    path = mozpath.join(directory, "package.json")
    if not os.path.exists(path):
        return {}, None
    try:
        with open(path, encoding="utf-8") as manifest:
            document = json.load(manifest)
    except (OSError, UnicodeDecodeError, ValueError) as error:
        return {}, str(error)
    if not isinstance(document, dict):
        return {}, f"{path} does not hold a JSON object"
    return document, None


def _licenses(entry):
    license = entry.get("license")
    # The deprecated object form still turns up in old packages.
    if isinstance(license, dict):
        license = license.get("type")
    return [license] if isinstance(license, str) and license else []


def lockfile_closure(directory):
    """Bind the lockfile of one manifest directory, read once.

    Returns a callable taking ``dev`` and answering with that closure, or None
    where the directory holds no lockfile. Bound rather than re-read because
    the dev document needs the runtime closure of the same lockfile too, to
    leave out what the product document already describes, and pnpm's lockfile
    and the walk of the checked-in copies are not cheap.
    """
    pnpm_lock = mozpath.join(directory, "pnpm-lock.yaml")
    npm_lock = mozpath.join(directory, "package-lock.json")
    if os.path.exists(pnpm_lock):
        with open(pnpm_lock, encoding="utf-8") as lockfile:
            document = yaml.safe_load(lockfile) or {}
        node_modules = mozpath.join(directory, "node_modules")
        return functools.partial(
            pnpm_packages, document, node_modules, _index_copies(node_modules)
        )
    if os.path.exists(npm_lock):
        with open(npm_lock, encoding="utf-8") as lockfile:
            document = json.load(lockfile)
        return functools.partial(package_lock_packages, document)
    return None


def npm_records(topsrcdir, manifests=SHIPPED_MANIFESTS, dev=False):
    """Build (records, edges) for the npm packages the product bundles.

    One record per (name, version), merged across lockfiles: several packages
    ship at two versions at once, react among them. With ``dev``, the packages
    that only build the bundles instead.
    """
    records = {}
    sources = {}
    shipped = set()
    for manifest in manifests:
        closure = lockfile_closure(mozpath.join(topsrcdir, manifest))
        if closure is None:
            continue
        packages = closure(dev=dev)
        if dev:
            shipped.update(closure(dev=False))
        for key, entry in packages.items():
            entry["installed"] = {
                mozpath.join(manifest, installed) for installed in entry["installed"]
            }
            _merge(records, key, entry)
            sources.setdefault(key, set()).add(manifest)

    # A package any lockfile ships is the product document's.
    for key in shipped:
        records.pop(key, None)

    result = []
    edges = {}
    for (name, version), entry in sorted(records.items()):
        ref = bom_ref(name, version)
        manifests_of = sorted(sources[(name, version)])
        properties = {"moz:npm.manifests": ",".join(manifests_of)}
        if entry["manifest_error"]:
            properties["moz:npm.package-json-unreadable"] = entry["manifest_error"]
        if entry["unresolved"]:
            properties["moz:npm.unresolved-dependencies"] = ",".join(
                sorted(entry["unresolved"])
            )
        hashes = hashes_for(entry["integrity"])
        if entry["integrity"] and not hashes:
            properties["moz:npm.integrity-unreadable"] = entry["integrity"]

        result.append({
            "bom_ref": ref,
            "name": name,
            "version": version,
            "description": None,
            "purl": npm_purl(name, version),
            "licenses": _licenses(entry),
            "website": None,
            "vcs": None,
            "bugzilla": None,
            "hashes": hashes,
            "kinds": ["dev"] if dev else ["normal"],
            "occurrences": sorted(
                installed
                for installed in entry["installed"]
                if os.path.isdir(mozpath.join(topsrcdir, installed))
            ),
            "properties": properties,
        })

        # With ``dev``, an edge to a shipped package is left to the product
        # document, which describes that package.
        children = sorted({bom_ref(*c) for c in entry["dependencies"] if c in records})
        if children:
            edges[ref] = children

    return result, edges


def upgrade_manifest_purls(records, topsrcdir):
    """Give a moz.yaml record declaring `origin: npm-name` a pkg:npm purl.

    The registry name is declared, never derived: deriving it from a vendored
    package.json produces false identities (the puppeteer monorepo root, the
    Speedometer benchmark). The vendored package.json, where present, decides
    the version; a name there that disagrees with the declaration leaves the
    purl alone. Returns the number of records upgraded.
    """
    upgraded = 0
    for record in records:
        declared = record["properties"].get("moz:npm.name")
        if not declared:
            continue

        manifest, error = read_package_json(mozpath.join(topsrcdir, record["bom_ref"]))
        if error:
            record["properties"]["moz:npm.package-json-unreadable"] = error
            continue
        if manifest.get("name") and manifest["name"] != declared:
            record["properties"]["moz:npm.name-mismatch"] = manifest["name"]
            continue

        # A git revision is not a version any registry can resolve.
        version = manifest.get("version") or clean_version(
            record["properties"].get("moz:origin.release")
        )
        if not version:
            continue

        record["purl"] = npm_purl(declared, version)
        if version != record["version"]:
            record["properties"]["moz:npm.version"] = version
        upgraded += 1
    return upgraded
