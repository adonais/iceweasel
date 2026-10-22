# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Map the vendored Python packages onto SBOM records (see sbom.py).

`mach vendor python` resolves third_party/python/uv.lock and unpacks each
package under third_party/python. Mach, the build system and the test
harnesses run on them, but none ships in the product, so they belong to the
build tooling document.

Like sbom.py this module does not import cyclonedx.
"""

import email.parser
import glob
import os
import re

import mozpack.path as mozpath
import toml
from packaging.version import InvalidVersion, Version

from mozbuild.vendor.moz_yaml import MozYamlVerifyError, load_moz_yaml
from mozbuild.vendor.sbom import manifest_to_record
from mozbuild.vendor.vendor_python import EXCLUDED_PACKAGES

VENDOR_DIR = "third_party/python"
LOCKFILE = mozpath.join(VENDOR_DIR, "uv.lock")

# The wheels mozharness installs, not a package.
NOT_PACKAGES = {"_venv"}

# The classifiers that name exactly one SPDX license. "BSD License" and
# "Apache Software License" name a family, so they stay free text.
CLASSIFIER_LICENSES = {
    "License :: OSI Approved :: ISC License (ISCL)": "ISC",
    "License :: OSI Approved :: MIT License": "MIT",
    "License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "License :: OSI Approved :: Python Software Foundation License": "PSF-2.0",
}

# Free-text License values, lowercased, that can only mean one SPDX license.
# "BSD" or "GPL/LGPL" could mean several, so they are left as they are.
LICENSE_ALIASES = {
    "apache 2": "Apache-2.0",
    "apache 2.0": "Apache-2.0",
    "apache license 2.0": "Apache-2.0",
    "apache license, version 2.0": "Apache-2.0",
    "apache v2": "Apache-2.0",
    "apl 2": "Apache-2.0",
    "mpl 2.0": "MPL-2.0",
    "mpl 2.0 (mozilla public license)": "MPL-2.0",
    "mpl2": "MPL-2.0",
    "mplv2.0": "MPL-2.0",
    "psfl": "PSF-2.0",
    "python software foundation license": "PSF-2.0",
}

# A classifier that says nothing about which license.
UNSPECIFIC_CLASSIFIERS = {"License :: OSI Approved"}

RE_NOT_CANONICAL = re.compile(r"[-_.]+")
RE_NOT_LABEL = re.compile(r"[\W_]")

# Project-URL labels, normalized as PEP 753 does, in order of preference.
HOME_PAGE_LABELS = ("homepage", "source", "sourcecode", "repository", "documentation")
VCS_LABELS = ("source", "sourcecode", "repository")


def canonical_name(name):
    """The PEP 503 normalized name, which is also what pkg:pypi expects."""
    return RE_NOT_CANONICAL.sub("-", name).lower()


# What `mach vendor python` skips, so the tree's copy is not the archive the
# lockfile names: a stub, a patched copy.
VENDORING_EXCLUDED = {canonical_name(package) for package in EXCLUDED_PACKAGES}


def pypi_purl(name, version):
    return ("pypi", None, canonical_name(name), version, {})


def _vendored_directories(topsrcdir):
    """Map canonical package names to their directory under VENDOR_DIR.

    The directory is named after the archive `mach vendor python` unpacked,
    which is neither consistently the project name nor its normalized form:
    `boolean_py`, `fluent.syntax`, `python-hglib`.
    """
    root = mozpath.join(topsrcdir, VENDOR_DIR)
    if not os.path.isdir(root):
        return {}
    return {
        canonical_name(entry): mozpath.join(VENDOR_DIR, entry)
        for entry in sorted(os.listdir(root))
        if os.path.isdir(mozpath.join(root, entry))
    }


def read_metadata(directory):
    """Read a vendored package's core metadata, as (message, error).

    A wheel carries it in ``*.dist-info/METADATA``, a source distribution in
    ``PKG-INFO`` at its root, and a package vendored by hand may only have the
    ``*.egg-info`` copy.
    """
    candidates = sorted(glob.glob(mozpath.join(directory, "*.dist-info", "METADATA")))
    candidates.append(mozpath.join(directory, "PKG-INFO"))
    candidates += sorted(glob.glob(mozpath.join(directory, "*.egg-info", "PKG-INFO")))
    error = None
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as metadata:
                return email.parser.Parser().parse(metadata, headersonly=True), None
        except (OSError, UnicodeDecodeError) as read_error:
            error = error or str(read_error)
    return None, error or "no METADATA or PKG-INFO"


def licenses_from_metadata(metadata):
    """The licenses a package declares, most precise field first.

    License-Expression is SPDX by definition. The older License field is free
    text and often the whole license, so only a one-line value counts. The
    classifiers come last, mapped to SPDX where one id is meant.
    """
    expression = (metadata.get("License-Expression") or "").strip()
    if expression:
        return [expression]
    license = (metadata.get("License") or "").strip()
    if license and "\n" not in license and license != "UNKNOWN":
        return [LICENSE_ALIASES.get(license.lower(), license)]
    return sorted({
        CLASSIFIER_LICENSES.get(classifier, classifier.rpartition(" :: ")[2])
        for classifier in metadata.get_all("Classifier") or ()
        if classifier.startswith("License :: ")
        and classifier not in UNSPECIFIC_CLASSIFIERS
    })


def _project_url(metadata, labels):
    urls = {}
    for value in metadata.get_all("Project-URL") or ():
        label, _, url = value.partition(",")
        urls.setdefault(RE_NOT_LABEL.sub("", label).lower(), url.strip())
    return next((urls[label] for label in labels if urls.get(label)), None)


def home_page(metadata):
    """The Home-page field, or the Project-URL that newer metadata uses instead."""
    home = (metadata.get("Home-page") or "").strip()
    if home and home != "UNKNOWN":
        return home
    return _project_url(metadata, HOME_PAGE_LABELS)


def _same_version(a, b):
    try:
        return Version(a) == Version(b)
    except InvalidVersion:
        return a == b


def _artifact(package):
    """The archive `mach vendor python` unpacked, as (filenames, sha256).

    It downloads for `--platform any --abi none`, so a pure wheel where one is
    published and the source distribution otherwise. Several pure wheels leave
    the archive, and so the hash, undecided.
    """

    def filename(artifact):
        return artifact.get("url", "").rpartition("/")[2]

    wheels = [
        wheel
        for wheel in package.get("wheels") or ()
        if filename(wheel).endswith("-none-any.whl")
    ]
    if len(wheels) > 1:
        return [filename(wheel) for wheel in wheels], None
    artifact = wheels[0] if wheels else package.get("sdist")
    if not artifact:
        return [], None
    algorithm, _, digest = (artifact.get("hash") or "").partition(":")
    return [filename(artifact)], digest if algorithm == "sha256" and digest else None


def _unlocked_record(topsrcdir, directory):
    """Describe a vendored package uv.lock does not name.

    `mach vendor python` leaves the EXCLUDED_PACKAGES alone, so they are
    vendored by hand: a moz.yaml describes one, the package's own metadata
    another, and gyp has neither.
    """
    properties = {"moz:pypi.not-in-lockfile": "true"}
    manifest = mozpath.join(directory, "moz.yaml")
    if os.path.exists(mozpath.join(topsrcdir, manifest)):
        try:
            record = manifest_to_record(
                manifest,
                load_moz_yaml(
                    mozpath.join(topsrcdir, manifest), require_license_file=False
                ),
            )
        except (MozYamlVerifyError, ValueError) as error:
            properties["moz:moz-yaml.unreadable"] = str(error)
        else:
            if record:
                record["properties"].update(properties)
                return dict(record, hashes=[], kinds=["dev"], occurrences=[directory])

    metadata, error = read_metadata(mozpath.join(topsrcdir, directory))
    if error:
        properties["moz:pypi.metadata-unreadable"] = error
    name = (metadata and metadata.get("Name")) or mozpath.basename(directory)
    version = metadata.get("Version") if metadata else None
    return {
        "bom_ref": directory,
        "name": name,
        "version": version,
        "description": metadata.get("Summary") if metadata else None,
        "purl": pypi_purl(name, version) if version else None,
        "licenses": licenses_from_metadata(metadata) if metadata else [],
        "website": home_page(metadata) if metadata else None,
        "vcs": _project_url(metadata, VCS_LABELS) if metadata else None,
        "bugzilla": None,
        "hashes": [],
        "kinds": ["dev"],
        "occurrences": [directory],
        "properties": properties,
    }


def python_records(topsrcdir, lock_path=None):
    """Build (records, edges) for the vendored Python packages.

    Every registry package in uv.lock, then every vendored package it does not
    name.
    """
    lock_path = lock_path or mozpath.join(topsrcdir, LOCKFILE)
    if not os.path.exists(lock_path):
        return [], {}

    packages = {
        package["name"]: package
        for package in toml.load(lock_path).get("package", [])
        # Skip the virtual project whose dependencies are the ones to vendor.
        if "registry" in (package.get("source") or {})
    }
    directories = _vendored_directories(topsrcdir)

    def bom_ref(name):
        return directories.get(canonical_name(name)) or (
            f"pypi:{name}@{packages[name]['version']}"
        )

    records = []
    edges = {}
    for name, package in sorted(packages.items()):
        version = package["version"]
        properties = {"moz:pypi.lockfile": LOCKFILE}
        directory = directories.get(canonical_name(name))

        metadata, error = None, None
        if directory:
            metadata, error = read_metadata(mozpath.join(topsrcdir, directory))
        else:
            properties["moz:pypi.not-vendored"] = "true"
        if error:
            # A package whose metadata cannot be read is not one that
            # declares no license.
            properties["moz:pypi.metadata-unreadable"] = error
        elif metadata and not _same_version(
            metadata.get("Version") or version, version
        ):
            properties["moz:pypi.vendored-version"] = metadata["Version"]
        licenses = licenses_from_metadata(metadata) if metadata else []
        if metadata and not licenses and metadata.get_all("License-File"):
            properties["moz:pypi.license-file"] = ",".join(
                metadata.get_all("License-File")
            )

        filenames, sha256 = _artifact(package)
        if canonical_name(name) in VENDORING_EXCLUDED:
            properties["moz:pypi.vendoring-excluded"] = "true"
            filenames, sha256 = [], None
        if len(filenames) > 1:
            properties["moz:pypi.ambiguous-artifacts"] = ",".join(filenames)
        elif filenames:
            properties["moz:pypi.artifact"] = filenames[0]

        dependencies = {
            dependency["name"] for dependency in package.get("dependencies") or ()
        }
        # A git or path dependency is not a registry package.
        unresolved = sorted(dependencies - packages.keys())
        if unresolved:
            properties["moz:pypi.unresolved-dependencies"] = ",".join(unresolved)

        ref = bom_ref(name)
        records.append({
            "bom_ref": ref,
            "name": name,
            "version": version,
            "description": metadata.get("Summary") if metadata else None,
            "purl": pypi_purl(name, version),
            "licenses": licenses,
            "website": home_page(metadata) if metadata else None,
            "vcs": _project_url(metadata, VCS_LABELS) if metadata else None,
            "bugzilla": None,
            "hashes": [("SHA-256", sha256)] if sha256 else [],
            "kinds": ["dev"],
            "occurrences": [directory] if directory else [],
            "properties": properties,
        })

        children = sorted(bom_ref(child) for child in dependencies & packages.keys())
        if children:
            edges[ref] = children

    locked = {canonical_name(name) for name in packages}
    for key, directory in sorted(directories.items(), key=lambda item: item[1]):
        if key not in locked and mozpath.basename(directory) not in NOT_PACKAGES:
            records.append(_unlocked_record(topsrcdir, directory))

    return records, edges
