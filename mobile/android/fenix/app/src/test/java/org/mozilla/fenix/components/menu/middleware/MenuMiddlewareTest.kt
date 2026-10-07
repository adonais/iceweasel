/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu.middleware

import android.content.Intent
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.navigation.NavController
import androidx.navigation.NavDirections
import androidx.navigation.NavOptions
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import io.mockk.Runs
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.state.EngineState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.menu.data.ExpandableMenuItem
import mozilla.components.compose.menu.data.MenuItem
import mozilla.components.compose.menu.data.MenuItemsGroup
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.store.MenuState
import mozilla.components.compose.menu.store.MenuStore
import mozilla.components.compose.menu.ui.MenuItemIconRes
import mozilla.components.concept.engine.EngineSession
import mozilla.components.concept.engine.ipprotection.ServiceState
import mozilla.components.feature.app.links.AppLinkRedirect
import mozilla.components.feature.app.links.AppLinksUseCases
import mozilla.components.feature.ipprotection.store.IPProtectionAction
import mozilla.components.feature.ipprotection.store.IPProtectionStore
import mozilla.components.feature.ipprotection.store.state.Authorized
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import mozilla.components.feature.ipprotection.store.state.ProxyStatus
import mozilla.components.feature.pwa.WebAppUseCases
import mozilla.components.feature.session.SessionUseCases
import mozilla.components.feature.tabs.TabsUseCases
import mozilla.components.feature.top.sites.PinnedSiteStorage
import mozilla.components.feature.top.sites.TopSite
import mozilla.components.feature.top.sites.TopSitesUseCases
import mozilla.components.support.test.robolectric.testContext
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Vpn
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R
import org.mozilla.fenix.collections.SaveCollectionStep
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.UseCases
import org.mozilla.fenix.components.accounts.FenixFxAEntryPoint
import org.mozilla.fenix.components.appstate.AppAction.BookmarkAction
import org.mozilla.fenix.components.appstate.AppAction.FindInPageAction
import org.mozilla.fenix.components.appstate.AppAction.ReaderViewAction
import org.mozilla.fenix.components.appstate.AppAction.ShortcutAction
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.components.bookmarks.BookmarksUseCase
import org.mozilla.fenix.components.menu.BrowserMenuBuilder
import org.mozilla.fenix.components.menu.FenixMenuItem.CustomizeReaderView
import org.mozilla.fenix.components.menu.MenuFragmentDirections
import org.mozilla.fenix.components.menu.MenuItemProvider
import org.mozilla.fenix.components.menu.MenuPresentationMode.Row
import org.mozilla.fenix.components.menu.MenuSectionConfiguration
import org.mozilla.fenix.components.menu.store.MenuAction
import org.mozilla.fenix.components.menu.store.MenuAction.AddBookmark
import org.mozilla.fenix.components.menu.store.MenuAction.CustomizeReaderView as CustomizeReaderViewEvent
import org.mozilla.fenix.components.menu.store.MenuAction.FindInPage
import org.mozilla.fenix.components.menu.store.MenuAction.IPProtectionToggle
import org.mozilla.fenix.components.menu.store.MenuAction.MoveToNonPrivateTab
import org.mozilla.fenix.components.menu.store.MenuAction.Navigate
import org.mozilla.fenix.components.menu.store.MenuAction.OnSummarizationMenuExposed
import org.mozilla.fenix.components.menu.store.MenuAction.RequestDesktopSite
import org.mozilla.fenix.components.menu.store.MenuAction.RequestMobileSite
import org.mozilla.fenix.components.metrics.MetricsUtils
import org.mozilla.fenix.components.share.ShareSource
import org.mozilla.fenix.components.usecases.FenixBrowserUseCases
import org.mozilla.fenix.components.usecases.ShareUseCases
import org.mozilla.fenix.ext.optionsEq
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.home.topsites.AddShortcutEntryPoint
import org.mozilla.fenix.home.topsites.AddShortcutSource
import org.mozilla.fenix.summarization.eligibility.SummarizationEligibilityChecker
import org.mozilla.fenix.summarization.onboarding.SummarizationFeatureDiscoveryConfiguration
import org.mozilla.fenix.summarization.onboarding.SummarizeDiscoveryEvent
import org.mozilla.fenix.utils.Settings
import org.mozilla.fenix.webcompat.WEB_COMPAT_REPORTER_URL
import org.mozilla.fenix.webcompat.WebCompatReporterMoreInfoSender

@OptIn(ExperimentalAndroidComponentsApi::class)
@RunWith(AndroidJUnit4::class)
class MenuMiddlewareTest {
    @get:Rule val gleanRule = FenixGleanTestRule(testContext)

    private val appStore: AppStore = mockk {
        every { dispatch(any()) } just Runs
        // Opening a page from the menu is told whether to do so in a private tab, which is read from here.
        every { state } returns AppState()
    }
    private val browserStore =
        BrowserStore(
            BrowserState(
                tabs = listOf(createTab(url = TEST_URL, title = TEST_TITLE, id = TAB_ID)),
                selectedTabId = TAB_ID,
            )
        )
    private val addBookmarkUseCase: BookmarksUseCase.AddBookmarksUseCase = mockk()
    private val requestDesktopSiteUseCase: SessionUseCases.RequestDesktopSiteUseCase = mockk(relaxed = true)
    private val printContentUseCase: SessionUseCases.PrintContentUseCase = mockk(relaxed = true)
    private val saveToPdfUSeCase: SessionUseCases.SaveToPdfUseCase = mockk(relaxed = true)
    private val migratePrivateTabUseCase: TabsUseCases.MigratePrivateTabUseCase = mockk(relaxed = true)
    private val addPinnedSiteUseCase: TopSitesUseCases.AddPinnedSiteUseCase = mockk(relaxed = true)
    private val addToHomescreenUseCase: WebAppUseCases.AddToHomescreenUseCase = mockk(relaxed = true)
    private val appLinkRedirectUseCase: AppLinksUseCases.GetAppLinkRedirect = mockk {
        every { this@mockk.invoke(any()) } returns
            AppLinkRedirect(
                appIntent = mockk<Intent>(),
                appName = "Mozilla app",
                fallbackUrl = null,
                marketplaceIntent = null,
            )
    }
    private val openAppLinkUseCase: AppLinksUseCases.OpenAppLinkRedirect = mockk(relaxed = true)
    private val appLinksUseCases: AppLinksUseCases = mockk {
        every { appLinkRedirect } returns appLinkRedirectUseCase
        every { openAppLink } returns openAppLinkUseCase
    }
    private val webAppUseCases: WebAppUseCases = mockk {
        every { isInstallable() } returns false
        every { addToHomescreen } returns addToHomescreenUseCase
    }
    private val removeTopSitesUseCase: TopSitesUseCases.RemoveTopSiteUseCase = mockk(relaxed = true)
    private val fenixBrowserUseCase: FenixBrowserUseCases = mockk(relaxed = true)
    private val goBackUseCase: SessionUseCases.GoBackUseCase = mockk(relaxed = true)
    private val goForwardUseCase: SessionUseCases.GoForwardUseCase = mockk(relaxed = true)
    private val shareUrlUseCase: ShareUseCases = mockk(relaxed = true)
    private val reloadUseCase: SessionUseCases.ReloadUrlUseCase = mockk(relaxed = true)
    private val stopLoadingUseCase: SessionUseCases.StopLoadingUseCase = mockk(relaxed = true)
    private val useCases: UseCases = mockk {
        every { bookmarksUseCases } returns mockk { every { addBookmark } returns addBookmarkUseCase }
        every { sessionUseCases } returns
            mockk {
                every { requestDesktopSite } returns requestDesktopSiteUseCase
                every { saveToPdf } returns saveToPdfUSeCase
                every { printContent } returns printContentUseCase
                every { goBack } returns goBackUseCase
                every { goForward } returns goForwardUseCase
                every { reload } returns reloadUseCase
                every { stopLoading } returns stopLoadingUseCase
            }
        every { tabsUseCases } returns
            mockk { every { migratePrivateTabUseCase } returns this@MenuMiddlewareTest.migratePrivateTabUseCase }
        every { topSitesUseCase } returns
            mockk {
                every { addPinnedSites } returns addPinnedSiteUseCase
                every { removeTopSites } returns removeTopSitesUseCase
            }
        every { fenixBrowserUseCases } returns fenixBrowserUseCase
        every { shareUseCases } returns shareUrlUseCase
        every { webAppUseCases } returns this@MenuMiddlewareTest.webAppUseCases
        every { appLinksUseCases } returns this@MenuMiddlewareTest.appLinksUseCases
    }
    // Navigating away is guarded on still being on the menu, so the mock has to report that as the current
    // destination. A relaxed mock would otherwise report an id of 0 and every navigation would be skipped.
    private val navController: NavController =
        mockk(relaxed = true) {
            every { currentDestination } returns mockk { every { id } returns R.id.menuFragment }
        }
    private val summarizationSettings = mockk<SummarizationFeatureDiscoveryConfiguration>(relaxed = true)
    private val summarizationEligibilityChecker: SummarizationEligibilityChecker = mockk {
        coEvery { checkLanguage(any()) } returns Result.success(true)
    }
    private val settings: Settings = mockk(relaxed = true) { every { topSitesMaxLimit } returns TOP_SITES_MAX_LIMIT }
    private val webCompatReporterMoreInfoSender: WebCompatReporterMoreInfoSender = mockk(relaxed = true)
    private val pinnedSiteStorage: PinnedSiteStorage = mockk(relaxed = true)
    private val materialAlertDialogBuilder: MaterialAlertDialogBuilder = mockk(relaxed = true)
    private val testDispatcher = StandardTestDispatcher()

    @Test
    fun `WHEN the menu is opened THEN show the configured menu items`() =
        runTest(testDispatcher) {
            val store = createStore()

            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(
                listOf(MenuItemsGroup.Row(id = MENU_GROUP_ID, items = listOf(readerViewItem))),
                store.state.menuGroups,
            )
        }

    @Test
    fun `WHEN one of the menu items changes THEN update the menu`() =
        runTest(testDispatcher) {
            val provided = MutableStateFlow<MenuItem?>(readerViewItem)
            val store = createStore(provided)
            testDispatcher.scheduler.advanceUntilIdle()

            provided.value = null
            testDispatcher.scheduler.advanceUntilIdle()

            assertEquals(emptyList(), store.state.menuGroups)
        }

    @Test
    fun `WHEN handling starting to customize the reader view THEN dismiss the menu and show the reader view controls`() {
        val store = createStore()

        store.dispatch(CustomizeReaderViewEvent)

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            appStore.dispatch(ReaderViewAction.ReaderViewControlsShown)
        }
    }

    @Test
    fun `GIVEN IP protection is off WHEN handling it being toggled THEN toggle the functionality and keep the menu open`() {
        val ipProtectionStore = ipProtectionStore(Authorized.Idle)
        val store = createStore(ipProtectionStore = ipProtectionStore)

        store.dispatch(IPProtectionToggle)

        verify { ipProtectionStore.dispatch(IPProtectionAction.Toggle) }
        verify(exactly = 0) { navController.popBackStack(any<Int>(), any()) }
        assertNotNull(Vpn.menuTurnedOn.testGetValue())
    }

    @Test
    fun `GIVEN IP protection is on WHEN handling it being toggled THEN toggle the functionality and keep the menu open`() {
        val ipProtectionStore = ipProtectionStore(Authorized.Active)
        val store = createStore(ipProtectionStore = ipProtectionStore)

        store.dispatch(IPProtectionToggle)

        verify { ipProtectionStore.dispatch(IPProtectionAction.Toggle) }
        verify(exactly = 0) { navController.popBackStack(any<Int>(), any()) }
        assertNotNull(Vpn.menuTurnedOff.testGetValue())
    }

    @Test
    fun `GIVEN authentication is needed WHEN handling it being toggled THEN open VPN settings`() {
        val ipProtectionStore = IPProtectionStore(IPProtectionState(serviceStatus = ServiceState.Unauthenticated))
        val store = createStore(ipProtectionStore = ipProtectionStore)

        store.dispatch(IPProtectionToggle)

        verify {
            navController.navigate(
                NavGraphDirections.actionGlobalIpProtectionFragment(
                    entrypoint = FenixFxAEntryPoint.IPProtectionMainMenu
                ),
                null,
            )
        }
        assertNotNull(Vpn.menuTryItTapped.testGetValue())
    }

    @Test
    fun `WHEN handling a navigation to the IP protection settings THEN open the VPN settings`() {
        val store = createStore()

        store.dispatch(Navigate.IPProtectionSettings)

        verify {
            navController.navigate(
                NavGraphDirections.actionGlobalIpProtectionFragment(
                    entrypoint = FenixFxAEntryPoint.IPProtectionMainMenu
                ),
                null,
            )
        }
        assertEquals("Menu", Vpn.settingsPageTapped.testGetValue()?.last()?.extra?.get("entrypoint"))
    }

    @Test
    fun `WHEN handling adding a bookmark THEN bookmark the current page and dismiss the menu`() =
        runTest(testDispatcher) {
            coEvery { addBookmarkUseCase(url = TEST_URL, title = TEST_TITLE) } returns
                BookmarksUseCase.AddBookmarksUseCase.Result(guidToEdit = BOOKMARK_GUID, parentNode = null)
            val store = createStore()

            store.dispatch(AddBookmark)
            testDispatcher.scheduler.advanceUntilIdle()

            verify {
                appStore.dispatch(
                    BookmarkAction.BookmarkAdded(
                        guidToEdit = BOOKMARK_GUID,
                        parentNode = null,
                        source = MetricsUtils.BookmarkAction.Source.MENU_DIALOG,
                    )
                )
                navController.popBackStack(R.id.menuFragment, true)
            }
        }

    @Test
    fun `GIVEN the current page is bookmarked WHEN handling EditBookmark THEN open the bookmarks editor`() {
        val store = createStore()

        store.dispatch(Navigate.EditBookmark(guidToEdit = BOOKMARK_GUID))

        verify {
            navController.navigate(
                NavGraphDirections.actionGlobalBookmarkEditFragment(
                    guidToEdit = BOOKMARK_GUID,
                    requiresSnackbarPaddingForToolbar = true,
                ),
                null,
            )
        }
    }

    @Test
    fun `GIVEN the current page is not bookmarked WHEN handling EditBookmark THEN don't open the editor`() {
        val store = createStore()

        store.dispatch(Navigate.EditBookmark(guidToEdit = null))

        verify(exactly = 0) { navController.navigate(any<NavDirections>(), any<NavOptions>()) }
    }

    @Test
    fun `WHEN handling the find in page feature being started THEN dismiss the menu and start searching in the current page`() {
        val store = createStore()

        store.dispatch(FindInPage)

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            appStore.dispatch(FindInPageAction.FindInPageStarted)
        }
    }

    @Test
    fun `GIVEN in mobile mode WHEN handling desktop site being requested THEN dismiss the menu and load the desktop version of the current page`() {
        val store = createStore()

        store.dispatch(RequestDesktopSite)

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            requestDesktopSiteUseCase(enable = true, tabId = TAB_ID)
        }
    }

    @Test
    fun `GIVEN in desktop mode WHEN handling mobile mode being requested THEN dismiss the menu and load the mobile version of the current page`() {
        val store = createStore()

        store.dispatch(RequestMobileSite)

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            requestDesktopSiteUseCase(enable = false, tabId = TAB_ID)
        }
    }

    @Test
    fun `WHEN handling moving the current tab to normal tabs THEN dismiss the menu and migrate the tab`() {
        val privateTab = createTab(url = TEST_URL, id = TAB_ID, private = true)
        val store =
            createStore(browserStore = BrowserStore(BrowserState(tabs = listOf(privateTab), selectedTabId = TAB_ID)))

        store.dispatch(MoveToNonPrivateTab)

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            migratePrivateTabUseCase(TAB_ID)
        }
    }

    @Test
    fun `WHEN handling a request to translate the page THEN open the translations dialog for the current tab`() {
        val navOptions = slot<NavOptions>()
        val store = createStore()

        store.dispatch(Navigate.Translate)

        verify {
            navController.navigate(
                MenuFragmentDirections.actionMenuFragmentToTranslationsDialogFragment(sessionId = TAB_ID),
                capture(navOptions),
            )
        }
        assertEquals(R.id.browserFragment, navOptions.captured.popUpToId)
    }

    @Test
    fun `WHEN handling a request to summarize the page THEN open the summarizer for the current tab`() {
        val navOptions = slot<NavOptions>()
        val store = createStore()

        store.dispatch(Navigate.Summarizer)

        verify {
            navController.navigate(
                MenuFragmentDirections.actionMenuFragmentToSummarizationFragment(sessionId = TAB_ID),
                capture(navOptions),
            )
        }
        assertEquals(R.id.browserFragment, navOptions.captured.popUpToId)
    }

    @Test
    fun `GIVEN the current page can be summarized WHEN the item is shown THEN record it being discovered`() =
        runTest(testDispatcher) {
            every { summarizationSettings.showMenuItem } returns true
            val store = createStore(browserStore = browserStoreWithEngineSession())

            store.dispatch(OnSummarizationMenuExposed)
            testDispatcher.scheduler.advanceUntilIdle()

            verify { summarizationSettings.cacheDiscoveryEvent(SummarizeDiscoveryEvent.MenuItemExposure) }
        }

    @Test
    fun `GIVEN summarizing is not offered WHEN the item is shown THEN don't record it being discovered`() =
        runTest(testDispatcher) {
            every { summarizationSettings.showMenuItem } returns false
            val store = createStore(browserStore = browserStoreWithEngineSession())

            store.dispatch(OnSummarizationMenuExposed)
            testDispatcher.scheduler.advanceUntilIdle()

            verify(exactly = 0) { summarizationSettings.cacheDiscoveryEvent(any()) }
        }

    @Test
    fun `GIVEN a private page WHEN the item is shown THEN don't record it being discovered`() =
        runTest(testDispatcher) {
            every { summarizationSettings.showMenuItem } returns true
            val store = createStore(browserStore = browserStoreWithEngineSession(isPrivate = true))

            store.dispatch(OnSummarizationMenuExposed)
            testDispatcher.scheduler.advanceUntilIdle()

            verify(exactly = 0) { summarizationSettings.cacheDiscoveryEvent(any()) }
        }

    @Test
    fun `GIVEN the current page cannot be summarized WHEN the item is shown THEN don't record it being discovered`() =
        runTest(testDispatcher) {
            every { summarizationSettings.showMenuItem } returns true
            coEvery { summarizationEligibilityChecker.checkLanguage(any()) } returns Result.success(false)
            val store = createStore(browserStore = browserStoreWithEngineSession())

            store.dispatch(OnSummarizationMenuExposed)
            testDispatcher.scheduler.advanceUntilIdle()

            verify(exactly = 0) { summarizationSettings.cacheDiscoveryEvent(any()) }
        }

    @Test
    fun `GIVEN there is no page shown WHEN the item is shown THEN don't record it being discovered`() =
        runTest(testDispatcher) {
            every { summarizationSettings.showMenuItem } returns true
            val store = createStore(browserStore = BrowserStore())

            store.dispatch(OnSummarizationMenuExposed)
            testDispatcher.scheduler.advanceUntilIdle()

            verify(exactly = 0) { summarizationSettings.cacheDiscoveryEvent(any()) }
        }

    @Test
    fun `GIVEN summarization asks for attention WHEN More containing it is clicked THEN count it as noticed`() =
        runTest(testDispatcher) {
            every { summarizationSettings.shouldHighlightOverflowMenuItem } returns true
            val item = moreItemForDiscovery(containsSummarize = true)
            val store = createStore(provided = MutableStateFlow(item))
            testDispatcher.scheduler.advanceUntilIdle()

            store.dispatch(MenuAction.OnMoreMenuClicked)
            testDispatcher.scheduler.advanceUntilIdle()

            verify(exactly = 1) {
                summarizationSettings.cacheDiscoveryEvent(SummarizeDiscoveryEvent.MenuOverflowInteraction)
            }
        }

    @Test
    fun `GIVEN More doesn't contain summarize WHEN being clicked THEN don't record an interaction specific to summarization`() =
        runTest(testDispatcher) {
            every { summarizationSettings.shouldHighlightOverflowMenuItem } returns true
            val item = moreItemForDiscovery(containsSummarize = false).copy(icon = MenuItemIconRes(0, true))
            val store = createStore(provided = MutableStateFlow(item))
            testDispatcher.scheduler.advanceUntilIdle()

            store.dispatch(MenuAction.OnMoreMenuClicked)
            testDispatcher.scheduler.advanceUntilIdle()

            verify(exactly = 0) {
                summarizationSettings.cacheDiscoveryEvent(SummarizeDiscoveryEvent.MenuOverflowInteraction)
            }
        }

    @Test
    fun `GIVEN More contains summarize but is highlighted WHEN being clicked THEN don't record an interaction specific to summarization`() =
        runTest(testDispatcher) {
            every { summarizationSettings.shouldHighlightOverflowMenuItem } returns false
            val store = createStore(provided = MutableStateFlow(moreItemForDiscovery(containsSummarize = true)))
            testDispatcher.scheduler.advanceUntilIdle()

            store.dispatch(MenuAction.OnMoreMenuClicked)
            testDispatcher.scheduler.advanceUntilIdle()

            verify(exactly = 0) {
                summarizationSettings.cacheDiscoveryEvent(SummarizeDiscoveryEvent.MenuOverflowInteraction)
            }
        }

    @Test
    fun `GIVEN a private tab and More contains summarize and it is highlighted WHEN being clicked THEN don't record an interaction specific to summarization`() =
        runTest(testDispatcher) {
            every { summarizationSettings.shouldHighlightOverflowMenuItem } returns true
            val tab = createTab(url = TEST_URL, private = true)
            val store =
                createStore(
                    provided = MutableStateFlow(moreItemForDiscovery(containsSummarize = true)),
                    browserStore = BrowserStore(BrowserState(tabs = listOf(tab), selectedTabId = tab.id)),
                )
            testDispatcher.scheduler.advanceUntilIdle()

            store.dispatch(MenuAction.OnMoreMenuClicked)
            testDispatcher.scheduler.advanceUntilIdle()

            verify(exactly = 0) {
                summarizationSettings.cacheDiscoveryEvent(SummarizeDiscoveryEvent.MenuOverflowInteraction)
            }
        }

    @Test
    fun `GIVEN telemetry is enabled WHEN reporting a broken site THEN open the reporter for the current page`() {
        every { settings.isTelemetryEnabled } returns true
        val store = createStore()

        store.dispatch(Navigate.WebCompatReporter)

        verify {
            navController.navigate(
                MenuFragmentDirections.actionMenuFragmentToWebCompatReporterFragment(tabUrl = TEST_URL),
                null,
            )
        }
    }

    @Test
    fun `GIVEN telemetry is disabled WHEN reporting a broken site THEN send the details and open webcompat`() =
        runTest(testDispatcher) {
            every { settings.isTelemetryEnabled } returns false
            val store = createStore()

            store.dispatch(Navigate.WebCompatReporter)
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify {
                webCompatReporterMoreInfoSender.sendMoreWebCompatInfo(
                    reason = null,
                    problemDescription = null,
                    enteredUrl = null,
                    tabUrl = TEST_URL,
                    engineSession = null,
                )
            }
            verify {
                navController.popBackStack(R.id.menuFragment, true)
                fenixBrowserUseCase.loadUrlOrSearch(
                    searchTermOrURL = "$WEB_COMPAT_REPORTER_URL$TEST_URL",
                    newTab = true,
                    private = false,
                )
            }
        }

    @Test
    fun `WHEN adding the current page to shortcuts THEN pin it, inform about it and dismiss the menu`() =
        runTest(testDispatcher) {
            coEvery { pinnedSiteStorage.getPinnedSites() } returns emptyList()
            val store = createStore()

            store.dispatch(MenuAction.AddShortcut)
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify { addPinnedSiteUseCase(title = TEST_TITLE, url = TEST_URL) }
            verify {
                appStore.dispatch(
                    ShortcutAction.ShortcutAdded(
                        source = AddShortcutSource.MANUAL,
                        entryPoint = AddShortcutEntryPoint.PAGE_MENU,
                    )
                )
                navController.popBackStack(R.id.menuFragment, true)
            }
        }

    @Test
    fun `GIVEN as many shortcuts as allowed WHEN trying to add another one THEN inform the user about this and don't add it`() =
        runTest(testDispatcher) {
            every { settings.topSitesMaxLimit } returns 1
            coEvery { pinnedSiteStorage.getPinnedSites() } returns listOf(otherShortcut)
            val alertDialog: AlertDialog = mockk(relaxed = true)
            every { materialAlertDialogBuilder.create() } returns alertDialog
            every { alertDialog.findViewById<TextView>(any()) } returns mockk(relaxed = true)
            val store = createStore()

            store.dispatch(MenuAction.AddShortcut)
            testDispatcher.scheduler.advanceUntilIdle()

            verify {
                materialAlertDialogBuilder.setTitle(R.string.shortcut_max_limit_title)
                navController.popBackStack(R.id.menuFragment, true)
            }
            coVerify(exactly = 0) { addPinnedSiteUseCase(any(), any(), any()) }
        }

    @Test
    fun `GIVEN shortcuts that the user cannot remove exist WHEN adding another one THEN don't count them towards the shortcuts limit`() =
        runTest(testDispatcher) {
            every { settings.topSitesMaxLimit } returns 1
            coEvery { pinnedSiteStorage.getPinnedSites() } returns
                listOf(
                    TopSite.Provided(
                        id = 2,
                        title = null,
                        url = "https://example.org",
                        clickUrl = "",
                        imageUrl = "",
                        impressionUrl = "",
                        createdAt = 0,
                    )
                )
            val store = createStore()

            store.dispatch(MenuAction.AddShortcut)
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify { addPinnedSiteUseCase(title = TEST_TITLE, url = TEST_URL) }
        }

    @Test
    fun `GIVEN the current page is already a shortcut WHEN trying to add it again THEN abort`() =
        runTest(testDispatcher) {
            coEvery { pinnedSiteStorage.getPinnedSites() } returns
                listOf(TopSite.Pinned(id = 1, title = TEST_TITLE, url = TEST_URL, createdAt = 0))
            val store = createStore()

            store.dispatch(MenuAction.AddShortcut)
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify(exactly = 0) { addPinnedSiteUseCase(any(), any(), any()) }
        }

    @Test
    fun `WHEN removing the current page from shortcuts THEN remove it and dismiss the menu`() =
        runTest(testDispatcher) {
            val shortcut = TopSite.Pinned(id = 1, title = TEST_TITLE, url = TEST_URL, createdAt = 0)
            coEvery { pinnedSiteStorage.getPinnedSites() } returns listOf(shortcut)
            val store = createStore()

            store.dispatch(MenuAction.RemoveShortcut)
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify { removeTopSitesUseCase(topSite = shortcut) }
            verify { navController.popBackStack(R.id.menuFragment, true) }
        }

    @Test
    fun `GIVEN the page can be added as a PWA WHEN adding it to the home screen THEN add it and dismiss the menu`() =
        runTest(testDispatcher) {
            every { webAppUseCases.isInstallable() } returns true
            val store = createStore()

            store.dispatch(Navigate.AddToHomeScreen)
            testDispatcher.scheduler.advanceUntilIdle()

            coVerify { addToHomescreenUseCase() }
            verify {
                settings.installPwaOpened = true
                navController.popBackStack(R.id.menuFragment, true)
            }
        }

    @Test
    fun `GIVEN the page can be added as a shortcut WHEN adding it to the home screen THEN ask how to name the shortcut`() =
        runTest(testDispatcher) {
            every { webAppUseCases.isInstallable() } returns false
            val navOptions = slot<NavOptions>()
            val store = createStore()

            store.dispatch(Navigate.AddToHomeScreen)
            testDispatcher.scheduler.advanceUntilIdle()

            verify {
                navController.navigate(
                    MenuFragmentDirections.actionMenuFragmentToCreateShortcutFragment(),
                    capture(navOptions),
                )
            }
            assertEquals(R.id.browserFragment, navOptions.captured.popUpToId)
            coVerify(exactly = 0) { addToHomescreenUseCase() }
        }

    @Test
    fun `GIVEN collections already exist WHEN handling adding to collection THEN select to which collection to add`() {
        val directions = slot<NavDirections>()
        val navOptions = slot<NavOptions>()
        val store = createStore()

        store.dispatch(Navigate.SaveToCollection(true))

        verify {
            navController.navigate(capture(directions), capture(navOptions))
        }
        assertEquals(
            R.id.action_global_collectionCreationFragment,
            directions.captured.actionId,
        )

        val arguments = directions.captured.arguments
        assertContentEquals(arrayOf(TAB_ID), arguments.getStringArray("tabIds"))
        assertContentEquals(arrayOf(TAB_ID), arguments.getStringArray("selectedTabIds"))
        assertEquals(
            SaveCollectionStep.SelectCollection,
            arguments.getSerializable("saveCollectionStep", SaveCollectionStep::class.java),
        )
        assertEquals(R.id.browserFragment, navOptions.captured.popUpToId)
    }

    @Test
    fun `GIVEN collections don't already exist WHEN handling adding to collection THEN create a new collection to add to`() {
        val directions = slot<NavDirections>()
        val navOptions = slot<NavOptions>()
        val store = createStore()

        store.dispatch(Navigate.SaveToCollection(false))

        verify {
            navController.navigate(capture(directions), capture(navOptions))
        }
        assertEquals(
            R.id.action_global_collectionCreationFragment,
            directions.captured.actionId,
        )

        val arguments = directions.captured.arguments
        assertContentEquals(arrayOf(TAB_ID), arguments.getStringArray("tabIds"))
        assertContentEquals(arrayOf(TAB_ID), arguments.getStringArray("selectedTabIds"))
        assertEquals(
            SaveCollectionStep.NameCollection,
            arguments.getSerializable("saveCollectionStep", SaveCollectionStep::class.java),
        )
        assertEquals(R.id.browserFragment, navOptions.captured.popUpToId)
    }

    @Test
    fun `GIVEN an app can open the current page WHEN handling opening it there THEN do so and dismiss the menu`() {
        val store = createStore()

        store.dispatch(MenuAction.OpenInApp)

        verify {
            settings.openInAppOpened = true
            openAppLinkUseCase(any<Intent>())
            navController.popBackStack(R.id.menuFragment, true)
        }
    }

    @Test
    fun `GIVEN no app can open the current page WHEN handling opening it there THEN keep the menu open`() {
        every { appLinkRedirectUseCase(any()) } returns
            AppLinkRedirect(appIntent = null, appName = "", fallbackUrl = null, marketplaceIntent = null)
        val store = createStore()

        store.dispatch(MenuAction.OpenInApp)

        verify(exactly = 0) {
            settings.openInAppOpened = true
            openAppLinkUseCase(any<Intent>())
            navController.popBackStack(R.id.menuFragment, true)
        }
    }

    @Test
    fun `GIVEN there is no page shown WHEN handling opening it in an app THEN keep the menu open`() {
        val store = createStore(browserStore = BrowserStore())

        store.dispatch(MenuAction.OpenInApp)

        verify(exactly = 0) {
            openAppLinkUseCase(any<Intent>())
            navController.popBackStack(R.id.menuFragment, true)
        }
    }

    @Test
    fun `WHEN handling the request to save the webpage as a PDF THEN dismiss the menu and save the page as a PDF`() {
        val store = createStore()

        store.dispatch(MenuAction.SaveAsPdfRequested)

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            saveToPdfUSeCase(tabId = TAB_ID)
        }
    }

    @Test
    fun `WHEN handling the request to print THEN print the selected tab and dismiss the menu`() {
        val store = createStore()

        store.dispatch(MenuAction.PrintRequested)

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            printContentUseCase(tabId = TAB_ID)
        }
    }

    @Test
    fun `WHEN handling back navigation THEN dismiss the menu and navigate back in the current tab`() {
        val store = createStore()

        store.dispatch(Navigate.Back(viewHistory = false))

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            goBackUseCase(tabId = TAB_ID)
        }
    }

    @Test
    fun `WHEN handling back navigation with history THEN dismiss the menu and show the tab history`() {
        val store = createStore()

        store.dispatch(Navigate.Back(viewHistory = true))

        verify {
            navController.navigate(
                NavGraphDirections.actionGlobalTabHistoryDialogFragment(activeSessionId = null),
                any<NavOptions>(),
            )
        }
    }

    @Test
    fun `GIVEN there is no selected tab WHEN handling back navigation THEN do nothing`() {
        val emptyBrowserStore = BrowserStore(BrowserState(tabs = emptyList()))
        val store = createStore(browserStore = emptyBrowserStore)

        store.dispatch(Navigate.Back(viewHistory = false))

        verify(exactly = 0) {
            navController.popBackStack(R.id.menuFragment, true)
            goBackUseCase(any())
        }
    }

    @Test
    fun `WHEN handling showing tab history from the forward button THEN dismiss the menu and show the tab history`() {
        val store = createStore()

        store.dispatch(Navigate.Forward(viewHistory = false))

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            goForwardUseCase(tabId = TAB_ID)
        }
    }

    @Test
    fun `WHEN handling forward navigation with history THEN dismiss the menu and show the tab history`() {
        val store = createStore()

        store.dispatch(Navigate.Forward(viewHistory = true))

        verify {
            navController.navigate(
                NavGraphDirections.actionGlobalTabHistoryDialogFragment(activeSessionId = null),
                any<NavOptions>(),
            )
        }
    }

    @Test
    fun `GIVEN there is no selected tab WHEN handling forward navigation THEN do nothing`() {
        val emptyBrowserStore = BrowserStore(BrowserState(tabs = emptyList()))
        val store = createStore(browserStore = emptyBrowserStore)

        store.dispatch(Navigate.Forward(viewHistory = false))

        verify(exactly = 0) {
            navController.popBackStack(R.id.menuFragment, true)
            goForwardUseCase(any())
        }
    }

    @Test
    fun `WHEN handling share navigation THEN dismiss the menu and share the current page url`() {
        val store = createStore()
        val navigateToShareFragmentSlot = slot<() -> Unit>()

        store.dispatch(Navigate.Share)

        verify {
            shareUrlUseCase.shareUrl(
                id = TAB_ID,
                url = TEST_URL,
                title = TEST_TITLE,
                source = ShareSource.BROWSER_MENU,
                isPrivate = false,
                navigateToShareFragment = capture(navigateToShareFragmentSlot),
            )
        }

        navigateToShareFragmentSlot.captured.invoke()

        verify {
            navController.navigate(
                any<NavDirections>(),
                optionsEq(NavOptions.Builder().setPopUpTo(R.id.browserFragment, false).build()),
            )
        }
    }

    @Test
    fun `WHEN handling reload navigation without bypassing cache THEN dismiss the menu and reload the current tab`() {
        val store = createStore()

        store.dispatch(Navigate.Reload(bypassCache = false))

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            reloadUseCase(tabId = TAB_ID, flags = any())
        }
    }

    @Test
    fun `WHEN handling reload navigation with bypassing cache THEN dismiss the menu and reload the current tab bypassing cache`() {
        val store = createStore()

        store.dispatch(Navigate.Reload(bypassCache = true))

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            reloadUseCase(tabId = TAB_ID, flags = any())
        }
    }

    @Test
    fun `WHEN handling stop navigation THEN dismiss the menu and stop loading the current tab`() {
        val store = createStore()

        store.dispatch(Navigate.Stop)

        verify {
            navController.popBackStack(R.id.menuFragment, true)
            stopLoadingUseCase(tabId = TAB_ID)
        }
    }

    private fun moreItemForDiscovery(containsSummarize: Boolean) =
        ExpandableMenuItem(
            title = Text.String("More"),
            onClickEvent = MenuAction.OnMoreMenuClicked,
            subMenuItems =
                listOf(
                    if (containsSummarize) {
                        StandardMenuItem(title = Text.String("Summarize"), onClickEvent = Navigate.Summarizer)
                    } else {
                        readerViewItem
                    }
                ),
        )

    // Whether the page can be summarized is asked from the engine, so the tab needs a session to ask it from.
    private fun browserStoreWithEngineSession(isPrivate: Boolean = false) =
        BrowserStore(
            BrowserState(
                tabs =
                    listOf(
                        TabSessionState(
                            id = TAB_ID,
                            content = ContentState(url = TEST_URL, title = TEST_TITLE, private = isPrivate),
                            engineState = EngineState(engineSession = mockk<EngineSession>(relaxed = true)),
                        )
                    ),
                selectedTabId = TAB_ID,
            )
        )

    private fun ipProtectionStore(proxyStatus: ProxyStatus): IPProtectionStore = mockk {
        every { state } returns IPProtectionState(proxyStatus = proxyStatus)
        every { dispatch(any()) } just Runs
    }

    private fun createStore(
        provided: StateFlow<MenuItem?> = MutableStateFlow(readerViewItem),
        ipProtectionStore: IPProtectionStore = ipProtectionStore(Authorized.Idle),
        browserStore: BrowserStore = this.browserStore,
    ) =
        MenuStore(
            initialState = MenuState(emptyList()),
            middleware =
                listOf(
                    MenuMiddleware(
                        appStore = appStore,
                        browserStore = browserStore,
                        ipProtectionStore = ipProtectionStore,
                        useCases = useCases,
                        browserMenuBuilder =
                            BrowserMenuBuilder(
                                providerResolver = { FakeMenuItemProvider(provided) },
                                configuration =
                                    listOf(
                                        MenuSectionConfiguration(
                                            id = MENU_GROUP_ID,
                                            presentationMode = Row,
                                            items = listOf(CustomizeReaderView),
                                        )
                                    ),
                            ),
                        navController = navController,
                        summarizationSettings = summarizationSettings,
                        summarizationEligibilityChecker = summarizationEligibilityChecker,
                        settings = settings,
                        webCompatReporterMoreInfoSender = webCompatReporterMoreInfoSender,
                        pinnedSiteStorage = pinnedSiteStorage,
                        materialAlertDialogBuilder = materialAlertDialogBuilder,
                        scope = CoroutineScope(testDispatcher),
                        applicationScope = CoroutineScope(testDispatcher),
                    )
                ),
        )

    private class FakeMenuItemProvider(override val itemFlow: StateFlow<MenuItem?>) : MenuItemProvider

    private companion object {
        const val MENU_GROUP_ID = "test"
        const val BOOKMARK_GUID = "bookmarkGuid"
        const val TEST_URL = "https://mozilla.org"
        const val TEST_TITLE = "Mozilla"
        const val TAB_ID = "tab1"
        const val TOP_SITES_MAX_LIMIT = 16

        val otherShortcut = TopSite.Pinned(id = 2, title = "Example", url = "https://example.org", createdAt = 0)

        val readerViewItem =
            StandardMenuItem(title = Text.String("Customize reader view"), onClickEvent = CustomizeReaderViewEvent)
    }
}
