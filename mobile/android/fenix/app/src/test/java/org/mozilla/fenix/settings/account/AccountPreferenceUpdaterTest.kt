/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.account

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import io.mockk.mockk
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import mozilla.components.concept.fetch.Client
import mozilla.components.concept.sync.Profile
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AccountPreferenceUpdaterTest {
    @Test
    fun `sets profile details and generic avatar when the profile has no avatar`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val preference = AccountPreference(context)
        val updater =
            AccountPreferenceUpdater(
                preference = preference,
                scope = CoroutineScope(Dispatchers.Unconfined),
                httpClient = mockk<Client>(),
            )

        updater.update(
            context,
            Profile(
                uid = "uid",
                email = "firefox@example.com",
                avatar = null,
                displayName = "Firefox User",
            ),
        )

        assertEquals("Firefox User", preference.displayName)
        assertEquals("firefox@example.com", preference.email)
        assertNotNull(preference.icon)
    }
}
