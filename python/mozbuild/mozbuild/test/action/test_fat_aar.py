# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import unittest
from unittest.mock import patch

import mozunit

from mozbuild.action.fat_aar import _artifact_job, fat_aar


class TestArtifactJob(unittest.TestCase):
    def test_android_without_appservices(self):
        self.assertEqual(_artifact_job("arm64-v8a", False), "android-aarch64-opt")
        self.assertEqual(_artifact_job("armeabi-v7a", False), "android-arm-opt")
        self.assertEqual(_artifact_job("x86_64", False), "android-x86_64-opt")

    def test_android_with_appservices(self):
        """An in-tree app-services changes what the megazord contains."""
        self.assertEqual(
            _artifact_job("arm64-v8a", True), "android-aarch64-appservices-opt"
        )
        self.assertEqual(
            _artifact_job("armeabi-v7a", True), "android-arm-appservices-opt"
        )
        self.assertEqual(
            _artifact_job("x86_64", True), "android-x86_64-appservices-opt"
        )

    def test_desktop_is_unaffected(self):
        for arch in ("linux-x86-64", "darwin-x86-64", "win32-x86-64"):
            self.assertEqual(_artifact_job(arch, False), _artifact_job(arch, True))


class TestDesktopArchives(unittest.TestCase):
    def test_missing_desktop_archive_is_rejected(self):
        with patch("mozbuild.action.fat_aar._download_zip") as download:
            self.assertEqual(
                fat_aar("distdir", {}, desktop_zip_paths={"linux-x86-64": None}), 1
            )
        download.assert_not_called()


if __name__ == "__main__":
    mozunit.main()
