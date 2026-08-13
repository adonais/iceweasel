/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.experiments.nimbus.internal.FirefoxLabsMetadata
import org.mozilla.fenix.settings.labs.fake.FakeNimbusApi
import org.mozilla.fenix.settings.labs.middleware.LabsMiddleware
import org.mozilla.fenix.settings.labs.store.LabsAction
import org.mozilla.fenix.settings.labs.store.LabsState
import org.mozilla.fenix.settings.labs.store.LabsStore
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class LabsRefreshFeatureTest {

    @Test
    fun `WHEN the feature is started THEN it registers itself as a Nimbus observer`() {
        val nimbusApi = FakeNimbusApi(testContext)
        val feature = LabsRefreshFeature(store = LabsStore(LabsState.INITIAL), nimbusApi = nimbusApi)

        feature.start()

        assertTrue(feature in nimbusApi.registeredObservers)
    }

    @Test
    fun `WHEN the feature is stopped THEN it unregisters itself as a Nimbus observer`() {
        val nimbusApi = FakeNimbusApi(testContext)
        val feature = LabsRefreshFeature(store = LabsStore(LabsState.INITIAL), nimbusApi = nimbusApi)

        feature.stop()

        assertTrue(feature in nimbusApi.unregisteredObservers)
    }

    @Test
    fun `WHEN Nimbus applies updates THEN labs are refreshed AND a dropped lab is deactivated`() = runTest(UnconfinedTestDispatcher()) {
        var labs: List<FirefoxLabsMetadata> = listOf(
            FirefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = "firefox_labs_test_lab_title",
                descriptionStringId = "firefox_labs_test_lab_description",
                feedbackUrl = null,
                enrolled = true,
                requiresRestart = false,
            ),
        )
        val nimbusApi = FakeNimbusApi(testContext, labsProvider = { labs })
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = LabsStore(
            initialState = LabsState.INITIAL,
            middleware = listOf(
                captureMiddleware,
                LabsMiddleware(
                    context = testContext,
                    settings = Settings(testContext),
                    nimbusSdk = nimbusApi,
                    onRestart = {},
                    onOpenFeedback = {},
                    scope = backgroundScope,
                ),
            ),
        )
        val feature = LabsRefreshFeature(store = store, nimbusApi = nimbusApi)

        labs = emptyList()
        captureMiddleware.reset()

        // Simulate Nimbus forcing an unenroll mid-session, then deliver the observation event.
        feature.onUpdatesApplied(emptyList())

        captureMiddleware.assertFirstAction(LabsAction.RefreshLabs::class)
        captureMiddleware.assertLastAction(LabsAction.UpdateLabsItems::class) { action ->
            assertEquals(1, action.items.size)
            val item = action.items.first()
            assertEquals("lab-1", item.slug)
            assertFalse(item.enrolled)
            assertFalse(item.available)
        }
    }
}
