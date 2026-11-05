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


class CacheAPIEncryptionPersistence(QuotaTestCase):
    """
    Verify that encrypted Cache API data persists across a browser restart.
    The lockstore keystore lives in the profile, so the same DEKs should be
    available after restart and cached responses should be readable.
    """

    def setUp(self):
        super().setUp()

        # QuotaManager reads encryption.enabled once at startup, so write it to
        # the profile and restart before touching storage.
        self.marionette.instance.profile.set_preferences({
            QM_ENCRYPTION_PREF: True,
            QM_TESTING_PREF: True,
        })
        self.marionette.restart(in_app=False)

        self.cacheName = "PersistCache"
        self.cacheRequestURL = "https://example.com/persist-test"
        self.cacheResponseBody = "persist_cache_value_lockstore"

    def test_cache_survives_restart(self):
        url = self.marionette.absolute_url("empty.html")

        self.marionette.navigate(url)
        self.marionette.execute_async_script(
            """
            const [cacheName, requestURL, responseBody, resolve] = arguments;
            caches.open(cacheName).then(cache => {
                const request = new Request(requestURL);
                const response = new Response(responseBody);
                return cache.put(request, response);
            }).then(() => resolve("written"))
              .catch(e => resolve("write_error: " + e));
            """,
            script_args=(
                self.cacheName,
                self.cacheRequestURL,
                self.cacheResponseBody,
            ),
        )
        self.assertEqual(
            self.readBack(),
            self.cacheResponseBody,
            "Pre-restart cache read-back failed",
        )

        self.marionette.restart(in_app=True)

        self.marionette.navigate(url)
        self.assertEqual(
            self.readBack(),
            self.cacheResponseBody,
            "Encrypted cache data did not survive browser restart",
        )

        # Origins encrypted earlier must stay readable after the pref is
        # turned off.
        self.marionette.instance.profile.set_preferences({QM_ENCRYPTION_PREF: False})
        self.marionette.restart(in_app=False)

        self.marionette.navigate(url)
        self.assertEqual(
            self.readBack(),
            self.cacheResponseBody,
            "Encrypted cache data unreadable after disabling encryption",
        )

    def readBack(self):
        return self.marionette.execute_async_script(
            """
            const [cacheName, requestURL, resolve] = arguments;
            caches.open(cacheName).then(cache => {
                return cache.match(requestURL);
            }).then(response => {
                if (!response) { resolve(null); return; }
                return response.text();
            }).then(text => resolve(text))
              .catch(e => resolve(null));
            """,
            script_args=(self.cacheName, self.cacheRequestURL),
        )
