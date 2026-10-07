/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxa.sync.helpers

import android.content.Context
import mozilla.components.service.fxa.sync.SharedPrefsSyncStateStorage
import mozilla.components.service.fxa.sync.SharedPrefsSyncStateStorage.Companion.SYNC_STATE_PREFS_KEY
import mozilla.components.service.fxa.sync.SyncStateStorage
import mozilla.components.support.test.robolectric.testContext

/** Test variant of [mozilla.components.service.fxa.sync.SyncStateStorage] */
class TestSyncStateStorage(val context: Context = testContext) :
    SyncStateStorage by SharedPrefsSyncStateStorage(
        sharedPrefs = context.getSharedPreferences(SYNC_STATE_PREFS_KEY, Context.MODE_PRIVATE)
    )
