/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.prompts.address

import android.os.Bundle
import androidx.fragment.app.testing.launchFragment
import androidx.lifecycle.Lifecycle
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.assertNotNull
import mozilla.components.concept.storage.Address
import mozilla.components.feature.prompts.dialog.KEY_PROMPT_UID
import mozilla.components.feature.prompts.dialog.KEY_SESSION_ID
import mozilla.components.feature.prompts.dialog.KEY_SHOULD_DISMISS_ON_LOAD
import mozilla.components.feature.prompts.dialog.TestPromptFeature
import mozilla.components.feature.prompts.facts.AddressAutofillDialogFacts
import mozilla.components.support.base.Component
import mozilla.components.support.base.facts.Action
import mozilla.components.support.base.facts.processor.CollectionProcessor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AddressSaveDialogFragmentTest {

    private val address =
        Address(
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
        val fragment =
            AddressSaveDialogFragment.newInstance(
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
    fun `GIVEN an address with a guid WHEN the fragment is created THEN it prompts to update`() {
        val fragment =
            AddressSaveDialogFragment.newInstance(
                sessionId = sessionId,
                promptRequestUID = promptRequestUID,
                shouldDismissOnLoad = false,
                address = address,
            )

        assertTrue(fragment.isUpdate)
    }

    @Test
    fun `GIVEN an address without a guid WHEN the fragment is created THEN it prompts to save`() {
        val fragment =
            AddressSaveDialogFragment.newInstance(
                sessionId = sessionId,
                promptRequestUID = promptRequestUID,
                shouldDismissOnLoad = false,
                address = address.copy(guid = ""),
            )

        assertFalse(fragment.isUpdate)
    }

    @Test
    fun dialogCancellationCancelsTheFeature() {
        val feature = TestPromptFeature()
        val scenario =
            launchFragment<AddressSaveDialogFragment>(
                initialState = Lifecycle.State.CREATED,
                fragmentArgs =
                    Bundle().apply {
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

    @Test
    fun `GIVEN an address without a guid WHEN the save fact is emitted THEN the created fact is emitted`() {
        val fragment =
            AddressSaveDialogFragment.newInstance(
                sessionId = sessionId,
                promptRequestUID = promptRequestUID,
                shouldDismissOnLoad = false,
                address = address.copy(guid = ""),
            )

        CollectionProcessor.withFactCollection { facts ->
            fragment.emitSaveUpdateFact()

            val fact = facts.single()
            assertEquals(Component.FEATURE_PROMPTS, fact.component)
            assertEquals(Action.CONFIRM, fact.action)
            assertEquals(
                AddressAutofillDialogFacts.Items.AUTOFILL_ADDRESS_CREATED,
                fact.item,
            )
        }
    }

    @Test
    fun `GIVEN an address with a guid WHEN the save fact is emitted THEN the updated fact is emitted`() {
        val fragment =
            AddressSaveDialogFragment.newInstance(
                sessionId = sessionId,
                promptRequestUID = promptRequestUID,
                shouldDismissOnLoad = false,
                address = address,
            )

        CollectionProcessor.withFactCollection { facts ->
            fragment.emitSaveUpdateFact()

            val fact = facts.single()
            assertEquals(Component.FEATURE_PROMPTS, fact.component)
            assertEquals(Action.CONFIRM, fact.action)
            assertEquals(
                AddressAutofillDialogFacts.Items.AUTOFILL_ADDRESS_UPDATED,
                fact.item,
            )
        }
    }
}
