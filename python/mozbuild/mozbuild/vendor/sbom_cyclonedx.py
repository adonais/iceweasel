# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Serialize SBOM records (see sbom.py) as CycloneDX JSON."""

import datetime
import uuid

from cyclonedx.contrib.license.factories import LicenseFactory
from cyclonedx.exception.factory import (
    InvalidLicenseExpressionException,
    InvalidSpdxLicenseException,
)
from cyclonedx.model import (
    ExternalReference,
    ExternalReferenceType,
    HashAlgorithm,
    HashType,
    Property,
    XsUri,
)
from cyclonedx.model.bom import Bom, BomMetaData
from cyclonedx.model.component import Component, ComponentEvidence, ComponentType
from cyclonedx.model.component_evidence import Occurrence
from cyclonedx.output import make_outputter
from cyclonedx.schema import OutputFormat, SchemaVersion
from packageurl import PackageURL

ROOT_BOM_REF = "root"
SERIAL_NAMESPACE_URL = "https://github.com/mozilla-firefox/firefox/"

COMPONENT_TYPES = {
    "library": ComponentType.LIBRARY,
    "file": ComponentType.FILE,
}


def _make_license(factory, value, expressions_allowed=False, unrecognized=None):
    """Prefer a real SPDX id, then an expression, then a free-text name.

    A value that is neither is recorded in ``unrecognized`` on its way to the
    free-text form. The fallback is what CycloneDX requires of us, but it turns
    a typo into a license nobody can match, so the caller gets to say so.

    LicenseFactory.make_from_string() is not used on purpose: it always
    considers expressions, and a component carrying an expression alongside
    any other license makes Bom.validate() raise
    LicenseExpressionAlongWithOthersException. Several manifests declare two
    licenses, so an expression is only tried where the value stands alone --
    which is the common case for a crate, whose Cargo.toml license field is an
    expression such as "MIT OR Apache-2.0".
    """
    try:
        return factory.make_with_id(value)
    except InvalidSpdxLicenseException:
        pass
    if expressions_allowed:
        try:
            return factory.make_with_expression(value)
        except InvalidLicenseExpressionException:
            pass
    if unrecognized is not None:
        unrecognized.append(value)
    return factory.make_with_name(value)


def _add_licenses(component, values, factory, unrecognized=None):
    for value in values:
        component.licenses.add(
            _make_license(
                factory,
                value,
                expressions_allowed=len(values) == 1,
                unrecognized=unrecognized,
            )
        )


def _make_purl(record):
    if not record["purl"]:
        return None
    purl_type, namespace, name, version, qualifiers = record["purl"]
    return PackageURL(
        type=purl_type,
        namespace=namespace,
        name=name,
        version=version,
        qualifiers=qualifiers or None,
    )


def _make_component(record, factory, unrecognized=None):
    component = Component(
        name=record["name"],
        type=COMPONENT_TYPES[record.get("type", "library")],
        bom_ref=record["bom_ref"],
        version=record["version"],
        description=record["description"],
        purl=_make_purl(record),
        hashes=[
            HashType(alg=HashAlgorithm(alg), content=content)
            for alg, content in record.get("hashes", ())
        ],
    )

    # Where the component was found in the tree. A notice-derived component
    # covers every file the notice names, so the paths belong here rather than
    # in a property invented for the purpose.
    occurrences = record.get("occurrences")
    if occurrences:
        component.evidence = ComponentEvidence(
            occurrences=[
                # An explicit bom_ref: occurrences sort by it, and the
                # generated one is a random uuid, which would reorder the
                # evidence block on every run.
                Occurrence(bom_ref=f"{record['bom_ref']}#{path}", location=path)
                for path in occurrences
            ]
        )

    _add_licenses(component, record["licenses"], factory, unrecognized)

    if record["website"]:
        component.external_references.add(
            ExternalReference(
                type=ExternalReferenceType.WEBSITE, url=XsUri(record["website"])
            )
        )
    if record["vcs"]:
        component.external_references.add(
            ExternalReference(type=ExternalReferenceType.VCS, url=XsUri(record["vcs"]))
        )
    if record["bugzilla"]:
        product, bz_component = record["bugzilla"]
        component.external_references.add(
            ExternalReference(
                type=ExternalReferenceType.ISSUE_TRACKER,
                url=XsUri(
                    "https://bugzilla.mozilla.org/enter_bug.cgi"
                    f"?product={product}&component={bz_component}"
                ),
            )
        )

    for key, value in sorted(record["properties"].items()):
        component.properties.add(Property(name=key, value=value))

    return component


def build_bom(
    records,
    product_version,
    source_revision,
    timestamp,
    product_notices=(),
    product_name="Firefox",
    dependencies=None,
    unrecognized=None,
):
    """Assemble a Bom. All non-determinism is injected by the caller.

    ``product_notices`` are license notices that about:license reproduces
    without naming a path, the MPL and the bundled spellchecking dictionaries
    among them. They belong to the product as a whole rather than to any one
    component, so they land on the root.

    ``product_name`` names the root component. The same shippable builds that
    generate an SBOM include GeckoView, so the caller passes the configuration's
    own application name rather than letting the desktop default stand.

    ``unrecognized``, if given, collects the license values that are neither
    an SPDX id nor an expression and so end up as free text.

    ``dependencies`` maps a record's bom_ref to the bom_refs it depends on, for
    the parts of the tree that know their own graph -- Cargo.lock today.
    Anything no other component depends on hangs off the root, so the result is
    a tree rather than one flat ring of siblings.
    """
    factory = LicenseFactory()

    root = Component(
        name=product_name,
        type=ComponentType.APPLICATION,
        bom_ref=ROOT_BOM_REF,
        version=product_version,
    )
    if source_revision:
        root.properties.add(Property(name="moz:source.revision", value=source_revision))

    if product_notices:
        root.properties.add(
            Property(
                name="moz:license.notice-ids",
                value=",".join(sorted(n["id"] for n in product_notices)),
            )
        )
        for value in sorted({n["spdx"] for n in product_notices if n["spdx"]}):
            root.licenses.add(_make_license(factory, value, unrecognized=unrecognized))

    metadata = BomMetaData(component=root, timestamp=timestamp)
    metadata.tools.components.add(
        Component(
            name="mach sbom",
            type=ComponentType.APPLICATION,
            bom_ref="tool:mach-sbom",
        )
    )

    # A stable serial number keyed to the source revision: reproducible for a
    # given checkout, still distinct between revisions.
    serial = uuid.uuid5(
        uuid.NAMESPACE_URL, SERIAL_NAMESPACE_URL + (source_revision or "unknown")
    )

    bom = Bom(serial_number=serial, metadata=metadata)
    components = {}
    for record in records:
        component = _make_component(record, factory, unrecognized)
        components[record["bom_ref"]] = component
        bom.components.add(component)

    dependencies = dependencies or {}
    depended_on = {
        ref for targets in dependencies.values() for ref in targets if ref in components
    }
    for ref, targets in sorted(dependencies.items()):
        if ref not in components:
            continue
        bom.register_dependency(
            components[ref], [components[t] for t in targets if t in components]
        )
    # Every component the graph does not already account for is a direct
    # dependency of the product. Registering the rest as well would make the
    # root the parent of the whole tree and flatten it back out; leaving them
    # unregistered makes Bom.validate() warn about an incomplete graph.
    bom.register_dependency(
        root,
        [component for ref, component in components.items() if ref not in depended_on],
    )
    return bom


def to_json(bom):
    outputter = make_outputter(bom, OutputFormat.JSON, SchemaVersion.V1_6)
    return outputter.output_as_string(indent=2) + "\n"


def utc_timestamp(epoch_seconds):
    return datetime.datetime.fromtimestamp(epoch_seconds, tz=datetime.timezone.utc)
