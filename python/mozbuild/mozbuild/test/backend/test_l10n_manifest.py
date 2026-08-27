# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os

import mozpack.path as mozpath
from mozunit import main

from mozbuild.backend.recursivemake import RecursiveMakeBackend
from mozbuild.frontend.l10n_manifest import MANIFEST_VERSION
from mozbuild.test.backend.common import BackendTester


class TestL10nManifestBackendIntegration(BackendTester):
    def test_locale_pp_defines_in_manifest(self):
        env = self._consume("l10n-manifest", RecursiveMakeBackend)

        manifest_path = mozpath.join(env.topobjdir, "l10n-manifest.json")
        self.assertTrue(os.path.exists(manifest_path), manifest_path)

        with open(manifest_path, encoding="utf-8") as f:
            raw = json.load(f)

        self.assertEqual(raw["version"], MANIFEST_VERSION)
        self.assertEqual(len(raw["contexts"]), 1)

        ctx = raw["contexts"][0]
        self.assertEqual(
            ctx["locale_pp_defines"],
            {
                "ANDROID_MARKETPLACE_AB_CD": {
                    "es*": "es-ES",
                    "es-MX": "es-MX",
                    "fr": "fr",
                },
            },
        )
        self.assertEqual(ctx["jar_sections"], [])
        self.assertEqual(ctx["localized_files"], [])
        self.assertEqual(ctx["localized_pp_files"], [])
        self.assertEqual(ctx["localized_generated_files"], [])


if __name__ == "__main__":
    main()
