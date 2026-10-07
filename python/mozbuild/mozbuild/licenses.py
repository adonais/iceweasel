# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Aggregate the tree's LICENSES declarations into one record set.

Shared by the build backend, which writes the result to <objdir>/licenses.json,
and by `mach licenses`, which renders about:license from a configured
tree without a build. Keeping the aggregation here stops the two from drifting.
"""

import collections
import os

import mozpack.path as mozpath
import yaml

from mozbuild.frontend.context import Path, SourcePath
from mozbuild.frontend.data import (
    DeclaredLicensedPaths,
    DeclaredLicenseNotice,
    LicenseError,
)

CoveringManifest = collections.namedtuple(
    "CoveringManifest", ("path", "license", "license_file")
)

# directory -> CoveringManifest, shared by every from_context() call of one
# process: the walk below runs once per moz.build and otherwise re-reads the
# same handful of manifests thousands of times.
_COVERING_MANIFESTS = {}


def _manifest_fields(manifest, topsrcdir):
    """Read one moz.yaml into a CoveringManifest.

    Parsed with plain yaml rather than moz_yaml.load_moz_yaml: a manifest the
    schema rejects still answers for the directory it owns, and reporting its
    schema errors is the vendoring code's job.
    """
    try:
        with open(manifest, encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
    except (OSError, yaml.YAMLError):
        data = None
    if not isinstance(data, dict):
        return CoveringManifest(manifest, None, None)

    origin = data.get("origin") or {}
    license = origin.get("license")
    if isinstance(license, list):
        license = " AND ".join(str(entry) for entry in license)

    # `license-file` is relative to the vendored tree, which is not always the
    # directory holding the manifest: gfx/angle/moz.yaml vendors into
    # third_party/angle.
    vendor_directory = (data.get("vendoring") or {}).get("vendor-directory")
    directory = (
        mozpath.join(topsrcdir, vendor_directory)
        if vendor_directory
        else mozpath.dirname(manifest)
    )
    license_file = origin.get("license-file")

    return CoveringManifest(
        manifest,
        str(license) if license else None,
        mozpath.join(directory, str(license_file)) if license_file else None,
    )


def covering_manifest(directory, topsrcdir, cache=None):
    """The moz.yaml owning `directory`, as a CoveringManifest, or None.

    The nearest manifest at or above the directory owns it, so the walk stops
    at the first one found whether or not it declares anything.
    """
    if cache is None:
        cache = _COVERING_MANIFESTS
    directory = mozpath.normpath(directory)
    if directory in cache:
        return cache[directory]

    manifest = mozpath.join(directory, "moz.yaml")
    if os.path.isfile(manifest):
        found = _manifest_fields(manifest, topsrcdir)
    else:
        parent = mozpath.dirname(directory)
        if (
            directory == mozpath.normpath(topsrcdir)
            or not parent
            or parent == directory
        ):
            found = None
        else:
            found = covering_manifest(parent, topsrcdir, cache)

    cache[directory] = found
    return found


def _notice_text(context, fields):
    """The absolute path of the file holding one notice's verbatim text.

    `text` names it relative to the declaring moz.build. Left unset, it is the
    `origin.license-file` of the covering moz.yaml, which is where a vendored
    library already records the file it ships its license in.
    """
    if fields.text:
        return SourcePath(context, fields.text).full_path
    covering = covering_manifest(context.srcdir, context.config.topsrcdir)
    return covering.license_file if covering else None


def _reject_repeats(variable, ids):
    """Reject an id named twice by one moz.build.

    The fields of both declarations live in one dict keyed by the id, so the
    second set silently replaces the first. Catching it here is the only place
    the two are still distinguishable; LicenseCollection sees the merged result.
    """
    seen = set()
    for license_id in ids:
        if license_id in seen:
            raise LicenseError(
                f'{variable}["{license_id}"] is declared twice here. Its fields are '
                "keyed by id, so the second declaration would silently replace the "
                "first."
            )
        seen.add(license_id)


def from_context(context):
    """Yield the license objects declared by one moz.build context.

    Kept out of the emitter so `mach licenses` can read the tree
    without it, where instantiating the rest of the emitter's objects, Library
    among them, would need an objdir the command does not have.
    """
    licensed_under = context.get("LICENSED_UNDER", [])
    _reject_repeats("LICENSED_UNDER", licensed_under)
    for license_id in licensed_under:
        # LICENSED_UNDER paths are relative to the declaring moz.build; the
        # LICENSES paths field below is topsrcdir-relative, because a shared
        # notice is usually declared far from the code it covers.
        paths = [
            mozpath.normpath(mozpath.join(context.relsrcdir, path))
            for path in licensed_under[license_id].paths
        ]
        yield DeclaredLicensedPaths(context, license_id, paths)

    licenses = context.get("LICENSES", [])
    _reject_repeats("LICENSES", licenses)
    for license_id in licenses:
        fields = licenses[license_id]
        yield DeclaredLicenseNotice(
            context,
            license_id,
            fields.title,
            _notice_text(context, fields),
            notice=fields.notice or None,
            spdx=fields.spdx or None,
            url=fields.url or None,
            paths=fields.paths or (),
            subcomponent=fields.subcomponent,
        )


def app_license_blocks(context):
    """Yield the about:license blocks one moz.build context splices into the page.

    An application overrides chrome://global/content/license.html with a copy
    of its own, generated from the same template plus extra source inputs:
    Firefox's is the "Binaries of this product" notice in
    ``browser/base/content/overrides/``. Reading the inputs back off that
    ``GENERATED_FILES`` declaration, rather than naming the files here, is what
    keeps `mach licenses` rendering the page the build actually ships.

    The template and the objdir's licenses.json are the shared inputs and are
    not blocks; everything else is one, in the order gen_license_html.py
    expects.
    """
    generated = context.get("GENERATED_FILES", [])
    if "license.html" not in generated:
        return []
    paths = []
    for entry in generated["license.html"].inputs:
        path = Path(context, entry)
        if isinstance(path, SourcePath) and not entry.endswith(".mako"):
            paths.append(path.full_path)
    return paths


class LicenseCollection:
    """Collects DeclaredLicenseNotice and DeclaredLicensedPaths objects."""

    def __init__(self):
        self._notices = {}
        self._coverage = collections.defaultdict(set)

    def add(self, obj):
        """Consume one emitted object. Returns True if it was a license object."""
        if isinstance(obj, DeclaredLicenseNotice):
            existing = self._notices.get(obj.id)
            if existing and existing["declared_in"] != obj.relsrcdir:
                raise LicenseError(
                    f'LICENSES["{obj.id}"] is declared in both '
                    f"{existing['declared_in']} and {obj.relsrcdir}."
                )
            self._notices[obj.id] = obj.asdict() | {"declared_in": obj.relsrcdir}
            self._coverage[obj.id].update(obj.paths)
            return True

        if isinstance(obj, DeclaredLicensedPaths):
            self._coverage[obj.id].update(obj.paths or [obj.relsrcdir])
            return True

        return False

    @property
    def text_paths(self):
        return [notice["text_path"] for notice in self._notices.values()]

    def records(self):
        """Return the license records, sorted by id, with notice text inlined.

        Coverage naming an id with no notice is dropped rather than rejected: a
        configuration that traverses a LICENSED_UNDER directory need not
        traverse the one holding the matching LICENSES declaration, which is
        how a JS shell or a mar-tools build sees js/ and intl/ but never
        toolkit/content/licenses. The `license-declarations` linter checks the tree-wide
        declarations, where a missing id really is a typo.
        """
        licenses = []
        for license_id in sorted(self._notices):
            notice = dict(self._notices[license_id])
            text_path = notice.pop("text_path")
            # A .html notice is structured markup (MPL, the LGPLs) and is
            # emitted verbatim; a .txt one is plain text wrapped in <pre>.
            notice["html"] = text_path.endswith(".html")
            with open(text_path, encoding="utf-8") as fh:
                notice["text"] = fh.read()
            notice["paths"] = sorted(self._coverage.get(license_id, ()))
            licenses.append(notice)
        return licenses
