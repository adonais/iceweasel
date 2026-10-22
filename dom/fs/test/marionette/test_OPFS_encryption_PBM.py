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


class OPFSEncryptionPBM(QuotaTestCase):
    """
    Bug2071656: Ensure OPFS metadata gets encrypted in Private Browsing Mode.
    Creating a file handle writes the file's name into the metadata database,
    so that name must not be readable in the database file of a private origin.
    """

    def setUp(self):
        super().setUp()

        # This test exercises QuotaManager private-browsing encryption, which is
        # unrelated to SQLite at-rest encryption. Rather, the at-rest encryption
        # encrypts the non-private database as well and removes the contrast
        # this test relies on. The pref is locked, so a build which has it on
        # can only be skipped, not overridden.
        if self.marionette.get_pref("security.storage.encryption.sqlite.enabled"):
            self.skipTest(
                "Unrelated to SQLite at-rest encryption; skipped while it is on"
            )

        self.testHTML = "dom/fs/basicOPFS_PBM.html"

        self.fileName = "test_OPFS_Encryption_PBM.txt"

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

    def test_ensure_raw_OPFS_metadata_ondisk_not_in_PBM(self):
        """
        A non-private origin's database is plaintext. This case functions
        as the positive control for the below PBM case.
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

    def test_ensure_encrypted_OPFS_metadata_ondisk_in_PBM(self):
        with self.using_new_window(self.testHTML, private=True) as (
            self.origin,
            self.persistenceType,
        ):
            self.runAndValidate(
                lambda exists: self.assertFalse(exists, "Data on disk is not encrypted")
            )

    def runAndValidate(self, validator):
        self.marionette.execute_async_script(
            """
                const [name, resolve] = arguments;
                window.wrappedJSObject.createFileInOPFS(name).then(resolve);
            """,
            script_args=(self.fileName,),
        )

        self.validateDatabase(validator)

    def validateDatabase(self, validator):
        self.resetStoragesForClient(self.persistenceType, self.origin, "fs")

        databaseFile = os.path.join(self.getFsStoragePath(), self.databaseFileName)
        self.ensureInvariantHolds(lambda _: os.path.exists(databaseFile))

        with open(databaseFile, "rb") as f_binary:
            foundRawValue = (
                re.search(self.fileName.encode("utf-16-le"), f_binary.read())
                is not None
            )

        validator(foundRawValue)

    def getFsStoragePath(self):
        if self.fsStoragePath is not None:
            return self.fsStoragePath

        assert self.origin is not None
        assert self.persistenceType is not None

        self.fsStoragePath = self.getStoragePath(
            self.profilePath, self.origin, self.persistenceType, "fs"
        )

        print("fs origin directory = " + self.fsStoragePath)
        return self.fsStoragePath
