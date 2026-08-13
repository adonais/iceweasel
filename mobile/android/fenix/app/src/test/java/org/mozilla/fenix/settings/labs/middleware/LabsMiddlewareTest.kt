/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs.middleware

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.experiments.nimbus.internal.FirefoxLabsEnrollStatus
import org.mozilla.experiments.nimbus.internal.FirefoxLabsMetadata
import org.mozilla.experiments.nimbus.internal.FirefoxLabsUnenrollStatus
import org.mozilla.fenix.settings.labs.LabsItem
import org.mozilla.fenix.settings.labs.fake.FakeNimbusApi
import org.mozilla.fenix.settings.labs.store.DialogState
import org.mozilla.fenix.settings.labs.store.LabsAction
import org.mozilla.fenix.settings.labs.store.LabsState
import org.mozilla.fenix.settings.labs.store.LabsStore
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class LabsMiddlewareTest {

    private lateinit var settings: Settings
    private var labs: List<FirefoxLabsMetadata> = emptyList()
    private var labsThrows = false
    private var enrollThrows = false
    private var unenrollAllThrows = false
    private var onRestartCount = 0
    private val onRestart: () -> Unit = { onRestartCount++ }
    private val openedFeedbackUrls = mutableListOf<String>()
    private val onOpenFeedback: (String) -> Unit = { openedFeedbackUrls.add(it) }
    private val enrolledSlugs = mutableListOf<String>()
    private val unenrolledSlugs = mutableListOf<String>()
    private var unenrollAllCount = 0
    private var enrollStatus = FirefoxLabsEnrollStatus.ENROLLED
    private var unenrollStatus = FirefoxLabsUnenrollStatus.UNENROLLED

    @Before
    fun setup() {
        settings = Settings(testContext)
        labs = emptyList()
        labsThrows = false
        enrollThrows = false
        unenrollAllThrows = false
        onRestartCount = 0
        openedFeedbackUrls.clear()
        enrolledSlugs.clear()
        unenrolledSlugs.clear()
        unenrollAllCount = 0
        enrollStatus = FirefoxLabsEnrollStatus.ENROLLED
        unenrollStatus = FirefoxLabsUnenrollStatus.UNENROLLED
    }

    private fun labsItem(
        slug: String = "test-lab",
        enrolled: Boolean = false,
        requiresRestart: Boolean = false,
        feedbackUrl: String? = null,
    ) = LabsItem(
        slug = slug,
        title = "Title",
        description = "Description",
        enrolled = enrolled,
        requiresRestart = requiresRestart,
        feedbackUrl = feedbackUrl,
    )

    private fun firefoxLabsMetadata(
        slug: String,
        titleStringId: String,
        descriptionStringId: String,
        enrolled: Boolean = false,
        requiresRestart: Boolean = false,
        feedbackUrl: String? = null,
    ) = FirefoxLabsMetadata(
        slug = slug,
        titleStringId = titleStringId,
        descriptionStringId = descriptionStringId,
        feedbackUrl = feedbackUrl,
        enrolled = enrolled,
        requiresRestart = requiresRestart,
    )

    private fun stateWith(
        item: LabsItem,
        dialogState: DialogState = DialogState.Closed,
    ) = LabsState(
        labsItems = listOf(item),
        dialogState = dialogState,
    )

    private companion object {
        // Backed by static_strings.xml entries shared with the Nimbus read-path fixture.
        const val RESOURCE_NAME_TITLE = "firefox_labs_test_lab_title"
        const val RESOURCE_NAME_DESCRIPTION = "firefox_labs_test_lab_description"
        val R_STRING_TITLE = org.mozilla.fenix.R.string.firefox_labs_test_lab_title
        val R_STRING_DESCRIPTION = org.mozilla.fenix.R.string.firefox_labs_test_lab_description
    }

    @Test
    fun `WHEN InitAction is dispatched AND Nimbus returns no labs THEN an empty list is dispatched`() = runTest(UnconfinedTestDispatcher()) {
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)

        captureMiddleware.assertLastAction(LabsAction.UpdateLabsItems::class) { action ->
            assertEquals(emptyList<LabsItem>(), action.items)
        }
    }

    @Test
    fun `WHEN InitAction is dispatched AND Nimbus returns labs THEN they are deserialized and dispatched`() = runTest(UnconfinedTestDispatcher()) {
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
                enrolled = true,
                requiresRestart = false,
                feedbackUrl = "https://connect.mozilla.org/",
            ),
        )
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)

        captureMiddleware.assertLastAction(LabsAction.UpdateLabsItems::class) { action ->
            assertEquals(1, action.items.size)
            val item = action.items.first()
            assertEquals("lab-1", item.slug)
            assertEquals(testContext.getString(R_STRING_TITLE), item.title)
            assertEquals(testContext.getString(R_STRING_DESCRIPTION), item.description)
            assertTrue(item.enrolled)
            assertFalse(item.requiresRestart)
            assertEquals("https://connect.mozilla.org/", item.feedbackUrl)
        }
    }

    @Test
    fun `WHEN InitAction is dispatched AND the Nimbus fetch fails THEN FetchFailed is dispatched and no items are set`() = runTest(UnconfinedTestDispatcher()) {
        labsThrows = true
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)

        captureMiddleware.assertLastAction(LabsAction.FetchFailed::class) {}
        captureMiddleware.assertNotDispatched(LabsAction.UpdateLabsItems::class)
    }

    @Test
    fun `WHEN RestartApplication action is dispatched THEN onRestart is called`() = runTest(UnconfinedTestDispatcher()) {
        val store = createStore(scope = backgroundScope)

        store.dispatch(LabsAction.RestartApplication)

        assertEquals(1, onRestartCount)
    }

    @Test
    fun `WHEN RestoreDefaults is dispatched AND an enrolled item requires restart THEN app restart is requested`() = runTest(UnconfinedTestDispatcher()) {
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
                enrolled = true,
                requiresRestart = true,
            ),
        )
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)

        store.dispatch(LabsAction.RestoreDefaults)

        captureMiddleware.assertLastAction(LabsAction.RestartApplication::class)
    }

    @Test
    fun `WHEN RestoreDefaults is dispatched AND no enrolled item requires restart THEN no restart is requested`() = runTest(UnconfinedTestDispatcher()) {
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(
            initialState = stateWith(labsItem(enrolled = true, requiresRestart = false)),
            captureMiddleware = captureMiddleware,
            scope = backgroundScope,
        )
        captureMiddleware.reset()

        store.dispatch(LabsAction.RestoreDefaults)

        assertEquals(0, onRestartCount)
        captureMiddleware.assertNotDispatched(LabsAction.RestartApplication::class)
    }

    @Test
    fun `WHEN ToggleLabsItem with requiresRestart=true is dispatched THEN app restart is requested`() = runTest(UnconfinedTestDispatcher()) {
        val item = labsItem(requiresRestart = true)
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(
            initialState = stateWith(item),
            captureMiddleware = captureMiddleware,
            scope = backgroundScope,
        )

        store.dispatch(LabsAction.ToggleLabsItem(item))

        captureMiddleware.assertLastAction(LabsAction.RestartApplication::class)
    }

    @Test
    fun `WHEN ToggleLabsItem with requiresRestart=false is dispatched THEN no restart is requested`() = runTest(UnconfinedTestDispatcher()) {
        val item = labsItem(requiresRestart = false)
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(
            initialState = stateWith(item),
            captureMiddleware = captureMiddleware,
            scope = backgroundScope,
        )
        captureMiddleware.reset()

        store.dispatch(LabsAction.ToggleLabsItem(item))

        assertEquals(0, onRestartCount)
        captureMiddleware.assertNotDispatched(LabsAction.RestartApplication::class)
    }

    @Test
    fun `WHEN ToggleLabsItem on an unenrolled item is dispatched THEN the lab is enrolled in Nimbus`() = runTest(UnconfinedTestDispatcher()) {
        val item = labsItem(slug = "lab-1", enrolled = false)
        val store = createStore(initialState = stateWith(item), scope = backgroundScope)

        store.dispatch(LabsAction.ToggleLabsItem(item))

        assertEquals(listOf("lab-1"), enrolledSlugs)
        assertEquals(emptyList<String>(), unenrolledSlugs)
    }

    @Test
    fun `WHEN ToggleLabsItem succeeds THEN ToggleCompleted has the lowercased Nimbus status`() = runTest(UnconfinedTestDispatcher()) {
        enrollStatus = FirefoxLabsEnrollStatus.ENROLLED
        val item = labsItem(slug = "lab-1", enrolled = false)
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(initialState = stateWith(item), captureMiddleware = captureMiddleware, scope = backgroundScope)
        captureMiddleware.reset()

        store.dispatch(LabsAction.ToggleLabsItem(item))

        captureMiddleware.assertFirstAction(LabsAction.ToggleCompleted::class) { action ->
            assertEquals("lab-1", action.slug)
            assertTrue(action.enabled)
            assertEquals("enrolled", action.status)
        }
    }

    @Test
    fun `WHEN ToggleLabsItem enroll throws THEN ToggleCompleted status is exception`() = runTest(UnconfinedTestDispatcher()) {
        enrollThrows = true
        val item = labsItem(slug = "lab-1", enrolled = false)
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(initialState = stateWith(item), captureMiddleware = captureMiddleware, scope = backgroundScope)
        captureMiddleware.reset()

        store.dispatch(LabsAction.ToggleLabsItem(item))

        captureMiddleware.assertFirstAction(LabsAction.ToggleCompleted::class) { action ->
            assertEquals("exception", action.status)
        }
    }

    @Test
    fun `WHEN ToggleLabsItem on an enrolled item is dispatched THEN the lab is unenrolled in Nimbus`() = runTest(UnconfinedTestDispatcher()) {
        val item = labsItem(slug = "lab-1", enrolled = true)
        val store = createStore(initialState = stateWith(item), scope = backgroundScope)

        store.dispatch(LabsAction.ToggleLabsItem(item))

        assertEquals(listOf("lab-1"), unenrolledSlugs)
        assertEquals(emptyList<String>(), enrolledSlugs)
    }

    @Test
    fun `WHEN RestoreDefaults is dispatched THEN all labs are unenrolled in Nimbus`() = runTest(UnconfinedTestDispatcher()) {
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
                enrolled = true,
            ),
        )
        val store = createStore(scope = backgroundScope)

        store.dispatch(LabsAction.RestoreDefaults)

        assertEquals(1, unenrollAllCount)
        assertEquals(emptyList<String>(), unenrolledSlugs)
    }

    @Test
    fun `WHEN RestoreDefaults succeeds THEN RestoreDefaultsCompleted has succeeded true and the pre-flip slugs`() = runTest(UnconfinedTestDispatcher()) {
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
                enrolled = true,
            ),
        )
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)
        captureMiddleware.reset()

        store.dispatch(LabsAction.RestoreDefaults)

        captureMiddleware.assertFirstAction(LabsAction.RestoreDefaultsCompleted::class) { action ->
            assertTrue(action.succeeded)
            assertEquals(listOf("lab-1"), action.itemsChanged)
        }
    }

    @Test
    fun `WHEN RestoreDefaults fails THEN RestoreDefaultsCompleted has succeeded false and no items changed`() = runTest(UnconfinedTestDispatcher()) {
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
                enrolled = true,
            ),
        )
        unenrollAllThrows = true
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)
        captureMiddleware.reset()

        store.dispatch(LabsAction.RestoreDefaults)

        captureMiddleware.assertFirstAction(LabsAction.RestoreDefaultsCompleted::class) { action ->
            assertFalse(action.succeeded)
            assertEquals(emptyList<String>(), action.itemsChanged)
        }
    }

    @Test
    fun `WHEN ToggleLabsItem enroll reports the Lab is no longer available THEN the item is removed`() = runTest(UnconfinedTestDispatcher()) {
        enrollStatus = FirefoxLabsEnrollStatus.NO_EXPERIMENT
        val item = labsItem(slug = "lab-1", enrolled = false)
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(
            initialState = stateWith(item),
            captureMiddleware = captureMiddleware,
            scope = backgroundScope,
        )

        store.dispatch(LabsAction.ToggleLabsItem(item))

        captureMiddleware.assertLastAction(LabsAction.RemoveLabsItem::class) { action ->
            assertEquals("lab-1", action.slug)
        }
    }

    @Test
    fun `WHEN ToggleLabsItem enroll fails with an error THEN the list is re-synced from Nimbus`() = runTest(UnconfinedTestDispatcher()) {
        enrollStatus = FirefoxLabsEnrollStatus.ERROR
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
                enrolled = false,
            ),
        )
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)
        captureMiddleware.reset()

        store.dispatch(LabsAction.ToggleLabsItem(labsItem(slug = "lab-1", enrolled = false)))

        captureMiddleware.assertLastAction(LabsAction.UpdateLabsItems::class) { action ->
            assertEquals(1, action.items.size)
            assertFalse(action.items.first().enrolled)
        }
    }

    @Test
    fun `WHEN ToggleLabsItem enroll succeeds AND a sibling Lab is no longer available THEN the sibling is kept but deactivated`() = runTest(UnconfinedTestDispatcher()) {
        // Both Labs are available when the screen loads.
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
            ),
            firefoxLabsMetadata(
                slug = "lab-2",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
            ),
        )
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)

        // After enrolling lab-1, Nimbus only offers lab-1 (now enrolled). In this scenario, lab-2 shares its feature
        // and so drops out of the available list.
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
                enrolled = true,
            ),
        )
        captureMiddleware.reset()

        store.dispatch(LabsAction.ToggleLabsItem(labsItem(slug = "lab-1", enrolled = false)))

        captureMiddleware.assertLastAction(LabsAction.UpdateLabsItems::class) { action ->
            assertEquals(2, action.items.size)
            val refreshed = action.items.first { it.slug == "lab-1" }
            assertTrue(refreshed.enrolled)
            assertTrue(refreshed.available)
            val sibling = action.items.first { it.slug == "lab-2" }
            assertFalse(sibling.enrolled)
            assertFalse(sibling.available)
        }
    }

    @Test
    fun `WHEN ToggleLabsItem unenroll succeeds AND a deactivated Lab is available again THEN it is reactivated`() = runTest(UnconfinedTestDispatcher()) {
        // Both Labs are available when the screen loads.
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
            ),
            firefoxLabsMetadata(
                slug = "lab-2",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
            ),
        )
        val captureMiddleware = CaptureActionsMiddleware<LabsState, LabsAction>()
        val store = createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)

        // Enrolling lab-1 deactivates lab-2 as a conflict.
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
                enrolled = true,
            ),
        )
        store.dispatch(LabsAction.ToggleLabsItem(labsItem(slug = "lab-1", enrolled = false)))
        assertFalse(store.state.labsItems.any { it.slug == "lab-2" && it.available })

        // Unenrolling lab-1 frees the shared feature, so both Labs are available again.
        labs = listOf(
            firefoxLabsMetadata(
                slug = "lab-1",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
            ),
            firefoxLabsMetadata(
                slug = "lab-2",
                titleStringId = RESOURCE_NAME_TITLE,
                descriptionStringId = RESOURCE_NAME_DESCRIPTION,
            ),
        )
        captureMiddleware.reset()

        store.dispatch(LabsAction.ToggleLabsItem(labsItem(slug = "lab-1", enrolled = true)))

        captureMiddleware.assertLastAction(LabsAction.UpdateLabsItems::class) { action ->
            assertEquals(2, action.items.size)
            assertTrue(action.items.all { it.available })
        }
    }

    @Test
    fun `WHEN ShareFeedbackClicked is dispatched THEN onOpenFeedback is called with the item feedback URL`() = runTest(UnconfinedTestDispatcher()) {
        val item = labsItem(feedbackUrl = "https://connect.mozilla.org/")
        val store = createStore(scope = backgroundScope)

        store.dispatch(LabsAction.ShareFeedbackClicked(item))

        assertEquals(listOf("https://connect.mozilla.org/"), openedFeedbackUrls)
    }

    private fun createStore(
        initialState: LabsState = LabsState.INITIAL,
        captureMiddleware: CaptureActionsMiddleware<LabsState, LabsAction> = CaptureActionsMiddleware(),
        scope: CoroutineScope,
    ): LabsStore {
        val middleware = LabsMiddleware(
            context = testContext,
            settings = settings,
            nimbusSdk = FakeNimbusApi(
                context = testContext,
                labsProvider = { if (labsThrows) throw RuntimeException("Nimbus fetch failed") else labs },
                enrolledSlugs = enrolledSlugs,
                unenrolledSlugs = unenrolledSlugs,
                enrollStatusProvider = { if (enrollThrows) throw RuntimeException("enroll failed") else enrollStatus },
                unenrollStatusProvider = { unenrollStatus },
                onUnenrollAll = {
                    unenrollAllCount++
                    if (unenrollAllThrows) throw RuntimeException("unenroll all failed")
                },
            ),
            onRestart = onRestart,
            onOpenFeedback = onOpenFeedback,
            scope = scope,
        )
        return LabsStore(
            initialState = initialState,
            middleware = listOf(captureMiddleware, middleware),
        )
    }
}
