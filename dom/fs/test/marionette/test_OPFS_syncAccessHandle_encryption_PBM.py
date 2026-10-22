# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import re
import sys
from pathlib import Path

sys.path.append(os.fspath(Path(__file__).parents[3] / "quota/test/marionette"))

from quota_test_case import QuotaTestCase

OPFS_PBM_PREF = "dom.fs.privateBrowsing.enabled"
QM_TESTING_PREF = "dom.quotaManager.testing"


class OPFSSyncAccessHandleEncryptionPBM(QuotaTestCase):
    """
    Bug2070040: Ensure the file contents a sync access handle writes get
    encrypted in Private Browsing Mode. This covers the file entries
    themselves, unlike test_OPFS_encryption_PBM, which covers their names in
    the metadata database.
    """

    def setUp(self):
        super().setUp()

        self.testHTML = "dom/fs/syncAccessHandleOPFS_PBM.html"
        self.fileName = "test_OPFS_SyncAccessHandle_Encryption_PBM.txt"
        self.fileContents = "test_OPFS_SyncAccessHandle_Encryption_PBM"

        self.databaseFileName = "metadata.sqlite"
        self.fsStoragePath = None

        self.profilePath = self.marionette.instance.profile.profile

        self.defaultOPFSPrefValue = self.marionette.get_pref(OPFS_PBM_PREF)
        self.marionette.set_pref(OPFS_PBM_PREF, True)

        self.defaultQMPrefValue = self.marionette.get_pref(QM_TESTING_PREF)
        self.marionette.set_pref(QM_TESTING_PREF, True)

    def tearDown(self):
        super().tearDown()

        self.marionette.set_pref(OPFS_PBM_PREF, self.defaultOPFSPrefValue)
        self.marionette.set_pref(QM_TESTING_PREF, self.defaultQMPrefValue)

    def test_ensure_raw_OPFS_file_contents_ondisk_not_in_PBM(self):
        """
        A non-private origin's file entries are plaintext. Finding the contents
        here is what makes the private case below meaningful: without it, a
        passing test could just mean the file was never written.
        """

        with self.using_new_window(self.testHTML, private=False) as (
            self.origin,
            self.persistenceType,
        ):
            self.runAndValidate(
                lambda exists: self.assertTrue(
                    exists, "Failed to find expected data on disk"
                )
            )

    def test_ensure_encrypted_OPFS_file_contents_ondisk_in_PBM(self):
        with self.using_new_window(self.testHTML, private=True) as (
            self.origin,
            self.persistenceType,
        ):
            self.runAndValidate(
                lambda exists: self.assertFalse(exists, "Data on disk is not encrypted")
            )

    def runAndValidate(self, validator):
        error = self.marionette.execute_async_script(
            """
                const [name, value, resolve] = arguments;
                window.wrappedJSObject.writeFileWithSyncAccessHandle(name, value)
                    .then(() => resolve(null), e => resolve(String(e)));
            """,
            script_args=(self.fileName, self.fileContents),
        )
        self.assertIsNone(error)

        self.validateFileEntries(validator)

    def validateFileEntries(self, validator):
        self.resetStoragesForClient(self.persistenceType, self.origin, "fs")

        self.ensureInvariantHolds(lambda _: self.findFileEntry() is not None)

        with open(self.findFileEntry(), "rb") as f_binary:
            foundRawValue = (
                re.search(self.fileContents.encode("ascii"), f_binary.read())
                is not None
            )

        validator(foundRawValue)

    def findFileEntry(self):
        """
        A file entry is not stored under the name it was created with, so find
        it by elimination: everything below the fs directory which isn't the
        metadata database is a file entry, and this test only ever creates one.
        """

        for root, _, files in os.walk(self.getFsStoragePath()):
            for name in files:
                if name.startswith(self.databaseFileName):
                    continue
                return os.path.join(root, name)
        return None

    def getFsStoragePath(self):
        if self.fsStoragePath is not None:
            return self.fsStoragePath

        assert self.origin is not None
        assert self.persistenceType is not None

        self.fsStoragePath = self.getStoragePath(
            self.profilePath, self.origin, self.persistenceType, "fs"
        )

        self.logger.info(f"fs origin directory = {self.fsStoragePath}")
        return self.fsStoragePath
