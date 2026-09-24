/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.downloads.listscreen

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.test.ext.junit.runners.AndroidJUnit4
import junit.framework.TestCase.assertEquals
import kotlin.test.assertNotNull
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.downloads.listscreen.store.DownloadUIAction
import org.mozilla.fenix.downloads.listscreen.store.DownloadUIState
import org.mozilla.fenix.downloads.listscreen.store.DownloadUIStore
import org.mozilla.fenix.downloads.listscreen.store.FileItem
import org.mozilla.fenix.downloads.listscreen.store.TimeCategory

@RunWith(AndroidJUnit4::class)
class DownloadsScreenSwipeTest {

    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun `WHEN a completed item is swiped THEN a RequestDelete action is dispatched`() {
        var dispatchedAction: DownloadUIAction.RequestDelete? = null

        val item = createFileItem(id = "1", fileName = "completed.pdf", status = FileItem.Status.Completed)

        val store =
            createStoreWithItems(listOf(item)) { action ->
                if (action is DownloadUIAction.RequestDelete) {
                    dispatchedAction = action
                }
            }

        composeTestRule.setContent {
            DownloadsScreen(downloadsStore = store, onItemClick = {})
        }

        composeTestRule.onNodeWithTag("${DownloadsListTestTag.DOWNLOADS_LIST_ITEM}.completed.pdf").performTouchInput {
            swipeLeft(
                startX = centerRight.x,
                endX = centerLeft.x - 500f,
                durationMillis = 500,
            )
        }

        composeTestRule.waitUntil(timeoutMillis = 5000) {
            dispatchedAction != null
        }

        assertNotNull(dispatchedAction)
        assertEquals(item, dispatchedAction.item)
        assertEquals(true, dispatchedAction.isSwipe)
    }

    @Test
    fun `WHEN a downloading item is swiped THEN a RequestDelete action is dispatched`() {
        var dispatchedAction: DownloadUIAction.RequestDelete? = null

        val item =
            createFileItem(
                id = "2",
                fileName = "downloading.pdf",
                status = FileItem.Status.Downloading(0.5f),
            )

        val store =
            createStoreWithItems(listOf(item)) { action ->
                if (action is DownloadUIAction.RequestDelete) {
                    dispatchedAction = action
                }
            }

        composeTestRule.setContent {
            DownloadsScreen(downloadsStore = store, onItemClick = {})
        }

        composeTestRule.onNodeWithTag("${DownloadsListTestTag.DOWNLOADS_LIST_ITEM}.downloading.pdf").performTouchInput {
            swipeLeft(
                startX = centerRight.x,
                endX = centerLeft.x - 500f,
                durationMillis = 500,
            )
        }

        composeTestRule.waitUntil(timeoutMillis = 5000) {
            dispatchedAction != null
        }

        assertNotNull(dispatchedAction)
        assertEquals(item, dispatchedAction.item)
        assertEquals(true, dispatchedAction.isSwipe)
    }

    @Test
    fun `WHEN a failed item is swiped THEN a RequestDelete action is dispatched`() {
        var dispatchedAction: DownloadUIAction.RequestDelete? = null

        val item = createFileItem(id = "3", fileName = "failed.pdf", status = FileItem.Status.Failed)

        val store =
            createStoreWithItems(listOf(item)) { action ->
                if (action is DownloadUIAction.RequestDelete) {
                    dispatchedAction = action
                }
            }

        composeTestRule.setContent {
            DownloadsScreen(downloadsStore = store, onItemClick = {})
        }

        composeTestRule.onNodeWithTag("${DownloadsListTestTag.DOWNLOADS_LIST_ITEM}.failed.pdf").performTouchInput {
            swipeLeft(
                startX = centerRight.x,
                endX = centerLeft.x - 500f,
                durationMillis = 500,
            )
        }

        composeTestRule.waitUntil(timeoutMillis = 5000) {
            dispatchedAction != null
        }

        assertNotNull(dispatchedAction)
        assertEquals(item, dispatchedAction.item)
        assertEquals(true, dispatchedAction.isSwipe)
    }

    @Test
    fun `WHEN an item is swiped in edit mode THEN a RequestDelete action is not dispatched`() {
        var dispatchedAction: DownloadUIAction.RequestDelete? = null

        val item = createFileItem(id = "4", fileName = "edit_mode.pdf", status = FileItem.Status.Completed)

        val middleware =
            object : Middleware<DownloadUIState, DownloadUIAction> {
                override fun invoke(
                    store: Store<DownloadUIState, DownloadUIAction>,
                    next: (DownloadUIAction) -> Unit,
                    action: DownloadUIAction,
                ) {
                    if (action is DownloadUIAction.RequestDelete) {
                        dispatchedAction = action
                    }
                    next(action)
                }
            }

        val store =
            DownloadUIStore(
                initialState =
                    DownloadUIState.INITIAL.copy(
                        items = listOf(item),
                        mode = DownloadUIState.Mode.Editing(setOf(item)),
                    ),
                middleware = listOf(middleware),
            )

        composeTestRule.setContent {
            DownloadsScreen(downloadsStore = store, onItemClick = {})
        }

        composeTestRule.onNodeWithTag("${DownloadsListTestTag.DOWNLOADS_LIST_ITEM}.edit_mode.pdf").performTouchInput {
            swipeLeft(
                startX = centerRight.x,
                endX = centerLeft.x - 500f,
                durationMillis = 500,
            )
        }

        Thread.sleep(1000)

        assertEquals(null, dispatchedAction)
    }

    private fun createFileItem(id: String, fileName: String, status: FileItem.Status) =
        FileItem(
            id = id,
            fileName = fileName,
            url = "https://example.com/$fileName",
            description = "1.2 MB",
            directoryPath = "/Downloads",
            displayedShortUrl = "example.com",
            contentType = "application/pdf",
            status = status,
            filePath = "/path/to/$fileName",
            timeCategory = TimeCategory.TODAY,
        )

    private fun createStoreWithItems(
        items: List<FileItem>,
        onAction: (DownloadUIAction) -> Unit,
    ): DownloadUIStore {
        val middleware =
            object : Middleware<DownloadUIState, DownloadUIAction> {
                override fun invoke(
                    store: Store<DownloadUIState, DownloadUIAction>,
                    next: (DownloadUIAction) -> Unit,
                    action: DownloadUIAction,
                ) {
                    onAction(action)
                    next(action)
                }
            }

        return DownloadUIStore(
            initialState =
                DownloadUIState.INITIAL.copy(
                    items = items,
                    mode = DownloadUIState.Mode.Normal,
                ),
            middleware = listOf(middleware),
        )
    }
}
