# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import hashlib
import json
import os
import tempfile
import unittest

from mozunit import main

from mozbuild.vendor.sbom_gradle import (
    GradleSbomError,
    bom_ref,
    gradle_records,
    maven_purl,
    repository_root,
)


def pom(
    licenses=(), parent=None, extra="", namespace="http://maven.apache.org/POM/4.0.0"
):
    license_xml = "".join(
        f"<license><name>{name}</name><url>{url}</url></license>"
        for name, url in licenses
    )
    parent_xml = ""
    if parent:
        group, name, version = parent
        parent_xml = (
            f"<parent><groupId>{group}</groupId><artifactId>{name}</artifactId>"
            f"<version>{version}</version></parent>"
        )
    xmlns = f' xmlns="{namespace}"' if namespace else ""
    return (
        f"<project{xmlns}>"
        f"{parent_xml}{extra}<licenses>{license_xml}</licenses></project>"
    )


class GradleFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = self.tmp.name
        self.google = os.path.join(self.root, "google")
        self.cache = os.path.join(self.root, "files-2.1")

        # A file:// Maven repository, as automation fetches.
        self.core = self.maven(
            "androidx.core",
            "core",
            "1.19.0",
            "aar",
            pom(
                [
                    (
                        "The Apache Software License",
                        "https://www.apache.org/licenses/LICENSE-2.0.txt",
                    )
                ],
                extra="<description>Core</description><url>https://developer.android.com</url>"
                "<scm><url>https://android.googlesource.com</url></scm>",
            ),
        )
        # Inherits its licenses, from a parent POM in another repository.
        self.collection = self.maven(
            "androidx.collection",
            "collection",
            "1.6.0",
            "jar",
            pom(parent=("org.parent", "parent", "3")),
        )
        self.write(
            os.path.join(self.root, "central/org/parent/parent/3/parent-3.pom"),
            pom(
                [("MIT", "https://opensource.org/licenses/MIT")],
                extra="<url>https://parent.example</url>",
            ),
        )
        self.write(
            os.path.join(self.root, "central/org/other/other/1/other-1.jar"), "x"
        )
        # The Gradle cache, one checksum directory per file.
        self.snakeyaml = os.path.join(
            self.cache, "org.yaml/snakeyaml/2.2/aaaa/snakeyaml-2.2.jar"
        )
        self.write(self.snakeyaml, "snakeyaml")
        self.write(
            os.path.join(self.cache, "org.yaml/snakeyaml/2.2/bbbb/snakeyaml-2.2.pom"),
            pom([("Custom", None)], namespace=None),
        )
        self.sources = self.snakeyaml.replace(".jar", "-sources.jar")
        self.write(self.sources, "sources")

        # Only a classified artifact, and a parent chain too deep to follow.
        self.natives = os.path.join(
            self.root, "central/org/native/lib/1/lib-1-natives.jar"
        )
        self.write(self.natives, "natives")
        for depth in range(7):
            self.write(
                os.path.join(self.root, f"central/org/deep/a{depth}/1/a{depth}-1.pom"),
                pom(parent=("org.deep", f"a{depth + 1}", "1")),
            )
        self.write(os.path.join(self.root, "central/org/deep/a0/1/a0-1.jar"), "deep")

        self.document = {
            "version": "150.0",
            "components": [
                self.component(
                    "androidx.core",
                    "core",
                    "1.19.0",
                    [self.core],
                    ["androidx.collection:collection:1.6.0", "not:in:graph"],
                ),
                self.component(
                    "androidx.collection",
                    "collection",
                    "1.6.0",
                    [self.collection],
                ),
                self.component(
                    "org.other",
                    "other",
                    "1",
                    [os.path.join(self.root, "central/org/other/other/1/other-1.jar")],
                ),
                self.component(
                    "org.yaml", "snakeyaml", "2.2", [self.sources, self.snakeyaml]
                ),
                self.component("org.platform", "bom", "1", []),
                self.component("org.native", "lib", "1", [self.natives]),
                self.component(
                    "org.deep",
                    "a0",
                    "1",
                    [os.path.join(self.root, "central/org/deep/a0/1/a0-1.jar")],
                ),
                self.component(
                    "org.gone",
                    "gone",
                    "1",
                    [os.path.join(self.root, "central/org/gone/gone/1/gone-1.jar")],
                ),
            ],
        }
        self.run_records()

    def maven(self, group, name, version, extension, pom_text):
        directory = os.path.join(self.google, *group.split("."), name, version)
        artifact = os.path.join(directory, f"{name}-{version}.{extension}")
        self.write(artifact, f"{name} bytes")
        self.write(os.path.join(directory, f"{name}-{version}.pom"), pom_text)
        return artifact

    def component(self, group, name, version, files, dependencies=()):
        return {
            "group": group,
            "name": name,
            "version": version,
            "files": files,
            "dependencies": list(dependencies),
        }

    def write(self, path, content):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(content)

    def run_records(self):
        path = os.path.join(self.root, "runtime-dependencies.json")
        self.write(path, json.dumps(self.document))
        records, self.edges, self.version = gradle_records(path)
        self.by_ref = {record["bom_ref"]: record for record in records}


class TestGradleRecords(GradleFixture):
    def test_record(self):
        core = self.by_ref["maven:androidx.core:core@1.19.0"]
        self.assertEqual(core["name"], "androidx.core:core")
        self.assertEqual(core["purl"], ("maven", "androidx.core", "core", "1.19.0", {}))
        self.assertEqual(
            core["hashes"],
            [("SHA-256", hashlib.sha256(b"core bytes").hexdigest())],
        )
        self.assertEqual(core["licenses"], ["Apache-2.0"])
        self.assertEqual(core["description"], "Core")
        self.assertEqual(core["website"], "https://developer.android.com")
        self.assertEqual(core["vcs"], "https://android.googlesource.com")
        self.assertEqual(core["properties"], {})

    def test_license_inherited_from_a_parent_in_another_repository(self):
        collection = self.by_ref["maven:androidx.collection:collection@1.6.0"]
        self.assertEqual(collection["licenses"], ["MIT"])
        self.assertIsNone(collection["website"])

    def test_gradle_cache_layout_and_classifier(self):
        snakeyaml = self.by_ref["maven:org.yaml:snakeyaml@2.2"]
        self.assertEqual(snakeyaml["licenses"], ["Custom"])
        self.assertEqual(
            snakeyaml["hashes"],
            [("SHA-256", hashlib.sha256(b"snakeyaml").hexdigest())],
        )

    def test_missing_pom_and_artifact_are_reported(self):
        other = self.by_ref["maven:org.other:other@1"]
        self.assertEqual(other["licenses"], [])
        self.assertEqual(
            other["properties"]["moz:maven.pom-unreadable"],
            "no POM for org.other:other:1",
        )
        platform = self.by_ref["maven:org.platform:bom@1"]
        self.assertEqual(platform["hashes"], [])
        self.assertEqual(platform["properties"]["moz:maven.no-artifact"], "true")

    def test_classified_artifact_only_is_reported(self):
        natives = self.by_ref["maven:org.native:lib@1"]
        self.assertEqual(natives["hashes"], [])
        self.assertEqual(
            natives["properties"]["moz:maven.classified-artifacts"],
            "lib-1-natives.jar",
        )

    def test_too_deep_parent_chain_is_reported(self):
        deep = self.by_ref["maven:org.deep:a0@1"]
        self.assertEqual(deep["licenses"], [])
        self.assertEqual(
            deep["properties"]["moz:maven.pom-unreadable"],
            "parent chain of org.deep:a0:1 is too deep",
        )

    def test_unreadable_artifact_is_reported(self):
        gone = self.by_ref["maven:org.gone:gone@1"]
        self.assertEqual(gone["hashes"], [])
        self.assertIn("moz:maven.artifact-unreadable", gone["properties"])

    def test_edges_and_version(self):
        self.assertEqual(
            self.edges,
            {
                "maven:androidx.core:core@1.19.0": [
                    "maven:androidx.collection:collection@1.6.0"
                ]
            },
        )
        self.assertEqual(self.version, "150.0")

    def test_unreadable_document(self):
        for content in (
            "{ not json",
            json.dumps({}),
            json.dumps({"components": [{"group": "g"}]}),
        ):
            path = os.path.join(self.root, "bad.json")
            self.write(path, content)
            with self.assertRaises(GradleSbomError):
                gradle_records(path)
        with self.assertRaises(GradleSbomError):
            gradle_records(os.path.join(self.root, "absent.json"))


class TestGradleDocument(GradleFixture):
    class Repo:
        head_rev = "abc"

        def get_commit_time(self):
            return 0

    def build(self, **kwargs):
        from mozbuild.action.generate_sbom import build_gradle_document

        path = os.path.join(self.root, "runtime-dependencies.json")
        return json.loads(build_gradle_document(path, self.Repo(), "Fenix", **kwargs))

    def test_document(self):
        document = self.build()
        root = document["metadata"]["component"]
        self.assertEqual((root["name"], root["version"]), ("Fenix", "150.0"))
        self.assertIn(
            "pkg:maven/androidx.core/core@1.19.0",
            [component.get("purl") for component in document["components"]],
        )
        self.assertEqual(
            self.build(version="151.0")["metadata"]["component"]["version"], "151.0"
        )

    def test_missing_version(self):
        from mozbuild.action.generate_sbom import SbomError

        del self.document["version"]
        self.run_records()
        with self.assertRaisesRegex(SbomError, "names no version"):
            self.build()

    def test_rejected_arguments(self):
        from mozbuild.action.generate_sbom import generate

        path = os.path.join(self.root, "runtime-dependencies.json")
        output = os.path.join(self.root, "sbom.json")
        for arguments in ({}, {"product_name": "Fenix", "strict": True}):
            self.assertEqual(
                generate(
                    self.root,
                    self.root,
                    self.Repo(),
                    output=output,
                    gradle_runtime_dependencies=path,
                    **arguments,
                ),
                1,
            )
        self.assertFalse(os.path.exists(output))


class TestHelpers(unittest.TestCase):
    def test_identity(self):
        self.assertEqual(bom_ref("a.b", "c", "1"), "maven:a.b:c@1")
        self.assertEqual(maven_purl("a.b", "c", "1"), ("maven", "a.b", "c", "1", {}))

    def test_repository_root(self):
        self.assertEqual(
            repository_root("/r/a/b/c/1/c-1.jar", "a.b", "c", "1"), ("maven", "/r")
        )
        self.assertEqual(
            repository_root("/g/a.b/c/1/ff/c-1.jar", "a.b", "c", "1"), ("cache", "/g")
        )
        self.assertIsNone(repository_root("/elsewhere/c-1.jar", "a.b", "c", "1"))


if __name__ == "__main__":
    main()
