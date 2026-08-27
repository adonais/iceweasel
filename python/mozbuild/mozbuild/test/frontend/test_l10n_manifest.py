# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import tempfile
import unittest
from pathlib import Path

from mozunit import main

from mozbuild.frontend.l10n_manifest import (
    MANIFEST_VERSION,
    JarEntry,
    JarSection,
    L10nManifest,
    L10nManifestContextData,
    LocalizedFileGroup,
    LocalizedGenScript,
    build_l10n_manifest_from_substs,
    load_l10n_manifest,
    write_l10n_manifest,
)


class TestL10nManifestRoundTrip(unittest.TestCase):
    def test_round_trip(self):
        manifest = L10nManifest(
            version=MANIFEST_VERSION,
            moz_app_id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}",
            moz_app_version="121.0",
            moz_app_displayname="Firefox",
            moz_build_app="browser",
            contexts=[
                L10nManifestContextData(
                    relsrcdir="browser/locales",
                    install_subdir="",
                    defines={"FOO": "bar"},
                    locale_pp_defines={
                        "ANDROID_MARKETPLACE_AB_CD": {
                            "es*": "es-ES",
                            "es-MX": "es-MX",
                            "fr": "fr",
                        },
                    },
                    jar_sections=[
                        JarSection(
                            name="browser",
                            base="",
                            relativesrcdir="browser/locales",
                            chrome_manifests=["locale browser %en-US %"],
                            pp_includes=[],
                            entries=[
                                JarEntry(
                                    source="en-US/foo.ftl",
                                    output="foo.ftl",
                                    is_locale=True,
                                    preprocess=False,
                                ),
                            ],
                        ),
                    ],
                    localized_files=[
                        LocalizedFileGroup(subpath="..", sources=["!updater.ini"]),
                    ],
                    localized_pp_files=[],
                    localized_generated_files=[
                        LocalizedGenScript(
                            script="/topsrcdir/browser/locales/generate_ini.py",
                            method="main",
                            inputs=["en-US/updater/updater.ini"],
                            outputs=["updater.ini"],
                            flags=[],
                            force=False,
                        ),
                    ],
                ),
            ],
        )

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "l10n-manifest.json"
            write_l10n_manifest(manifest, path)
            loaded = load_l10n_manifest(path)

        self.assertEqual(loaded, manifest)

    def test_empty_manifest_round_trip(self):
        manifest = L10nManifest(
            version=MANIFEST_VERSION,
            moz_app_id="",
            moz_app_version="",
            moz_app_displayname="",
            moz_build_app="",
            contexts=[],
        )

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "l10n-manifest.json"
            write_l10n_manifest(manifest, path)
            loaded = load_l10n_manifest(path)

        self.assertEqual(loaded, manifest)


class TestBuildL10nManifestFromSubsts(unittest.TestCase):
    def test_full_substs(self):
        substs = {
            "MOZ_APP_ID": "{abcd}",
            "MOZ_APP_VERSION": "121.0",
            "MOZ_APP_DISPLAYNAME": "Firefox",
            "MOZ_BUILD_APP": "browser",
        }
        ctx = L10nManifestContextData(
            relsrcdir="browser/locales",
            install_subdir="",
            defines={},
            locale_pp_defines={},
        )
        manifest = build_l10n_manifest_from_substs(substs, [ctx])

        self.assertEqual(manifest.version, MANIFEST_VERSION)
        self.assertEqual(manifest.moz_app_id, "{abcd}")
        self.assertEqual(manifest.moz_app_version, "121.0")
        self.assertEqual(manifest.moz_app_displayname, "Firefox")
        self.assertEqual(manifest.moz_build_app, "browser")
        self.assertEqual(manifest.contexts, [ctx])

    def test_missing_substs_default_to_empty_string(self):
        manifest = build_l10n_manifest_from_substs({}, [])
        self.assertEqual(manifest.moz_app_id, "")
        self.assertEqual(manifest.moz_app_version, "")
        self.assertEqual(manifest.moz_app_displayname, "")
        self.assertEqual(manifest.moz_build_app, "")
        self.assertEqual(manifest.contexts, [])


if __name__ == "__main__":
    main()
