# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import base64
import json
import os
import tempfile
import textwrap
import unittest

from mozunit import main

from mozbuild.vendor.sbom_npm import (
    hashes_for,
    npm_purl,
    npm_records,
    split_key,
    upgrade_manifest_purls,
)

REACT_SHA512 = base64.b64encode(b"\x01" * 64).decode()
SCHEDULER_SHA512 = base64.b64encode(b"\x02" * 64).decode()

PACKAGE_LOCK = {
    "lockfileVersion": 3,
    "packages": {
        "": {"name": "aboutwelcome", "dependencies": {"react": "16.13.1"}},
        "node_modules/react": {
            "version": "16.13.1",
            "license": "MIT",
            "integrity": f"sha512-{REACT_SHA512}",
            "dependencies": {
                "scheduler": "^0.19.1",
                "react-is": "^16",
                "absent": "^1.0.0",
                "@types/react": "^19",
            },
            "optionalDependencies": {"encoding": "^0.1", "fsevents": "^2"},
        },
        "node_modules/scheduler": {"version": "0.19.1", "license": "MIT"},
        "node_modules/react/node_modules/react-is": {"version": "16.13.1"},
        "node_modules/react-is": {"version": "17.0.2"},
        "node_modules/webpack": {"version": "5.109.0", "dev": True},
        "node_modules/encoding": {"version": "0.1.13", "devOptional": True},
        "node_modules/@babel/runtime": {"version": "7.29.6"},
        "node_modules/@types/react": {"version": "19.2.2"},
    },
}

PNPM_LOCK = textwrap.dedent(
    f"""
    lockfileVersion: '9.0'
    importers:
      .:
        dependencies:
          react-dom:
            specifier: 19.2.0
            version: 19.2.0(react@19.2.0)
        devDependencies:
          webpack:
            specifier: 5.109.0
            version: 5.109.0
          react:
            specifier: 19.2.0
            version: 19.2.0
          scheduler:
            specifier: 0.19.1
            version: 0.19.1
    packages:
      react@19.2.0:
        resolution: {{integrity: sha512-{REACT_SHA512}}}
      react-dom@19.2.0:
        resolution: {{integrity: sha512-not!base64}}
      scheduler@0.27.0:
        resolution: {{integrity: sha512-{SCHEDULER_SHA512}}}
    snapshots:
      react@19.2.0: {{}}
      react-dom@19.2.0(react@19.2.0):
        dependencies:
          react: 19.2.0
          scheduler: 0.27.0
          classnames: 2.5.1
          csstype: 3.2.3
        optionalDependencies:
          loose-envify: 1.4.0
          fsevents: 2.3.3
      scheduler@0.27.0: {{}}
      classnames@2.5.1: {{}}
      csstype@3.2.3: {{}}
      loose-envify@1.4.0: {{}}
      fsevents@2.3.3: {{}}
      webpack@5.109.0:
        dependencies:
          react: 19.2.0
      scheduler@0.19.1: {{}}
    """
)


class TestHelpers(unittest.TestCase):
    def test_split_key(self):
        self.assertEqual(split_key("@babel/core@7.29.6"), ("@babel/core", "7.29.6"))
        self.assertEqual(
            split_key("react-transition-group@4.4.2(react-dom@19.2.0(react@19.2.0))"),
            ("react-transition-group", "4.4.2"),
        )

    def test_hashes_for(self):
        self.assertEqual(hashes_for(f"sha512-{REACT_SHA512}"), [("SHA-512", "01" * 64)])
        self.assertEqual(hashes_for(None), [])
        self.assertEqual(hashes_for("md5-abcd"), [])
        self.assertEqual(hashes_for("sha512-not!base64"), [])

    def test_npm_purl(self):
        self.assertEqual(
            npm_purl("@babel/runtime", "7.29.6"),
            ("npm", "@babel", "runtime", "7.29.6", {}),
        )


class TestNpmRecords(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.topsrcdir = self.tmp.name
        for manifest in ("first", "second"):
            self.write(f"{manifest}/package-lock.json", json.dumps(PACKAGE_LOCK))
        self.write("third/pnpm-lock.yaml", PNPM_LOCK)
        self.write_package("third/node_modules/react", "19.2.0", "MIT")
        self.write("third/node_modules/react-dom/package.json", "{ not json")
        self.write_package("third/node_modules/loose-envify", "1.4.0", "MIT")
        # Hoisted: the top-level scheduler is another version.
        self.write_package("third/node_modules/scheduler", "0.19.1", "MIT")
        self.write_package(
            "third/node_modules/react-dom/node_modules/scheduler", "0.27.0", "BSD"
        )

        records, self.edges = npm_records(
            self.topsrcdir, manifests=("first", "second", "third", "missing")
        )
        self.refs = [record["bom_ref"] for record in records]
        self.by_ref = dict(zip(self.refs, records))

    def write_package(self, directory, version, license):
        self.write(
            f"{directory}/package.json",
            json.dumps({"version": version, "license": license}),
        )

    def write(self, path, content):
        path = os.path.join(self.topsrcdir, path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(content)

    def test_runtime_closure_only(self):
        self.assertEqual(
            self.refs,
            [
                "npm:@babel/runtime@7.29.6",
                "npm:classnames@2.5.1",
                "npm:encoding@0.1.13",
                "npm:loose-envify@1.4.0",
                "npm:react@16.13.1",
                "npm:react@19.2.0",
                "npm:react-dom@19.2.0",
                "npm:react-is@16.13.1",
                "npm:react-is@17.0.2",
                "npm:scheduler@0.19.1",
                "npm:scheduler@0.27.0",
            ],
        )

    def test_type_only_packages_are_left_out(self):
        # vendor_node.py prunes them, and they are no unresolved dependency.
        self.assertNotIn("npm:csstype@3.2.3", self.refs)
        self.assertNotIn("npm:@types/react@19.2.2", self.refs)

    def test_package_lock_record(self):
        react = self.by_ref["npm:react@16.13.1"]
        self.assertEqual(react["purl"], ("npm", None, "react", "16.13.1", {}))
        self.assertEqual(react["hashes"], [("SHA-512", "01" * 64)])
        self.assertEqual(react["licenses"], ["MIT"])
        self.assertEqual(react["occurrences"], [])
        self.assertEqual(
            react["properties"],
            {
                "moz:npm.manifests": "first,second",
                "moz:npm.unresolved-dependencies": "absent",
            },
        )

    def test_edges(self):
        # The nested react-is wins over the hoisted one; an optional
        # dependency that was not installed is not an edge.
        self.assertEqual(
            self.edges["npm:react@16.13.1"],
            ["npm:encoding@0.1.13", "npm:react-is@16.13.1", "npm:scheduler@0.19.1"],
        )
        self.assertEqual(
            self.edges["npm:react-dom@19.2.0"],
            [
                "npm:classnames@2.5.1",
                "npm:loose-envify@1.4.0",
                "npm:react@19.2.0",
                "npm:scheduler@0.27.0",
            ],
        )

    def test_skipped_optional_child_is_no_edge_once_another_lockfile_ships_it(self):
        self.write(
            "fourth/package-lock.json",
            json.dumps({
                "lockfileVersion": 3,
                "packages": {"node_modules/fsevents": {"version": "2.3.3"}},
            }),
        )
        _, edges = npm_records(self.topsrcdir, manifests=("third", "fourth"))
        self.assertNotIn("npm:fsevents@2.3.3", edges["npm:react-dom@19.2.0"])

    def test_pnpm_license_comes_from_the_installed_copy(self):
        react = self.by_ref["npm:react@19.2.0"]
        self.assertEqual(react["licenses"], ["MIT"])
        self.assertEqual(react["occurrences"], ["third/node_modules/react"])
        self.assertNotIn("moz:npm.package-json-unreadable", react["properties"])

    def test_pnpm_nested_copy_of_another_version(self):
        scheduler = self.by_ref["npm:scheduler@0.27.0"]
        self.assertEqual(scheduler["licenses"], ["BSD"])
        self.assertEqual(
            scheduler["occurrences"],
            ["third/node_modules/react-dom/node_modules/scheduler"],
        )

    def test_pnpm_unreadable_or_missing_copy_is_reported(self):
        for ref in ("npm:react-dom@19.2.0", "npm:classnames@2.5.1"):
            record = self.by_ref[ref]
            self.assertEqual(record["licenses"], [])
            self.assertIn("moz:npm.package-json-unreadable", record["properties"])

    def test_dev_closure_leaves_out_what_ships(self):
        # react@19.2.0 ships from the same lockfile, scheduler@0.19.1 from
        # another one.
        records, edges = npm_records(
            self.topsrcdir, manifests=("first", "second", "third"), dev=True
        )
        self.assertEqual(
            [record["bom_ref"] for record in records], ["npm:webpack@5.109.0"]
        )
        # The product document describes react, so the edge to it is its own.
        self.assertEqual(edges, {})
        webpack = records[0]
        self.assertEqual(webpack["kinds"], ["dev"])
        self.assertEqual(
            webpack["properties"]["moz:npm.manifests"], "first,second,third"
        )

    def test_unreadable_integrity_is_reported(self):
        react_dom = self.by_ref["npm:react-dom@19.2.0"]
        self.assertEqual(react_dom["hashes"], [])
        self.assertEqual(
            react_dom["properties"]["moz:npm.integrity-unreadable"],
            "sha512-not!base64",
        )


class TestUpgradeManifestPurls(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.topsrcdir = self.tmp.name

    def upgrade(self, package_json, version, declared=None, release=None):
        if package_json is not None:
            path = os.path.join(self.topsrcdir, "js")
            os.makedirs(path, exist_ok=True)
            with open(os.path.join(path, "package.json"), "w") as f:
                json.dump(package_json, f)
        properties = {"moz:npm.name": declared, "moz:origin.release": release}
        record = {
            "bom_ref": "js",
            "version": version,
            "purl": ("github", "upstream", "js", version, {}),
            "properties": {k: v for k, v in properties.items() if v},
        }
        return upgrade_manifest_purls([record], self.topsrcdir), record

    def test_vendored_version_wins_over_a_revision(self):
        count, record = self.upgrade(
            {"name": "@quartzy/suggestions", "version": "0.1.1"},
            "abc123",
            declared="@quartzy/suggestions",
        )
        self.assertEqual(count, 1)
        self.assertEqual(
            record["purl"], ("npm", "@quartzy", "suggestions", "0.1.1", {})
        )
        self.assertEqual(record["version"], "abc123")
        self.assertEqual(record["properties"]["moz:npm.version"], "0.1.1")

    def test_release_supplies_the_version_without_a_package_json(self):
        count, record = self.upgrade(None, "abc123", declared="t", release="2.16.1")
        self.assertEqual(count, 1)
        self.assertEqual(record["purl"], ("npm", None, "t", "2.16.1", {}))

    def test_not_upgraded(self):
        self.assertEqual(self.upgrade(None, None, declared="t")[0], 0)
        # An undeclared package.json is never trusted for an identity.
        self.assertEqual(self.upgrade({"name": "x", "version": "1"}, "1")[0], 0)
        count, record = self.upgrade(
            {"name": "other", "version": "1"}, "1", declared="x"
        )
        self.assertEqual(count, 0)
        self.assertEqual(record["purl"][0], "github")
        self.assertEqual(record["properties"]["moz:npm.name-mismatch"], "other")


if __name__ == "__main__":
    main()
