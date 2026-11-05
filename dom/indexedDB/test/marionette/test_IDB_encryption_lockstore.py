# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import re
import sys
from pathlib import Path

sys.path.append(os.fspath(Path(__file__).parents[3] / "quota/test/marionette"))

from quota_test_case import QuotaTestCase

QM_ENCRYPTION_PREF = "dom.quotaManager.encryption.enabled"
QM_TESTING_PREF = "dom.quotaManager.testing"


class IDBEncryptionLockstore(QuotaTestCase):
    """
    Verify that IndexedDB data is encrypted on disk when
    dom.quotaManager.encryption.enabled is true (lockstore backend).
    """

    def setUp(self):
        super().setUp()

        self.testHTML = "dom/indexedDB/basicIDB_PBM.html"
        self.IDBName = "IDBTest"
        self.IDBStoreName = "IDBTestStore"
        self.IDBVersion = 1
        self.IDBValue = "test_IDB_Encryption_Lockstore"
        self.idbStoragePath = None

        self.profilePath = self.marionette.instance.profile.profile

        # QuotaManager reads encryption.enabled once at startup, so write it to
        # the profile and restart before touching storage.
        self.restartWithCleanStorage({
            QM_ENCRYPTION_PREF: True,
            QM_TESTING_PREF: True,
        })

    def tearDown(self):
        super().tearDown()

    def test_encrypted_IDB_sqlite_ondisk(self):
        with self.using_new_window(self.testHTML, private=False) as (
            self.origin,
            self.persistenceType,
        ):
            self.marionette.execute_async_script(
                """
                    const [idb, store, key, value, resolve] = arguments;
                    window.wrappedJSObject.addDataIntoIDB(idb, store, key, value).then(resolve);
                """,
                script_args=(
                    self.IDBName,
                    self.IDBStoreName,
                    "textKey",
                    self.IDBValue,
                ),
            )

            self.ensureInvariantHolds(lambda _: self.sqliteWALReleased())
            self.ensureInvariantHolds(
                lambda _: (
                    self.findDirObj(self.getIDBStoragePath(), ".sqlite", True)
                    is not None
                )
            )

            sqliteDBFile = self.findDirObj(self.getIDBStoragePath(), ".sqlite", True)
            with open(sqliteDBFile, "rb") as f:
                foundRawValue = (
                    re.search(self.IDBValue.encode("ascii"), f.read()) is not None
                )
            self.assertFalse(foundRawValue, "IDB data on disk is not encrypted")

    def test_encrypted_IDB_blob_ondisk(self):
        with self.using_new_window(self.testHTML, private=False) as (
            self.origin,
            self.persistenceType,
        ):
            self.marionette.execute_async_script(
                """
                    const [idb, store, key, value, resolve] = arguments;
                    const blobValue = new Blob([value], {type:'text/plain'});
                    window.wrappedJSObject.addDataIntoIDB(idb, store, key, blobValue).then(resolve);
                """,
                script_args=(
                    self.IDBName,
                    self.IDBStoreName,
                    "blobKey",
                    self.IDBValue,
                ),
            )

            self.ensureInvariantHolds(lambda _: self.sqliteWALReleased())
            self.ensureInvariantHolds(
                lambda _: (
                    self.findDirObj(self.getIDBStoragePath(), ".files", False)
                    is not None
                )
            )

            idbBlobDir = self.findDirObj(self.getIDBStoragePath(), ".files", False)
            idbBlobPath = os.path.join(idbBlobDir, "1")
            self.ensureInvariantHolds(lambda _: os.path.exists(idbBlobPath))

            with open(idbBlobPath, "rb") as f:
                foundRawValue = (
                    re.search(self.IDBValue.encode("ascii"), f.read()) is not None
                )
            self.assertFalse(foundRawValue, "IDB blob data on disk is not encrypted")

    def test_lockstore_keystore_exists(self):
        with self.using_new_window(self.testHTML, private=False) as (
            self.origin,
            self.persistenceType,
        ):
            self.marionette.execute_async_script(
                """
                    const [idb, store, key, value, resolve] = arguments;
                    window.wrappedJSObject.addDataIntoIDB(idb, store, key, value).then(resolve);
                """,
                script_args=(
                    self.IDBName,
                    self.IDBStoreName,
                    "textKey",
                    self.IDBValue,
                ),
            )

            lockstoreDb = os.path.join(self.profilePath, "lockstore.keys.sqlite")
            self.ensureInvariantHolds(lambda _: os.path.exists(lockstoreDb))

            self.assertTrue(
                os.path.getsize(lockstoreDb) > 0,
                "lockstore database is empty",
            )

    def getIDBStoragePath(self):
        if self.idbStoragePath is not None:
            return self.idbStoragePath

        assert self.origin is not None
        assert self.persistenceType is not None

        self.idbStoragePath = self.getStoragePath(
            self.profilePath, self.origin, self.persistenceType, "idb"
        )
        return self.idbStoragePath

    def sqliteWALReleased(self):
        if not os.path.exists(self.getIDBStoragePath()):
            return False
        walPath = self.findDirObj(self.idbStoragePath, ".sqlite-wal", True)
        return walPath is None or os.stat(walPath).st_size == 0


class IDBEncryptionLockstoreControl(QuotaTestCase):
    """
    Control test: with encryption disabled, IDB data is plaintext on disk.
    Validates the encryption tests above are not vacuously passing.
    """

    def setUp(self):
        super().setUp()

        self.testHTML = "dom/indexedDB/basicIDB_PBM.html"
        self.IDBName = "IDBTest"
        self.IDBStoreName = "IDBTestStore"
        self.IDBVersion = 1
        self.IDBValue = "test_IDB_No_Encryption_Control"
        self.idbStoragePath = None

        self.profilePath = self.marionette.instance.profile.profile

        self.restartWithCleanStorage({
            QM_ENCRYPTION_PREF: False,
            QM_TESTING_PREF: True,
        })

    def tearDown(self):
        super().tearDown()

    def test_unencrypted_IDB_sqlite_ondisk(self):
        with self.using_new_window(self.testHTML, private=False) as (
            self.origin,
            self.persistenceType,
        ):
            self.marionette.execute_async_script(
                """
                    const [idb, store, key, value, resolve] = arguments;
                    window.wrappedJSObject.addDataIntoIDB(idb, store, key, value).then(resolve);
                """,
                script_args=(
                    self.IDBName,
                    self.IDBStoreName,
                    "textKey",
                    self.IDBValue,
                ),
            )

            self.ensureInvariantHolds(lambda _: self.sqliteWALReleased())
            self.ensureInvariantHolds(
                lambda _: (
                    self.findDirObj(self.getIDBStoragePath(), ".sqlite", True)
                    is not None
                )
            )

            sqliteDBFile = self.findDirObj(self.getIDBStoragePath(), ".sqlite", True)
            with open(sqliteDBFile, "rb") as f:
                foundRawValue = (
                    re.search(self.IDBValue.encode("ascii"), f.read()) is not None
                )
            self.assertTrue(
                foundRawValue,
                "IDB data should be plaintext when encryption is disabled",
            )

    def getIDBStoragePath(self):
        if self.idbStoragePath is not None:
            return self.idbStoragePath

        assert self.origin is not None
        assert self.persistenceType is not None

        self.idbStoragePath = self.getStoragePath(
            self.profilePath, self.origin, self.persistenceType, "idb"
        )
        return self.idbStoragePath

    def sqliteWALReleased(self):
        if not os.path.exists(self.getIDBStoragePath()):
            return False
        walPath = self.findDirObj(self.idbStoragePath, ".sqlite-wal", True)
        return walPath is None or os.stat(walPath).st_size == 0
