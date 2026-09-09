/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs.middleware

import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.FirefoxLabs
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.settings.labs.LabsItem
import org.mozilla.fenix.settings.labs.store.DialogState
import org.mozilla.fenix.settings.labs.store.LabsAction
import org.mozilla.fenix.settings.labs.store.LabsState
import org.mozilla.fenix.settings.labs.store.LabsStore
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LabsTelemetryMiddlewareTest {

    @get:Rule val gleanTestRule = FenixGleanTestRule(testContext)

    private fun buildStore(initialState: LabsState = LabsState.INITIAL): LabsStore =
        LabsStore(
            initialState = initialState,
            middleware = listOf(LabsTelemetryMiddleware()),
        )

    private fun homepageItem(enrolled: Boolean = false) =
        LabsItem(
            slug = "homepage-as-new-tab",
            title = "Homepage as a New Tab",
            description = "With this feature enabled, Homepage will behave as a tab.",
            enrolled = enrolled,
            requiresRestart = true,
        )

    private fun stateWithDialog(item: LabsItem, dialog: DialogState) =
        LabsState(
            labsItems = listOf(item),
            dialogState = dialog,
        )

    @Test
    fun `WHEN UpdateLabsItems is dispatched with an empty list THEN empty_state_shown is recorded`() {
        val store = buildStore()

        store.dispatch(LabsAction.UpdateLabsItems(emptyList()))

        assertEquals(1, FirefoxLabs.emptyStateShown.testGetValue()!!.size)
    }

    @Test
    fun `WHEN UpdateLabsItems is dispatched with a non-empty list THEN empty_state_shown is not recorded`() {
        val store = buildStore()

        store.dispatch(LabsAction.UpdateLabsItems(listOf(homepageItem())))

        assertNull(FirefoxLabs.emptyStateShown.testGetValue())
    }

    @Test
    fun `WHEN the screen is populated THEN initial_labs_fetch is recorded with the slugs and count`() {
        val store = buildStore()

        store.dispatch(
            LabsAction.UpdateLabsItems(
                listOf(
                    homepageItem(),
                    homepageItem().copy(slug = "other-lab"),
                )
            )
        )

        val extra = FirefoxLabs.initialLabsFetch.testGetValue()!!.single().extra
        assertEquals("homepage-as-new-tab,other-lab", extra?.get("slug_ids"))
        assertEquals("2", extra?.get("count"))
    }

    @Test
    fun `WHEN FetchFailed is dispatched THEN fetch_failed is recorded`() {
        val store = buildStore()

        store.dispatch(LabsAction.FetchFailed)

        assertEquals(1, FirefoxLabs.fetchFailed.testGetValue()!!.size)
    }

    @Test
    fun `WHEN ToggleCompleted is dispatched THEN toggle_button_pressed is recorded with the Nimbus status`() {
        val store = buildStore()

        store.dispatch(
            LabsAction.ToggleCompleted(slug = "homepage-as-new-tab", enabled = true, status = "feature_conflict")
        )

        val extra = FirefoxLabs.toggleButtonPressed.testGetValue()!!.single().extra
        assertEquals("homepage-as-new-tab", extra?.get("slug_id"))
        assertEquals("true", extra?.get("enabled"))
        assertEquals("feature_conflict", extra?.get("status"))
    }

    @Test
    fun `WHEN RestoreDefaultsCompleted is dispatched THEN restore_defaults_dialog is recorded with succeeded`() {
        val store = buildStore()

        store.dispatch(LabsAction.RestoreDefaultsCompleted(succeeded = false, itemsChanged = listOf("lab-a", "lab-b")))

        val extra = FirefoxLabs.restoreDefaultsDialog.testGetValue()!!.single().extra
        assertEquals("lab-a,lab-b", extra?.get("slug_ids"))
        assertEquals("2", extra?.get("count"))
        assertEquals("true", extra?.get("did_user_confirm"))
        assertEquals("false", extra?.get("succeeded"))
    }

    @Test
    fun `WHEN ToggleLabsItem is dispatched from the dialog flow THEN toggled_dialog is recorded with did_user_confirm true`() {
        val item = homepageItem()
        val store = buildStore(initialState = stateWithDialog(item, DialogState.ToggleLabsItem(item)))

        store.dispatch(LabsAction.ToggleLabsItem(item))

        val extra = FirefoxLabs.toggledDialog.testGetValue()!!.single().extra
        assertEquals("homepage-as-new-tab", extra?.get("slug_id"))
        assertEquals("true", extra?.get("did_user_confirm"))
    }

    @Test
    fun `WHEN ToggleLabsItem is dispatched outside the dialog flow THEN toggled_dialog is not recorded`() {
        val item = homepageItem()
        val store = buildStore(initialState = stateWithDialog(item, DialogState.Closed))

        store.dispatch(LabsAction.ToggleLabsItem(item))

        assertNull(FirefoxLabs.toggledDialog.testGetValue())
    }

    @Test
    fun `WHEN ShowRestoreDefaultsDialog is dispatched THEN restore_defaults_button_pressed is recorded`() {
        val store = buildStore()

        store.dispatch(LabsAction.ShowRestoreDefaultsDialog)

        assertEquals(1, FirefoxLabs.restoreDefaultsButtonPressed.testGetValue()!!.size)
    }

    @Test
    fun `WHEN CloseDialog is dispatched while the toggle dialog is open THEN toggled_dialog is recorded with did_user_confirm false`() {
        val item = homepageItem()
        val store = buildStore(initialState = stateWithDialog(item, DialogState.ToggleLabsItem(item)))

        store.dispatch(LabsAction.CloseDialog)

        val extra = FirefoxLabs.toggledDialog.testGetValue()!!.single().extra
        assertEquals("homepage-as-new-tab", extra?.get("slug_id"))
        assertEquals("false", extra?.get("did_user_confirm"))
    }

    @Test
    fun `WHEN CloseDialog is dispatched while the restore dialog is open THEN restore_defaults_dialog is recorded with did_user_confirm false`() {
        val store =
            buildStore(
                initialState =
                    LabsState(
                        labsItems = listOf(homepageItem(enrolled = true)),
                        dialogState = DialogState.RestoreDefaults,
                    )
            )

        store.dispatch(LabsAction.CloseDialog)

        val extra = FirefoxLabs.restoreDefaultsDialog.testGetValue()!!.single().extra
        assertEquals("", extra?.get("slug_ids"))
        assertEquals("0", extra?.get("count"))
        assertEquals("false", extra?.get("did_user_confirm"))
        assertEquals("false", extra?.get("succeeded"))
        assertNull(FirefoxLabs.toggledDialog.testGetValue())
        assertNull(FirefoxLabs.toggleButtonPressed.testGetValue())
    }

    @Test
    fun `WHEN ShareFeedbackClicked is dispatched THEN share_feedback_opened is recorded`() {
        val item = homepageItem().copy(feedbackUrl = "https://connect.mozilla.org/")
        val store = buildStore()

        store.dispatch(LabsAction.ShareFeedbackClicked(item))

        val extra = FirefoxLabs.shareFeedbackOpened.testGetValue()!!.single().extra
        assertEquals("homepage-as-new-tab", extra?.get("slug_id"))
    }
}
