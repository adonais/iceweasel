# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import shutil
import tempfile
import unittest

import mozpack.path as mozpath
from mozunit import main

from mozbuild.frontend.context import VARIABLES, Context, GeneratedFilesList
from mozbuild.frontend.data import DeclaredLicensedPaths, DeclaredLicenseNotice
from mozbuild.licenses import (
    LicenseCollection,
    LicenseError,
    app_license_blocks,
    covering_manifest,
    from_context,
)


class FakeConfig:
    def __init__(self, topsrcdir):
        self.topsrcdir = topsrcdir
        self.topobjdir = mozpath.join(topsrcdir, "obj")
        self.substs = {}
        self.defines = {}


class FakeContext(dict):
    """Just enough of a Context for ContextDerived.__init__."""

    def __init__(self, relsrcdir, config):
        dict.__init__(self)
        self.relsrcdir = relsrcdir
        self.config = config
        self.objdir = mozpath.join(config.topobjdir, relsrcdir)
        self.srcdir = mozpath.join(config.topsrcdir, relsrcdir)
        self.main_path = mozpath.join(self.srcdir, "moz.build")
        self.all_paths = [self.main_path]
        self.source_stack = []


class TestLicenseCollection(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.config = FakeConfig(self.tmpdir)
        self.text = mozpath.join(self.tmpdir, "notice.txt")
        with open(self.text, "w") as fh:
            fh.write("NOTICE TEXT\n")
        self.html = mozpath.join(self.tmpdir, "notice.html")
        with open(self.html, "w") as fh:
            fh.write("<p>NOTICE</p>\n")

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def notice(self, license_id, relsrcdir="lib", paths=(), text=None):
        return DeclaredLicenseNotice(
            FakeContext(relsrcdir, self.config),
            license_id,
            f"{license_id} License",
            text or self.text,
            paths=paths,
        )

    def coverage(self, license_id, relsrcdir="lib", paths=()):
        return DeclaredLicensedPaths(
            FakeContext(relsrcdir, self.config), license_id, paths
        )

    def test_declaration_paths_are_recorded(self):
        collection = LicenseCollection()
        collection.add(self.notice("MIT", paths=["third_party/rust/byteorder"]))
        self.assertEqual(
            collection.records()[0]["paths"], ["third_party/rust/byteorder"]
        )

    def test_declaration_yields_a_record(self):
        collection = LicenseCollection()
        self.assertTrue(collection.add(self.notice("MIT")))
        records = collection.records()
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["id"], "MIT")
        self.assertEqual(records[0]["declared_in"], "lib")
        self.assertEqual(records[0]["text"], "NOTICE TEXT\n")
        self.assertFalse(records[0]["html"])

    def test_html_notice_is_flagged_by_extension(self):
        collection = LicenseCollection()
        collection.add(self.notice("mpl", text=self.html))
        self.assertTrue(collection.records()[0]["html"])

    def test_non_license_object_is_ignored(self):
        self.assertFalse(LicenseCollection().add(object()))

    def test_coverage_without_paths_uses_the_directory(self):
        collection = LicenseCollection()
        collection.add(self.notice("MIT"))
        collection.add(self.coverage("MIT", relsrcdir="gfx/skia"))
        # Declaring a license does not claim the declaring directory's code:
        # toolkit/content/licenses holds shared texts but is not MIT-licensed.
        self.assertEqual(collection.records()[0]["paths"], ["gfx/skia"])

    def test_coverage_with_paths_narrows_the_directory(self):
        collection = LicenseCollection()
        collection.add(self.notice("MIT"))
        collection.add(self.coverage("MIT", relsrcdir="d", paths=["d/a.js"]))
        self.assertEqual(collection.records()[0]["paths"], ["d/a.js"])

    def test_coverage_without_a_notice_is_dropped(self):
        # The notice may live in a directory this configuration never
        # traverses. The `license-declarations` linter catches a genuinely missing one.
        collection = LicenseCollection()
        collection.add(self.notice("MIT"))
        collection.add(self.coverage("nope"))
        self.assertEqual([r["id"] for r in collection.records()], ["MIT"])

    def test_double_declaration_is_an_error(self):
        collection = LicenseCollection()
        collection.add(self.notice("MIT", relsrcdir="a"))
        with self.assertRaisesRegex(LicenseError, "declared in both"):
            collection.add(self.notice("MIT", relsrcdir="b"))

    def test_redeclaring_in_the_same_directory_is_allowed(self):
        collection = LicenseCollection()
        collection.add(self.notice("MIT", relsrcdir="a"))
        collection.add(self.notice("MIT", relsrcdir="a"))
        self.assertEqual(len(collection.records()), 1)

    def test_records_are_sorted_by_id(self):
        collection = LicenseCollection()
        for license_id in ("zlib", "MIT", "apache"):
            collection.add(self.notice(license_id, relsrcdir=license_id))
        self.assertEqual(
            [r["id"] for r in collection.records()], ["MIT", "apache", "zlib"]
        )

    def test_text_paths_are_reported_for_dependency_tracking(self):
        collection = LicenseCollection()
        collection.add(self.notice("MIT"))
        self.assertEqual(collection.text_paths, [self.text])
        self.assertTrue(os.path.isabs(collection.text_paths[0]))


class TestCoveringManifest(unittest.TestCase):
    """The moz.yaml a directory inherits its license facts from."""

    def setUp(self):
        self.tmpdir = mozpath.normpath(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def manifest(self, relsrcdir, body):
        directory = mozpath.join(self.tmpdir, relsrcdir)
        os.makedirs(directory, exist_ok=True)
        with open(mozpath.join(directory, "moz.yaml"), "w") as fh:
            fh.write(body)

    def covering(self, relsrcdir):
        return covering_manifest(
            mozpath.join(self.tmpdir, relsrcdir), self.tmpdir, cache={}
        )

    def test_the_nearest_manifest_above_a_directory_covers_it(self):
        self.manifest("lib", "origin:\n  license: MIT\n")
        os.makedirs(mozpath.join(self.tmpdir, "lib/src"))
        self.assertEqual(self.covering("lib/src").license, "MIT")

    def test_a_directory_no_manifest_covers_has_none(self):
        os.makedirs(mozpath.join(self.tmpdir, "lib"))
        self.assertIsNone(self.covering("lib"))

    def test_several_declared_licenses_are_one_expression(self):
        self.manifest("lib", "origin:\n  license:\n    - MIT\n    - Apache-2.0\n")
        self.assertEqual(self.covering("lib").license, "MIT AND Apache-2.0")

    def test_the_license_file_is_relative_to_the_manifest(self):
        self.manifest("lib", "origin:\n  license-file: COPYING\n")
        self.assertEqual(
            self.covering("lib").license_file,
            mozpath.join(self.tmpdir, "lib/COPYING"),
        )

    def test_the_license_file_is_relative_to_the_vendor_directory(self):
        # gfx/angle/moz.yaml vendors into third_party/angle.
        self.manifest(
            "gfx/angle",
            "origin:\n  license-file: LICENSE\n"
            "vendoring:\n  vendor-directory: third_party/angle\n",
        )
        self.assertEqual(
            self.covering("gfx/angle").license_file,
            mozpath.join(self.tmpdir, "third_party/angle/LICENSE"),
        )

    def test_a_manifest_that_does_not_parse_still_covers_its_directory(self):
        # Reporting the syntax error is the vendoring code's job; stopping the
        # walk here keeps a manifest further up from answering for this one.
        self.manifest("lib", "origin: [unterminated\n")
        self.manifest("", "origin:\n  license: MIT\n")
        self.assertIsNone(self.covering("lib").license)


class TestNoticeTextFile(unittest.TestCase):
    """Where from_context() reads a declaration's verbatim text from."""

    def setUp(self):
        self.tmpdir = mozpath.normpath(tempfile.mkdtemp())
        os.makedirs(mozpath.join(self.tmpdir, "lib"))

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def write(self, relpath):
        path = mozpath.join(self.tmpdir, relpath)
        with open(path, "w") as fh:
            fh.write("NOTICE TEXT\n")
        return path

    def notice(self, text=None, manifest=None):
        if manifest is not None:
            with open(mozpath.join(self.tmpdir, "lib/moz.yaml"), "w") as fh:
                fh.write(manifest)
        context = Context(VARIABLES, FakeConfig(self.tmpdir))
        context.push_source(mozpath.join(self.tmpdir, "lib/moz.build"))
        context["LICENSES"] += ["mylib"]
        context["LICENSES"]["mylib"].title = "mylib License"
        if text is not None:
            context["LICENSES"]["mylib"].text = text
        (notice,) = list(from_context(context))
        return notice

    def test_text_names_the_file_relative_to_the_moz_build(self):
        path = self.write("lib/LICENSE-NOTICE.txt")
        self.assertEqual(self.notice(text="LICENSE-NOTICE.txt").text_path, path)

    def test_the_covering_manifest_names_it_when_text_does_not(self):
        path = self.write("lib/COPYING")
        self.assertEqual(
            self.notice(manifest="origin:\n  license-file: COPYING\n").text_path,
            path,
        )

    def test_text_wins_over_the_covering_manifest(self):
        self.write("lib/COPYING")
        path = self.write("lib/LICENSE-NOTICE.txt")
        self.assertEqual(
            self.notice(
                text="LICENSE-NOTICE.txt",
                manifest="origin:\n  license-file: COPYING\n",
            ).text_path,
            path,
        )

    def test_neither_is_an_error(self):
        with self.assertRaisesRegex(LicenseError, "requires a text file"):
            self.notice(manifest="origin:\n  license: MIT\n")


class TestAppLicenseBlocks(unittest.TestCase):
    def context(self, inputs):
        # A real Context: SourcePath resolution asserts on anything else.
        config = FakeConfig(mozpath.abspath("/src"))
        context = Context(VARIABLES, config)
        context.push_source(mozpath.join(config.topsrcdir, "browser/base/moz.build"))
        if inputs is not None:
            generated = GeneratedFilesList()
            generated += ["license.html"]
            generated["license.html"].inputs = inputs
            context["GENERATED_FILES"] = generated
        return context

    def test_extra_source_inputs_are_blocks(self):
        context = self.context([
            "/toolkit/content/license.html.mako",
            "!/licenses.json",
            "content/overrides/app-license.html",
        ])
        self.assertEqual(
            app_license_blocks(context),
            [mozpath.join(context.srcdir, "content/overrides/app-license.html")],
        )

    def test_a_context_generating_nothing_has_no_blocks(self):
        self.assertEqual(app_license_blocks(self.context(None)), [])


if __name__ == "__main__":
    main()
