# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys
from pathlib import Path

sys.path.append(os.fspath(Path(__file__).parents[3] / "quota/test/marionette"))

from quota_test_case import QuotaTestCase

QM_ENCRYPTION_PREF = "dom.quotaManager.encryption.enabled"
QM_TESTING_PREF = "dom.quotaManager.testing"


class IDBEncryptionPersistence(QuotaTestCase):
    """
    Verify that encrypted IndexedDB data persists across a browser restart.
    The lockstore keystore lives in the profile, so the same DEKs should be
    available after restart and data should be readable.
    """

    def setUp(self):
        super().setUp()

        self.marionette.instance.profile.set_preferences({
            QM_ENCRYPTION_PREF: True,
            QM_TESTING_PREF: True,
        })
        self.marionette.restart(in_app=False)

        self.testHTML = "dom/indexedDB/basicIDB_PBM.html"
        self.IDBName = "PersistDB"
        self.IDBStoreName = "PersistStore"
        self.testValue = "persist_test_value_lockstore"

    def test_data_survives_restart(self):
        with self.using_new_window(self.testHTML, private=False):
            self.marionette.execute_async_script(
                """
                const [idb, store, key, value, resolve] = arguments;
                window.wrappedJSObject.addDataIntoIDB(idb, store, key, value).then(resolve);
                """,
                script_args=(
                    self.IDBName,
                    self.IDBStoreName,
                    "persistKey",
                    self.testValue,
                ),
            )

        self.marionette.restart(in_app=True)

        readback = self.readBack()
        self.assertEqual(
            readback,
            self.testValue,
            f"Encrypted IDB data did not survive browser restart: {readback}",
        )

        # Origins encrypted earlier must stay readable after the pref is
        # turned off.
        self.marionette.instance.profile.set_preferences({QM_ENCRYPTION_PREF: False})
        self.marionette.restart(in_app=False)

        readback = self.readBack()
        self.assertEqual(
            readback,
            self.testValue,
            f"Encrypted IDB data unreadable after disabling encryption: {readback}",
        )

    def readBack(self):
        with self.using_new_window(self.testHTML, private=False):
            return self.marionette.execute_async_script(
                """
                const resolve = arguments[arguments.length - 1];
                const dbName = arguments[0];
                const storeName = arguments[1];
                const key = arguments[2];
                try {
                    const req = indexedDB.open(dbName);
                    req.onsuccess = (e) => {
                        const db = e.target.result;
                        const tx = db.transaction(storeName, "readonly");
                        const getReq = tx.objectStore(storeName).get(key);
                        getReq.onsuccess = () => {
                            db.close();
                            resolve(getReq.result != null ? getReq.result : "no_result");
                        };
                        getReq.onerror = (ev) => {
                            db.close();
                            resolve("get_error:" + ev.target.error);
                        };
                    };
                    req.onerror = (e) => resolve("open_error:" + e.target.error);
                } catch(ex) { resolve("exception:" + ex); }
                """,
                script_args=(self.IDBName, self.IDBStoreName, "persistKey"),
            )
