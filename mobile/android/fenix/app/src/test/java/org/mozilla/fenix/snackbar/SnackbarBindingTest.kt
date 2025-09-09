/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.snackbar

import android.content.Context
import android.view.View
import androidx.compose.ui.text.style.TextOverflow
import androidx.navigation.NavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.android.material.snackbar.Snackbar.LENGTH_INDEFINITE
import com.google.android.material.snackbar.Snackbar.LENGTH_LONG
import com.google.android.material.snackbar.Snackbar.LENGTH_SHORT
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import mozilla.appservices.places.BookmarkRoot
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.content.DownloadState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.storage.BookmarkNode
import mozilla.components.concept.storage.BookmarkNodeType
import mozilla.components.concept.sync.TabData
import mozilla.components.feature.accounts.push.SendTabUseCases
import mozilla.components.feature.accounts.push.SendTabUseCases.SendToAllUseCase
import mozilla.components.feature.accounts.push.SendTabUseCases.SendToDeviceUseCase
import mozilla.components.feature.tabs.TabsUseCases
import mozilla.components.feature.tabs.TabsUseCases.UndoTabRemovalUseCase
import mozilla.components.support.test.any
import mozilla.components.support.test.argumentCaptor
import mozilla.components.support.test.eq
import mozilla.components.support.test.libstate.ext.waitUntilIdle
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.rule.MainCoroutineRule
import mozilla.components.support.test.rule.runTestOnMain
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.BrowserFragmentDirections
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppAction.BookmarkAction
import org.mozilla.fenix.components.appstate.AppAction.ShareAction
import org.mozilla.fenix.components.appstate.AppAction.SnackbarAction
import org.mozilla.fenix.components.appstate.AppAction.TranslationsAction
import org.mozilla.fenix.components.appstate.AppAction.WebCompatAction
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.BookmarkAdded
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.CopyLinkToClipboard
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.CurrentTabClosed
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.DeletingBrowserDataInProgress
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.Dismiss
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.DownloadFailed
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.DownloadInProgress
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.None
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.ShareTabsFailed
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.ShareToAppFailed
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.SharedTabsSuccessfully
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.ShortcutAdded
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.ShortcutRemoved
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.SiteDataCleared
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.TranslationInProgress
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.UserAccountAuthenticated
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.WebCompatReportSent
import org.mozilla.fenix.components.metrics.MetricsUtils.BookmarkAction.Source
import org.mozilla.fenix.ext.tabClosedUndoMessage

@RunWith(AndroidJUnit4::class)
class SnackbarBindingTest {
    @get:Rule
    val coroutineRule = MainCoroutineRule()

    private val appStore = AppStore()
    private val snackbarDelegate: FenixSnackbarDelegate = mock()
    private val navController: NavController = mock()
    private val tabsUseCases: TabsUseCases = mock()

    @Test
    fun `GIVEN translation is in progress for the current selected session WHEN snackbar state is updated to translation in progress THEN display the snackbar`() = runTestOnMain {
        val sessionId = "sessionId"
        val tab = createTab(url = "https://www.mozilla.org", id = sessionId)
        val browserStore = BrowserStore(
            BrowserState(
                tabs = listOf(tab),
                selectedTabId = sessionId,
            ),
        )
        val binding = buildSnackbarBinding(
            browserStore = browserStore,
        )
        binding.start()

        appStore.dispatch(
            TranslationsAction.TranslationStarted(sessionId = sessionId),
        )
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = R.string.translation_in_progress_snackbar,
            duration = LENGTH_INDEFINITE,
            isError = false,
        )

        assertEquals(None(TranslationInProgress(sessionId)), appStore.state.snackbarState)
    }

    @Test
    fun `GIVEN translation is in progress for a different session WHEN snackbar state is updated to translation in progress THEN do not display the snackbar`() = runTestOnMain {
        val tab1 = createTab(url = "https://www.mozilla.org", id = "1")
        val tab2 = createTab(url = "https://www.mozilla.org", id = "2")
        val browserStore = BrowserStore(
            BrowserState(
                tabs = listOf(tab1, tab2),
                selectedTabId = tab1.id,
            ),
        )
        val binding = buildSnackbarBinding(
            browserStore = browserStore,
        )
        binding.start()

        appStore.dispatch(
            TranslationsAction.TranslationStarted(sessionId = tab2.id),
        )
        waitForStoreToSettle()

        verify(snackbarDelegate, never()).show(
            text = R.string.translation_in_progress_snackbar,
            duration = LENGTH_LONG,
            isError = false,
        )
    }

    @Test
    fun `WHEN the snackbar state is updated to dismiss THEN dismiss the snackbar`() = runTestOnMain {
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(SnackbarAction.SnackbarDismissed)
        waitForStoreToSettle()

        assertEquals(None(Dismiss(None())), appStore.state.snackbarState)
        verify(snackbarDelegate).dismiss()
    }

    @Test
    fun `GIVEN bookmark's parent is a root node WHEN the bookmark added state is observed THEN display friendly title`() = runTestOnMain {
        val parent = buildParentBookmarkNode(guid = BookmarkRoot.Mobile.id, title = "mobile")
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(
            BookmarkAction.BookmarkAdded(
                guidToEdit = "1",
                parentNode = parent,
                source = Source.TEST,
            ),
        )
        waitForStoreToSettle()

        assertEquals(None(BookmarkAdded("1", parent)), appStore.state.snackbarState)

        val outputMessage = testContext.getString(R.string.bookmark_saved_in_folder_snackbar, "Bookmarks")
        verify(snackbarDelegate).show(
            text = eq(outputMessage),
            subText = eq(null),
            subTextOverflow = eq(null),
            duration = eq(LENGTH_LONG),
            isError = eq(false),
            action = eq("EDIT"),
            listener = any(),
        )
    }

    @Test
    fun `GIVEN bookmark's parent is not a root node but has a root node title WHEN the bookmark added state is observed THEN display custom title`() = runTestOnMain {
        val parent = buildParentBookmarkNode(title = "mobile", guid = "not a root")
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(
            BookmarkAction.BookmarkAdded(
                guidToEdit = "1",
                parentNode = parent,
                source = Source.TEST,
            ),
        )

        // Wait for BookmarkAction.BookmarkAdded(guidToEdit = "1"),
        appStore.waitUntilIdle()
        // Wait for SnackbarAction.SnackbarShown
        appStore.waitUntilIdle()

        assertEquals(None(BookmarkAdded("1", parent)), appStore.state.snackbarState)

        val outputMessage = testContext.getString(R.string.bookmark_saved_in_folder_snackbar, "mobile")
        verify(snackbarDelegate).show(
            text = eq(outputMessage),
            subText = eq(null),
            subTextOverflow = eq(null),
            duration = eq(LENGTH_LONG),
            isError = eq(false),
            action = eq(testContext.getString(R.string.edit_bookmark_snackbar_action)),
            listener = any(),
        )
    }

    @Test
    fun `GIVEN no bookmark is added WHEN the bookmark added state is observed THEN display the error snackbar`() = runTestOnMain {
        val parent = buildParentBookmarkNode()
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(
            BookmarkAction.BookmarkAdded(guidToEdit = null, parentNode = parent, source = Source.TEST),
        )

        // Wait for BookmarkAction.BookmarkAdded(guidToEdit = null),
        appStore.waitUntilIdle()
        // Wait for SnackbarAction.SnackbarShown
        appStore.waitUntilIdle()

        assertEquals(None(BookmarkAdded(null, parent)), appStore.state.snackbarState)
        verify(snackbarDelegate).show(
            text = R.string.bookmark_invalid_url_error,
            duration = LENGTH_LONG,
        )
    }

    @Test
    fun `GIVEN there is no parent folder for an added bookmark WHEN the bookmark added state is observed THEN display the error snackbar`() = runTestOnMain {
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(
            BookmarkAction.BookmarkAdded(guidToEdit = "guid", parentNode = null, source = Source.TEST),
        )
        waitForStoreToSettle()

        assertEquals(None(BookmarkAdded("guid", null)), appStore.state.snackbarState)
        verify(snackbarDelegate).show(
            text = R.string.bookmark_invalid_url_error,
            duration = LENGTH_LONG,
            isError = false,
        )
    }

    @Test
    fun `WHEN the shortcut added state action is dispatched THEN display the appropriate snackbar`() = runTestOnMain {
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(
            AppAction.ShortcutAction.ShortcutAdded,
        )
        waitForStoreToSettle()

        assertEquals(None(ShortcutAdded), appStore.state.snackbarState)
        verify(snackbarDelegate).show(
            text = R.string.snackbar_added_to_shortcuts,
            duration = LENGTH_LONG,
            isError = false,
        )
    }

    @Test
    fun `WHEN the shortcut removed state action is dispatched THEN display the appropriate snackbar`() = runTestOnMain {
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(
            AppAction.ShortcutAction.ShortcutRemoved,
        )
        waitForStoreToSettle()

        assertEquals(None(ShortcutRemoved), appStore.state.snackbarState)
        verify(snackbarDelegate).show(
            text = R.string.snackbar_top_site_removed,
            duration = LENGTH_LONG,
            isError = false,
        )
    }

    @Test
    fun `WHEN the delete and quit selected state action is dispatched THEN display the appropriate snackbar`() = runTestOnMain {
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(
            AppAction.DeleteAndQuitStarted,
        )
        waitForStoreToSettle()

        assertEquals(None(DeletingBrowserDataInProgress), appStore.state.snackbarState)
        verify(snackbarDelegate).show(
            text = R.string.deleting_browsing_data_in_progress,
            duration = LENGTH_INDEFINITE,
            isError = false,
        )
    }

    @Test
    fun `WHEN the user has successfully signed in THEN display the appropriate snackbar`() = runTestOnMain {
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(
            AppAction.UserAccountAuthenticated,
        )
        waitForStoreToSettle()

        assertEquals(None(UserAccountAuthenticated), appStore.state.snackbarState)
        verify(snackbarDelegate).show(
            text = R.string.sync_syncing_in_progress,
            duration = LENGTH_SHORT,
        )

        assertEquals(None(UserAccountAuthenticated), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN share to app failed THEN display a snackbar`() {
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(ShareAction.ShareToAppFailed)
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = R.string.share_error_snackbar,
            duration = LENGTH_LONG,
            isError = false,
        )

        assertEquals(None(ShareToAppFailed), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN sharing a tab was successful THEN display an appropriate snackbar`() {
        val destinations = listOf("a")
        val sharedTabs = listOf(mock<TabData>())
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(ShareAction.SharedTabsSuccessfully(destinations, sharedTabs))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = R.string.sync_sent_tab_snackbar,
            duration = LENGTH_SHORT,
            isError = false,
        )

        assertEquals(None(SharedTabsSuccessfully(destinations, sharedTabs)), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN sharing multiple tabs was successful THEN display an appropriate snackbar`() {
        val destinations = listOf("a")
        val sharedTabs = listOf(mock<TabData>(), mock<TabData>())
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(ShareAction.SharedTabsSuccessfully(destinations, sharedTabs))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = R.string.sync_sent_tabs_snackbar,
            duration = LENGTH_SHORT,
            isError = false,
        )

        assertEquals(None(SharedTabsSuccessfully(destinations, sharedTabs)), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN sharing tabs failed THEN show a snackbar`() {
        val destinations = listOf("a")
        val sharedTabs = listOf(mock<TabData>())
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(ShareAction.ShareTabsFailed(destinations, sharedTabs))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = eq(R.string.sync_sent_tab_error_snackbar),
            duration = eq(LENGTH_LONG),
            isError = eq(true),
            action = eq(R.string.sync_sent_tab_error_snackbar_action),
            listener = any(),
        )

        assertEquals(None(ShareTabsFailed(destinations, sharedTabs)), appStore.state.snackbarState)
    }

    @Test
    fun `GIVEN sharing tabs to another device failed and user chose to retry WHEN this succeeds THEN show a snackbar`() = runTestOnMain {
        val destinations = listOf("a")
        val sharedTabs = listOf(mock<TabData>())
        val retryActionCaptor = argumentCaptor<((v: View) -> Unit)>()
        val sendTabUseCases: SendTabUseCases = mock()
        val sendToDeviceUseCase: SendToDeviceUseCase = mock()
        doReturn(sendToDeviceUseCase).`when`(sendTabUseCases).sendToDeviceAsync
        val retryResult = CompletableDeferred(true)
        doReturn(retryResult).`when`(sendToDeviceUseCase).invoke(any(), any<List<TabData>>())
        val binding = buildSnackbarBinding(
            sendTabUseCases = sendTabUseCases,
            ioDispatcher = coroutineRule.testDispatcher,
        )
        binding.start()

        appStore.dispatch(ShareAction.ShareTabsFailed(destinations, sharedTabs))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = eq(R.string.sync_sent_tab_error_snackbar),
            duration = eq(LENGTH_LONG),
            isError = eq(true),
            action = eq(R.string.sync_sent_tab_error_snackbar_action),
            listener = retryActionCaptor.capture(),
        )

        retryActionCaptor.value.invoke(mock())
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = R.string.sync_sent_tab_snackbar,
            duration = LENGTH_SHORT,
            isError = false,
        )

        assertEquals(None(SharedTabsSuccessfully(destinations, sharedTabs)), appStore.state.snackbarState)
    }

    @Test
    fun `GIVEN sharing tabs to other devices failed and user chose to retry WHEN this fails again THEN show a snackbar`() = runTestOnMain {
        val destinations = listOf("a", "b")
        val sharedTabs = listOf(mock<TabData>())
        val retryActionCaptor = argumentCaptor<((v: View) -> Unit)>()
        val sendTabUseCases: SendTabUseCases = mock()
        val sendToAllDevicesUseCase: SendToAllUseCase = mock()
        doReturn(sendToAllDevicesUseCase).`when`(sendTabUseCases).sendToAllAsync
        val retryResult = CompletableDeferred(false)
        doReturn(retryResult).`when`(sendToAllDevicesUseCase).invoke(any<List<TabData>>())
        val binding = buildSnackbarBinding(
            sendTabUseCases = sendTabUseCases,
            ioDispatcher = coroutineRule.testDispatcher,
        )
        binding.start()

        appStore.dispatch(ShareAction.ShareTabsFailed(destinations, sharedTabs))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = eq(R.string.sync_sent_tab_error_snackbar),
            duration = eq(LENGTH_LONG),
            isError = eq(true),
            action = eq(R.string.sync_sent_tab_error_snackbar_action),
            listener = retryActionCaptor.capture(),
        )

        retryActionCaptor.value.invoke(mock())
        waitForStoreToSettle()

        verify(snackbarDelegate, times(2)).show(
            text = eq(R.string.sync_sent_tab_error_snackbar),
            duration = eq(LENGTH_LONG),
            isError = eq(true),
            action = eq(R.string.sync_sent_tab_error_snackbar_action),
            listener = any(),
        )

        assertEquals(None(ShareTabsFailed(destinations, sharedTabs)), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN a link is copied to clipboard THEN display a snackbar`() {
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(ShareAction.CopyLinkToClipboard)
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = R.string.toast_copy_link_to_clipboard,
            duration = LENGTH_SHORT,
        )

        assertEquals(None(CopyLinkToClipboard), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN site data is cleared THEN display a snackbar`() {
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(AppAction.SiteDataCleared)
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = R.string.clear_site_data_snackbar,
        )

        assertEquals(None(SiteDataCleared), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN the current tab is closed THEN display a snackbar`() {
        val snackbarAction = argumentCaptor<((v: View) -> Unit)>()
        val undoUsecase: UndoTabRemovalUseCase = mock()
        doReturn(undoUsecase).`when`(tabsUseCases).undo
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(AppAction.CurrentTabClosed(isPrivate = false))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = eq(testContext.tabClosedUndoMessage(false)),
            subText = eq(null),
            subTextOverflow = eq(null),
            duration = eq(LENGTH_LONG),
            isError = eq(false),
            action = eq(testContext.getString(R.string.snackbar_deleted_undo)),
            listener = snackbarAction.capture(),
        )
        snackbarAction.value.invoke(mock())
        verify(undoUsecase).invoke()

        assertEquals(None(CurrentTabClosed(false)), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN download is failed THEN display a snackbar`() {
        val snackbarAction = argumentCaptor<((v: View) -> Unit)>()
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(AppAction.DownloadAction.DownloadFailed(fileName = "fileName"))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = eq(testContext.getString(R.string.download_item_status_failed)),
            subText = eq("fileName"),
            subTextOverflow = eq(TextOverflow.MiddleEllipsis),
            duration = eq(DOWNLOAD_SNACKBAR_DURATION_MS),
            isError = eq(false),
            action = eq(testContext.getString(R.string.download_failed_snackbar_action_details)),
            listener = snackbarAction.capture(),
        )
        snackbarAction.value.invoke(mock())

        verify(navController).navigate(
            BrowserFragmentDirections.actionGlobalDownloadsFragment(),
        )

        assertEquals(None(DownloadFailed("fileName")), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN download is completed THEN display a snackbar`() {
        val snackbarAction = argumentCaptor<((v: View) -> Unit)>()
        val binding = buildSnackbarBinding()
        binding.start()

        val downloadState = DownloadState(
            id = "1",
            url = "url",
            fileName = "fileName",
            contentType = "application/zip",
            contentLength = 5242880,
            status = DownloadState.Status.DOWNLOADING,
            directoryPath = "downloads",
            destinationDirectory = "Environment.DIRECTORY_MUSIC",
            private = true,
            createdTime = 33,
            etag = "etag",
        )

        appStore.dispatch(AppAction.DownloadAction.DownloadCompleted(downloadState))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = eq(testContext.getString(R.string.download_completed_snackbar)),
            subText = eq("fileName"),
            subTextOverflow = eq(TextOverflow.MiddleEllipsis),
            duration = eq(DOWNLOAD_SNACKBAR_DURATION_MS),
            isError = eq(false),
            action = eq(testContext.getString(R.string.download_completed_snackbar_action_open)),
            listener = snackbarAction.capture(),
        )
    }

    @Test
    fun `WHEN download file can't be open THEN display a snackbar`() {
        val binding = buildSnackbarBinding()
        binding.start()

        val downloadState = DownloadState(
            id = "1",
            url = "url",
            fileName = "fileName",
            contentType = "application/zip",
            contentLength = 5242880,
            status = DownloadState.Status.DOWNLOADING,
            directoryPath = "downloads",
            destinationDirectory = "Environment.DIRECTORY_MUSIC",
            private = true,
            createdTime = 33,
            etag = "etag",
        )

        appStore.dispatch(AppAction.DownloadAction.CannotOpenFile(downloadState))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = "No app found to open  files",
            duration = DOWNLOAD_SNACKBAR_DURATION_MS,
            isError = false,
        )
    }

    @Test
    fun `WHEN download file is in progress THEN display a snackbar`() {
        val snackbarAction = argumentCaptor<((v: View) -> Unit)>()
        val binding = buildSnackbarBinding(
            browserStore = BrowserStore(
                BrowserState(
                    tabs = listOf(
                        createTab("https://www.firefox.com", id = "id"),
                    ),
                    selectedTabId = "id",
                ),
            ),
        )
        binding.start()

        appStore.dispatch(AppAction.DownloadAction.DownloadInProgress(downloadId = "id"))
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = eq(testContext.getString(R.string.download_in_progress_snackbar)),
            subText = eq(null),
            subTextOverflow = eq(null),
            duration = eq(DOWNLOAD_SNACKBAR_DURATION_MS),
            isError = eq(false),
            action = eq(testContext.getString(R.string.download_in_progress_snackbar_action_details)),
            listener = snackbarAction.capture(),
        )
        snackbarAction.value.invoke(mock())

        verify(navController).navigate(
            BrowserFragmentDirections.actionGlobalDownloadsFragment(),
        )

        assertEquals(None(DownloadInProgress("id")), appStore.state.snackbarState)
    }

    @Test
    fun `WHEN a webcompat report is successfully sent THEN show a snackbar`() {
        val snackbarAction = argumentCaptor<((v: View) -> Unit)>()
        val binding = buildSnackbarBinding()
        binding.start()

        appStore.dispatch(WebCompatAction.WebCompatReportSent)
        waitForStoreToSettle()

        verify(snackbarDelegate).show(
            text = eq(testContext.getString(R.string.webcompat_reporter_success_snackbar_text)),
            subText = eq(null),
            subTextOverflow = eq(null),
            duration = eq(WEBCOMPAT_SNACKBAR_DURATION_MS),
            isError = eq(false),
            action = eq(testContext.getString(R.string.webcompat_reporter_dismiss_success_snackbar_text)),
            listener = snackbarAction.capture(),
        )

        assertEquals(None(WebCompatReportSent), appStore.state.snackbarState)

        verify(snackbarDelegate, never()).dismiss()
        snackbarAction.value.invoke(mock())
        verify(snackbarDelegate).dismiss()
    }

    private fun buildSnackbarBinding(
        context: Context = testContext,
        browserStore: BrowserStore = mock(),
        appStore: AppStore = this.appStore,
        snackbarDelegate: FenixSnackbarDelegate = this.snackbarDelegate,
        navController: NavController = this.navController,
        tabsUseCases: TabsUseCases = this.tabsUseCases,
        sendTabUseCases: SendTabUseCases? = null,
        customTabSessionId: String? = null,
        ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    ) = SnackbarBinding(
        context = context,
        browserStore = browserStore,
        appStore = appStore,
        snackbarDelegate = snackbarDelegate,
        navController = navController,
        tabsUseCases = tabsUseCases,
        sendTabUseCases = sendTabUseCases,
        customTabSessionId = customTabSessionId,
        ioDispatcher = ioDispatcher,
    )

    private fun waitForStoreToSettle() {
        // Wait for the trigger action to be handled,
        appStore.waitUntilIdle()
        // Wait for SnackbarAction.SnackbarShown to be dispatched
        appStore.waitUntilIdle()
    }

    private fun buildParentBookmarkNode(
        guid: String = "guid",
        title: String = "title",
    ) = BookmarkNode(
        type = BookmarkNodeType.FOLDER,
        guid = guid,
        parentGuid = "parentGuid",
        position = 0U,
        title = title,
        url = null,
        dateAdded = 0,
        lastModified = 0,
        children = listOf(),
    )
}
