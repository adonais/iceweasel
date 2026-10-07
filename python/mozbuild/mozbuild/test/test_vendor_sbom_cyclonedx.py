# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Serialization tests.

These pin behaviour that lives in cyclonedx-python-lib rather than in our own
code, so that a library upgrade cannot silently change the emitted document.
"""

import json
import unittest

from mozunit import main

from mozbuild.vendor.sbom_cyclonedx import build_bom, to_json, utc_timestamp

TIMESTAMP = utc_timestamp(1000000000)
REVISION = "0123456789abcdef0123456789abcdef01234567"


def record(**overrides):
    base = {
        "bom_ref": "third_party/zstd",
        "name": "zstd",
        "version": "v1.5.7",
        "description": "generic-purpose lossless compression algorithm",
        "purl": ("github", "facebook", "zstd", "v1.5.7", {}),
        "licenses": ["BSD-3-Clause"],
        "website": "https://github.com/facebook/zstd",
        "vcs": "https://github.com/facebook/zstd",
        "bugzilla": ("Toolkit", "General"),
        "properties": {"moz:moz-yaml.path": "third_party/zstd/moz.yaml"},
    }
    base.update(overrides)
    return base


def render(records, dependencies=None):
    return json.loads(
        to_json(
            build_bom(
                records, "155.0a1", REVISION, TIMESTAMP, dependencies=dependencies
            )
        )
    )


class TestUnrecognizedLicenses(unittest.TestCase):
    def collect(self, licenses):
        unrecognized = []
        build_bom(
            [record(licenses=licenses)],
            "155.0a1",
            REVISION,
            TIMESTAMP,
            unrecognized=unrecognized,
        )
        return unrecognized

    def test_a_value_that_is_not_spdx_is_reported(self):
        # The free-text fallback is what CycloneDX requires of us, but a typo
        # must not disappear into it.
        self.assertEqual(self.collect(["Apache2"]), ["Apache2"])

    def test_an_spdx_id_or_expression_is_not_reported(self):
        self.assertEqual(self.collect(["BSD-3-Clause"]), [])
        self.assertEqual(self.collect(["MIT OR Apache-2.0"]), [])


class TestSerialization(unittest.TestCase):
    def test_document_shape(self):
        document = render([record()])
        self.assertEqual(document["specVersion"], "1.6")
        self.assertEqual(document["bomFormat"], "CycloneDX")
        self.assertEqual(document["metadata"]["timestamp"], "2001-09-09T01:46:40+00:00")
        self.assertEqual(document["metadata"]["component"]["version"], "155.0a1")
        self.assertEqual(len(document["components"]), 1)

        component = document["components"][0]
        self.assertEqual(component["bom-ref"], "third_party/zstd")
        self.assertEqual(component["purl"], "pkg:github/facebook/zstd@v1.5.7")
        self.assertEqual(component["type"], "library")

    def test_root_component_is_named_after_the_product(self):
        # The same shippable builds that generate an SBOM include GeckoView, so
        # the root must not be hardcoded to Firefox desktop.
        self.assertEqual(render([record()])["metadata"]["component"]["name"], "Firefox")

        document = json.loads(
            to_json(
                build_bom(
                    [record()], "155.0a1", REVISION, TIMESTAMP, product_name="Fennec"
                )
            )
        )
        self.assertEqual(document["metadata"]["component"]["name"], "Fennec")

    def test_serial_number_is_derived_from_revision(self):
        first = render([record()])["serialNumber"]
        second = render([record()])["serialNumber"]
        self.assertEqual(first, second)

        other = json.loads(
            to_json(build_bom([record()], "155.0a1", "deadbeef", TIMESTAMP))
        )
        self.assertNotEqual(first, other["serialNumber"])

    def test_output_is_byte_identical_across_runs(self):
        records = [record(), record(bom_ref="media/libjpeg", name="libjpeg")]
        first = to_json(build_bom(records, "155.0a1", REVISION, TIMESTAMP))
        second = to_json(build_bom(records, "155.0a1", REVISION, TIMESTAMP))
        self.assertEqual(first, second)

    def test_spdx_id_versus_free_text_name(self):
        # LGPL-2.1 is deprecated but still a recognised SPDX id, so it must
        # land in `id`. "Public Domain" is not an SPDX id and must land in
        # `name`. A library upgrade flipping either would be a silent
        # regression in license accuracy.
        document = render([
            record(bom_ref="a", licenses=["LGPL-2.1"]),
            record(bom_ref="b", licenses=["Public Domain"]),
            record(bom_ref="c", licenses=["libpng"]),
        ])
        by_ref = {
            c["bom-ref"]: c["licenses"][0]["license"] for c in document["components"]
        }
        self.assertEqual(by_ref["a"], {"id": "LGPL-2.1"})
        self.assertEqual(by_ref["b"], {"name": "Public Domain"})
        # Case is normalized to the canonical SPDX spelling.
        self.assertEqual(by_ref["c"], {"id": "Libpng"})

    def test_multiple_licenses_do_not_produce_an_expression(self):
        # A LicenseExpression alongside any other license makes Bom.validate()
        # raise, so multi-license components must emit plain entries only.
        document = render([record(licenses=["IJG", "BSD-3-Clause"])])
        licenses = document["components"][0]["licenses"]
        self.assertEqual(len(licenses), 2)
        for entry in licenses:
            self.assertIn("license", entry)
            self.assertNotIn("expression", entry)

    def test_dependency_graph_is_registered(self):
        document = render([record()])
        refs = {d["ref"] for d in document["dependencies"]}
        self.assertIn("root", refs)
        self.assertIn("third_party/zstd", refs)

    def test_a_dependency_hangs_off_its_dependent_not_the_root(self):
        # Cargo.lock knows the crate graph. Registering everything on the root
        # as well would flatten it back into one ring of siblings.
        document = render(
            [
                record(bom_ref="a", name="a"),
                record(bom_ref="b", name="b"),
                record(bom_ref="c", name="c"),
            ],
            dependencies={"a": ["b"], "b": ["c"]},
        )
        graph = {d["ref"]: d.get("dependsOn", []) for d in document["dependencies"]}
        self.assertEqual(graph["root"], ["a"])
        self.assertEqual(graph["a"], ["b"])
        self.assertEqual(graph["b"], ["c"])

    def test_edges_to_unknown_refs_are_dropped(self):
        # A dependency the SBOM does not carry, a workspace member for
        # instance, must not leave a dangling ref behind.
        document = render([record(bom_ref="a", name="a")], dependencies={"a": ["gone"]})
        graph = {d["ref"]: d.get("dependsOn", []) for d in document["dependencies"]}
        self.assertEqual(graph["a"], [])
        self.assertEqual(graph["root"], ["a"])

    def test_occurrences_become_evidence(self):
        document = render([
            record(
                bom_ref="license:mit",
                purl=None,
                type="file",
                occurrences=["a/one.js", "b/two.js"],
            )
        ])
        component = document["components"][0]
        self.assertEqual(component["type"], "file")
        self.assertNotIn("purl", component)
        self.assertEqual(
            [o["location"] for o in component["evidence"]["occurrences"]],
            ["a/one.js", "b/two.js"],
        )

    def test_checksum_becomes_a_hash(self):
        document = render([record(hashes=[("SHA-256", "a" * 64)])])
        self.assertEqual(
            document["components"][0]["hashes"],
            [{"alg": "SHA-256", "content": "a" * 64}],
        )

    def test_a_lone_license_may_be_an_expression(self):
        # Cargo.toml license fields are SPDX expressions.
        document = render([record(licenses=["MIT OR Apache-2.0"])])
        self.assertEqual(
            document["components"][0]["licenses"],
            [{"expression": "MIT OR Apache-2.0"}],
        )

    def test_external_references(self):
        document = render([record()])
        by_type = {
            r["type"]: r["url"] for r in document["components"][0]["externalReferences"]
        }
        self.assertEqual(by_type["website"], "https://github.com/facebook/zstd")
        self.assertEqual(by_type["vcs"], "https://github.com/facebook/zstd")
        self.assertIn("product=Toolkit", by_type["issue-tracker"])


if __name__ == "__main__":
    main()
