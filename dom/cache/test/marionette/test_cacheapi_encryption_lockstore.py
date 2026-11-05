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


class CacheAPIEncryptionLockstore(QuotaTestCase):
    """
    Verify that Cache API data is encrypted on disk when
    dom.quotaManager.encryption.enabled is true (lockstore backend).
    """

    def setUp(self):
        super().setUp()

        self.testHTML = "dom/cache/basicCacheAPI_PBM.html"
        self.cacheName = "CacheLockstoreTest"
        self.profilePath = self.marionette.instance.profile.profile
        self.cacheAPIStoragePath = None

        # QuotaManager reads encryption.enabled once at startup, so write it to
        # the profile and restart before touching storage.
        self.restartWithCleanStorage({
            QM_ENCRYPTION_PREF: True,
            QM_TESTING_PREF: True,
        })

        self.cacheRequestStr = "https://example.com/"
        self.cacheResponseStr = "CacheAPIEncryptionLockstore"

        self.cacheDBFileName = "caches.sqlite"
        self.cacheDBJournalFileName = "caches.sqlite-wal"

        self.dbCheckpointThresholdBytes = 512 * 1024

    def tearDown(self):
        super().tearDown()

    def test_encrypted_cache_sqlite_ondisk(self):
        with self.using_new_window(self.testHTML, private=False) as (
            self.origin,
            self.persistenceType,
        ):
            self.marionette.execute_async_script(
                """
                    const [name, requestStr, responseStr, resolve] = arguments;
                    const request = new Request(requestStr);
                    const response = new Response(responseStr);
                    window.wrappedJSObject.addDataIntoCache(name, request, response)
                                        .then(resolve);
                """,
                script_args=(
                    self.cacheName,
                    self.cacheRequestStr,
                    self.cacheResponseStr,
                ),
            )

            self.ensureInvariantHolds(
                lambda _: os.path.exists(self.getCacheAPIStoragePath())
            )

            self.ensureInvariantHolds(
                lambda _: (
                    self.findDirObj(
                        self.getCacheAPIStoragePath(),
                        self.cacheDBJournalFileName,
                        True,
                    )
                    is not None
                )
            )
            dbJournalFile = self.findDirObj(
                self.getCacheAPIStoragePath(), self.cacheDBJournalFileName, True
            )

            self.assertFalse(
                self.cacheRequestStr.encode("ascii")
                in open(dbJournalFile, "rb").read(),
                "Cache request data in journal is not encrypted",
            )

            self.assertTrue(
                self.resetStoragesForClient(self.persistenceType, self.origin, "cache")
            )

            dbFile = self.findDirObj(
                self.getCacheAPIStoragePath(), self.cacheDBFileName, True
            )
            self.assertFalse(
                self.cacheRequestStr.encode("ascii") in open(dbFile, "rb").read(),
                "Cache request data in main DB is not encrypted",
            )

    def test_encrypted_cache_body_ondisk(self):
        with self.using_new_window(self.testHTML, private=False) as (
            self.origin,
            self.persistenceType,
        ):
            self.marionette.execute_async_script(
                """
                    const [name, requestStr, responseStr, resolve] = arguments;
                    const request = new Request(requestStr);
                    const response = new Response(responseStr);
                    window.wrappedJSObject.addDataIntoCache(name, request, response)
                                        .then(resolve);
                """,
                script_args=(
                    self.cacheName,
                    self.cacheRequestStr,
                    self.cacheResponseStr,
                ),
            )

            self.ensureInvariantHolds(
                lambda _: os.path.exists(self.getCacheAPIStoragePath())
            )

            self.ensureInvariantHolds(
                lambda _: (
                    self.findDirObj(self.getCacheAPIStoragePath(), "morgue", False)
                    is not None
                )
            )

            cacheResponseDir = self.findDirObj(
                self.getCacheAPIStoragePath(), "morgue", False
            )
            self.ensureInvariantHolds(lambda _: any(os.listdir(cacheResponseDir)))

            cacheResponseBodiesPath = [
                d for d in Path(cacheResponseDir).iterdir() if d.is_dir()
            ][0]

            self.ensureInvariantHolds(
                lambda _: (
                    self.findDirObj(cacheResponseBodiesPath, ".final", True) is not None
                )
            )
            cacheResponseBodyPath = self.findDirObj(
                cacheResponseBodiesPath, ".final", True
            )

            with open(cacheResponseBodyPath, "rb") as f:
                foundSnappy = re.search(b"sNaPpY", f.read()) is not None
            self.assertFalse(
                foundSnappy, "Cache response body on disk is not encrypted"
            )

    def getCacheAPIStoragePath(self):
        if self.cacheAPIStoragePath is not None:
            return self.cacheAPIStoragePath

        assert self.origin is not None
        assert self.persistenceType is not None

        self.cacheAPIStoragePath = self.getStoragePath(
            self.profilePath, self.origin, self.persistenceType, "cache"
        )
        return self.cacheAPIStoragePath


class CacheAPIEncryptionLockstoreControl(QuotaTestCase):
    """
    Control test: with encryption disabled, Cache API data is plaintext on disk.
    Validates the encryption tests above are not vacuously passing.
    """

    def setUp(self):
        super().setUp()

        self.testHTML = "dom/cache/basicCacheAPI_PBM.html"
        self.cacheName = "CacheLockstoreControlTest"
        self.profilePath = self.marionette.instance.profile.profile
        self.cacheAPIStoragePath = None

        self.restartWithCleanStorage({
            QM_ENCRYPTION_PREF: False,
            QM_TESTING_PREF: True,
        })

        self.cacheRequestStr = "https://example.com/"
        self.cacheResponseStr = "CacheAPIEncryptionControl"

        self.cacheDBFileName = "caches.sqlite"
        self.cacheDBJournalFileName = "caches.sqlite-wal"

    def tearDown(self):
        super().tearDown()

    def test_unencrypted_cache_sqlite_ondisk(self):
        with self.using_new_window(self.testHTML, private=False) as (
            self.origin,
            self.persistenceType,
        ):
            self.marionette.execute_async_script(
                """
                    const [name, requestStr, responseStr, resolve] = arguments;
                    const request = new Request(requestStr);
                    const response = new Response(responseStr);
                    window.wrappedJSObject.addDataIntoCache(name, request, response)
                                        .then(resolve);
                """,
                script_args=(
                    self.cacheName,
                    self.cacheRequestStr,
                    self.cacheResponseStr,
                ),
            )

            self.ensureInvariantHolds(
                lambda _: os.path.exists(self.getCacheAPIStoragePath())
            )

            self.ensureInvariantHolds(
                lambda _: (
                    self.findDirObj(
                        self.getCacheAPIStoragePath(),
                        self.cacheDBJournalFileName,
                        True,
                    )
                    is not None
                )
            )
            dbJournalFile = self.findDirObj(
                self.getCacheAPIStoragePath(), self.cacheDBJournalFileName, True
            )

            self.assertTrue(
                self.cacheRequestStr.encode("ascii")
                in open(dbJournalFile, "rb").read(),
                "Cache request data in journal should be plaintext when encryption is disabled",
            )

    def getCacheAPIStoragePath(self):
        if self.cacheAPIStoragePath is not None:
            return self.cacheAPIStoragePath

        assert self.origin is not None
        assert self.persistenceType is not None

        self.cacheAPIStoragePath = self.getStoragePath(
            self.profilePath, self.origin, self.persistenceType, "cache"
        )
        return self.cacheAPIStoragePath
