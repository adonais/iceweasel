# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Map GeckoView's resolved Gradle runtime closure onto SBOM records.

Its Maven dependencies leave no vendored directory and no moz.yaml. The
WriteRuntimeDependencies task of the conventions Gradle plugin writes the
resolved graph and the artifact paths.

Like sbom.py this module does not import cyclonedx.
"""

import glob
import hashlib
import json
import os
import xml.etree.ElementTree as ET

import mozpack.path as mozpath

# Relative to the objdir. The geckoview project's build directory, as set by
# the Gradle build, followed by the path the task writes to.
RUNTIME_DEPENDENCIES = (
    "gradle/build/mobile/android/geckoview/sbom/runtime-dependencies.json"
)

# POM licenses are free text. Mapped by URL, since the names vary far more
# ("The Apache Software License, Version 2.0", "Apache 2.0", ...).
LICENSE_URLS = {
    "apache.org/licenses/license-2.0": "Apache-2.0",
    "opensource.org/licenses/mit": "MIT",
    "opensource.org/licenses/bsd-3-clause": "BSD-3-Clause",
    "opensource.org/licenses/bsd-2-clause": "BSD-2-Clause",
}

# A POM without <licenses> may inherit them. Deeper chains than this are
# reported rather than followed.
MAX_PARENT_DEPTH = 5


class GradleSbomError(Exception):
    pass


def maven_purl(group, name, version):
    return ("maven", group, name, version, {})


def bom_ref(group, name, version):
    return f"maven:{group}:{name}@{version}"


def _spdx_for(name, url):
    if url:
        key = url.lower().split("://", 1)[-1].removeprefix("www.")
        for suffix in ("/", ".txt", ".html", ".php"):
            key = key.removesuffix(suffix)
        if key in LICENSE_URLS:
            return LICENSE_URLS[key]
    return name or url


def repository_root(artifact, group, name, version):
    """The repository an artifact was resolved from, as (layout, root).

    A file:// Maven repository, which is what automation fetches, keeps the
    POM next to the artifact; the Gradle cache keeps each file under its own
    checksum directory.
    """
    directory = mozpath.dirname(mozpath.normsep(artifact))
    maven = mozpath.join(*group.split("."), name, version)
    if directory.endswith("/" + maven):
        return "maven", directory[: -len(maven) - 1]
    cache = mozpath.join(group, name, version)
    parent = mozpath.dirname(directory)
    if parent.endswith("/" + cache):
        return "cache", parent[: -len(cache) - 1]
    return None


def find_pom(roots, group, name, version):
    for layout, root in roots:
        if layout == "maven":
            path = mozpath.join(root, *group.split("."), name, version)
            candidates = [mozpath.join(path, f"{name}-{version}.pom")]
        else:
            pattern = mozpath.join(
                root, group, name, version, "*", f"{name}-{version}.pom"
            )
            candidates = sorted(glob.glob(pattern))
        for candidate in candidates:
            if os.path.isfile(candidate):
                return candidate
    return None


def _text(element, path, namespaces):
    value = element.findtext(path, namespaces=namespaces)
    return (value.strip() or None) if value else None


def read_pom(roots, group, name, version):
    """Read the metadata of a module's POM, as (metadata, error).

    Licenses come from the nearest POM up the parent chain that declares any;
    the rest from the module's own, since a parent's URL is the parent's.
    """
    metadata = {}
    coordinates = (group, name, version)
    for depth in range(MAX_PARENT_DEPTH + 1):
        path = find_pom(roots, *coordinates)
        if not path:
            return metadata, f"no POM for {':'.join(coordinates)}"
        try:
            project = ET.parse(path).getroot()
        except (OSError, ET.ParseError) as error:
            return metadata, f"{path}: {error}"

        # The POM's own namespace as the default, so that the paths below
        # match with or without one.
        namespace = project.tag[1:].partition("}")[0] if project.tag[0] == "{" else ""
        ns = {"": namespace}
        if depth == 0:
            metadata = {
                "description": _text(project, "description", ns),
                "website": _text(project, "url", ns),
                "vcs": _text(project, "scm/url", ns),
            }

        licenses = [
            _spdx_for(_text(license, "name", ns), _text(license, "url", ns))
            for license in project.findall("licenses/license", ns)
        ]
        licenses = [license for license in licenses if license]
        if licenses:
            metadata["licenses"] = licenses
            return metadata, None

        parent = project.find("parent", ns)
        if parent is None:
            return metadata, None
        coordinates = tuple(
            _text(parent, field, ns) for field in ("groupId", "artifactId", "version")
        )
        if not all(coordinates):
            return metadata, f"{path}: incomplete <parent>"
    return metadata, f"parent chain of {group}:{name}:{version} is too deep"


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as artifact:
        for chunk in iter(lambda: artifact.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _primary_artifact(files, name, version):
    """The artifact without a classifier, which is what the purl names."""
    for path in files:
        if mozpath.basename(path).rpartition(".")[0] == f"{name}-{version}":
            return path
    return None


def gradle_records(path):
    """Build (records, edges, version) from a runtime closure.

    ``version`` is the product's, where the task was given one.
    """
    try:
        with open(path, encoding="utf-8") as document:
            data = json.load(document)
        components = [
            (c["group"], c["name"], c["version"], sorted(c.get("files") or []), c)
            for c in data["components"]
        ]
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise GradleSbomError(f"cannot read {path}: {error}")

    primaries = {}
    roots = []
    for group, name, version, files, _ in components:
        primary = _primary_artifact(files, name, version)
        located = primary or (files[0] if files else None)
        own = located and repository_root(located, group, name, version)
        primaries[(group, name, version)] = primary, own
        if own and own not in roots:
            roots.append(own)

    records = []
    edges = {}
    known = {f"{g}:{n}:{v}": bom_ref(g, n, v) for g, n, v, _, _ in components}
    for group, name, version, files, component in components:
        properties = {}
        primary, own = primaries[(group, name, version)]
        hashes = []
        if primary:
            try:
                hashes = [("SHA-256", _sha256(primary))]
            except OSError as error:
                properties["moz:maven.artifact-unreadable"] = str(error)
        elif files:
            # The purl names the artifact without a classifier, so hashing
            # one with a classifier would describe another file.
            properties["moz:maven.classified-artifacts"] = ",".join(
                mozpath.basename(path) for path in files
            )
        else:
            # A platform or a relocation: nothing of it ships, but it is part
            # of the graph that decided what does.
            properties["moz:maven.no-artifact"] = "true"

        # Its own repository first; a parent POM or a module without an
        # artifact may well be in another.
        metadata, error = read_pom(
            [own] + [r for r in roots if r != own] if own else roots,
            group,
            name,
            version,
        )
        if error:
            properties["moz:maven.pom-unreadable"] = error

        ref = bom_ref(group, name, version)
        records.append({
            "bom_ref": ref,
            "name": f"{group}:{name}",
            "version": version,
            "description": metadata.get("description"),
            "purl": maven_purl(group, name, version),
            "licenses": metadata.get("licenses", []),
            "website": metadata.get("website"),
            "vcs": metadata.get("vcs"),
            "bugzilla": None,
            "hashes": hashes,
            "kinds": ["normal"],
            "properties": properties,
        })

        children = sorted({
            known[child]
            for child in component.get("dependencies") or []
            if child in known
        })
        if children:
            edges[ref] = children

    return records, edges, data.get("version")
