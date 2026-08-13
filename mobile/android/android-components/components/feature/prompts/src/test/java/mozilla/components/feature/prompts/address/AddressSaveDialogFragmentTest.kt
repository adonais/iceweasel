/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.prompts.address

import android.os.Bundle
import androidx.fragment.app.testing.launchFragment
import androidx.lifecycle.Lifecycle
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.concept.storage.Address
import mozilla.components.feature.prompts.dialog.KEY_PROMPT_UID
import mozilla.components.feature.prompts.dialog.KEY_SESSION_ID
import mozilla.components.feature.prompts.dialog.KEY_SHOULD_DISMISS_ON_LOAD
import mozilla.components.feature.prompts.dialog.TestPromptFeature
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertNotNull

@RunWith(AndroidJUnit4::class)
class AddressSaveDialogFragmentTest {

    private val address = Address(
        guid = "1",
        name = "John Doe",
        organization = "Mozilla",
        streetAddress = "999 Test Street",
        addressLevel3 = "",
        addressLevel2 = "Mountain View",
        addressLevel1 = "CA",
        postalCode = "94016",
        country = "US",
        tel = "+15551234567",
        email = "john@example.com",
    )
    private val sessionId = "sessionId"
    private val promptRequestUID = "uid"

    @Test
    fun `WHEN the fragment is created THEN the arguments are made available through its properties`() {
        val fragment = AddressSaveDialogFragment.newInstance(
            sessionId = sessionId,
            promptRequestUID = promptRequestUID,
            shouldDismissOnLoad = false,
            address = address,
        )

        assertEquals(sessionId, fragment.sessionId)
        assertEquals(promptRequestUID, fragment.promptRequestUID)
        assertEquals(false, fragment.shouldDismissOnLoad)
        assertEquals(address, fragment.address)
    }

    @Test
    fun dialogCancellationCancelsTheFeature() {
        val feature = TestPromptFeature()
        val scenario = launchFragment<AddressSaveDialogFragment>(
            initialState = Lifecycle.State.CREATED,
            fragmentArgs = Bundle().apply {
                putString(KEY_SESSION_ID, sessionId)
                putString(KEY_PROMPT_UID, promptRequestUID)
                putBoolean(KEY_SHOULD_DISMISS_ON_LOAD, true)
                putParcelable(KEY_ADDRESS, address)
            },
        )
        scenario.onFragment {
            it.feature = feature
        }
        // move to resumed state
        scenario.moveToState(Lifecycle.State.RESUMED)

        // when fragment is canceled
        scenario.onFragment {
            it.dismiss()
        }

        // then verify that the canceled prompt is the same one for that dialog
        assertNotNull(feature.canceledPrompt)
        assertEquals(promptRequestUID, feature.canceledPrompt?.promptRequestUid)
    }
}
