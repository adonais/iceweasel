/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites.middleware

import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.feature.top.sites.TopSite
import mozilla.components.feature.top.sites.TopSitesUseCases
import mozilla.components.service.merino.manifest.ManifestEntry
import mozilla.components.service.merino.manifest.MerinoManifestProvider
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppAction.ShortcutAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.home.topsites.AddShortcutEntryPoint
import org.mozilla.fenix.home.topsites.AddShortcutSource
import org.mozilla.fenix.home.topsites.store.ShortcutsAction
import org.mozilla.fenix.home.topsites.store.ShortcutsState
import org.mozilla.fenix.home.topsites.store.ShortcutsStore
import org.mozilla.fenix.home.topsites.store.toPopularSite
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ShortcutsMiddlewareTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    private lateinit var settings: Settings
    private lateinit var appStore: AppStore
    private val captureMiddleware = CaptureActionsMiddleware<AppState, AppAction>()
    private val topSitesUseCases: TopSitesUseCases = mockk(relaxed = true)
    private val merinoManifestProvider: MerinoManifestProvider = mockk(relaxed = true)

    @Before
    fun setup() {
        settings = Settings(testContext)
        settings.enableAddShortcutsImprovement = false
        appStore = AppStore(middlewares = listOf(captureMiddleware))
    }

    @Test
    fun `WHEN InitAction action is dispatched THEN showAddShortcut, topSites and popularSites values are set with the correct values`() = runTest(testDispatcher) {
        settings.enableAddShortcutsImprovement = true

        val topSites = listOf(
            TopSite.Pinned(id = 1L, title = "Mozilla", url = "https://mozilla.org", createdAt = 0),
        )
        val manifestEntries = listOf(
            ManifestEntry(
                rank = 1,
                domain = "example",
                categories = emptyList(),
                serpCategories = emptyList(),
                url = "https://example.com",
                title = "example",
                icon = "https://example.com",
            ),
        )
        every { merinoManifestProvider.getTopDomains(any(), any()) } returns manifestEntries

        appStore = AppStore(initialState = AppState(topSites = topSites))

        val store = createStore(scope = backgroundScope)

        verify {
            merinoManifestProvider.getTopDomains(
                limit = POPULAR_SITES_LIMIT,
                excludedDomains = setOf("mozilla.org"),
            )
        }

        assertEquals(settings.enableAddShortcutsImprovement, store.state.showAddShortcut)
        assertEquals(topSites, store.state.topSites)
        assertEquals(manifestEntries.map { it.toPopularSite() }, store.state.popularSites)
    }

    @Test
    fun `WHEN appStore is updated with new top sites THEN UpdateTopSites action is dispatched`() = runTest(testDispatcher) {
        val captureMiddleware = CaptureActionsMiddleware<ShortcutsState, ShortcutsAction>()
        createStore(captureMiddleware = captureMiddleware, scope = backgroundScope)

        val topSites = listOf(
            TopSite.Default(id = 7L, title = "Wiki", url = "https://wikipedia.org", createdAt = 0),
        )
        appStore.dispatch(AppAction.TopSitesChange(topSites))

        captureMiddleware.assertLastAction(ShortcutsAction.UpdateTopSites::class) { action ->
            assertEquals(topSites, action.topSites)
        }
    }

    @Test
    fun `WHEN SaveShortcut action is dispatched THEN addPinnedSites use case is called and dialog is closed`() = runTest(testDispatcher) {
        val shortcutsCaptureMiddleware = CaptureActionsMiddleware<ShortcutsState, ShortcutsAction>()
        val store = createStore(captureMiddleware = shortcutsCaptureMiddleware, scope = backgroundScope)

        val title = "Firefox"
        val url = "https://firefox.com"
        store.dispatch(
            ShortcutsAction.SaveShortcut(title = title, url = url, source = AddShortcutSource.POPULAR),
        )

        coVerify { topSitesUseCases.addPinnedSites(title = title, url = url) }
        captureMiddleware.assertLastAction(ShortcutAction.ShortcutAdded::class) { action ->
            assertEquals(AddShortcutSource.POPULAR, action.source)
            assertEquals(AddShortcutEntryPoint.SHORTCUTS_LIBRARY, action.entryPoint)
        }
        shortcutsCaptureMiddleware.assertLastAction(ShortcutsAction.CloseDialog::class)
    }

    @Test
    fun `WHEN ShowAddShortcutBottomSheet action is dispatched THEN show add shortcut sheet shown action is dispatched`() = runTest(testDispatcher) {
        val store = createStore(scope = backgroundScope)

        store.dispatch(ShortcutsAction.ShowAddShortcutBottomSheet)

        captureMiddleware.assertLastAction(ShortcutAction.AddShortcutSheetShown::class) { action ->
            assertEquals(AddShortcutEntryPoint.SHORTCUTS_LIBRARY, action.entryPoint)
        }
    }

    @Test
    fun `WHEN ShowAddShortcutDialog action is dispatched THEN the add website dialog shown action is dispatched`() = runTest(testDispatcher) {
        val store = createStore(scope = backgroundScope)

        store.dispatch(ShortcutsAction.ShowAddShortcutDialog)

        captureMiddleware.assertLastAction(ShortcutAction.AddWebsiteDialogShown::class) { }
    }

    private fun createStore(
        initialState: ShortcutsState = ShortcutsState.INITIAL,
        captureMiddleware: CaptureActionsMiddleware<ShortcutsState, ShortcutsAction> = CaptureActionsMiddleware(),
        scope: CoroutineScope,
        ioDispatcher: CoroutineDispatcher = testDispatcher,
    ): ShortcutsStore {
        val middleware = ShortcutsMiddleware(
            appStore = appStore,
            topSitesUseCases = topSitesUseCases,
            merinoManifestProvider = merinoManifestProvider,
            settings = settings,
            scope = scope,
            ioDispatcher = ioDispatcher,
        )
        return ShortcutsStore(
            initialState = initialState,
            middleware = listOf(captureMiddleware, middleware),
        )
    }
}
