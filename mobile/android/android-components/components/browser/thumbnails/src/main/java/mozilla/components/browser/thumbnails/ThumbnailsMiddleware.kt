/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.thumbnails

import android.os.SystemClock
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.thumbnails.facts.BrowserThumbnailsFacts
import mozilla.components.browser.thumbnails.facts.emitBrowserThumbnailsFact
import mozilla.components.browser.thumbnails.storage.ThumbnailStorage
import mozilla.components.concept.base.images.ImageSaveRequest
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store
import mozilla.components.support.base.facts.Action

/**
 * [Middleware] implementation for handling [ContentAction.UpdateThumbnailAction] and storing the thumbnail to the disk
 * cache.
 */
class ThumbnailsMiddleware(private val thumbnailStorage: ThumbnailStorage) : Middleware<BrowserState, BrowserAction> {
    override fun invoke(
        store: Store<BrowserState, BrowserAction>,
        next: (BrowserAction) -> Unit,
        action: BrowserAction,
    ) {
        when (action) {
            is TabListAction.RemoveAllNormalTabsAction -> {
                store.state.tabs
                    .filterNot { it.content.private }
                    .forEach { tab ->
                        thumbnailStorage.deleteThumbnail(tab.id, isPrivate = false)
                    }
            }
            is TabListAction.RemoveAllPrivateTabsAction -> {
                store.state.tabs
                    .filter { it.content.private }
                    .forEach { tab ->
                        thumbnailStorage.deleteThumbnail(tab.id, isPrivate = true)
                    }
            }
            is TabListAction.RemoveAllTabsAction -> {
                thumbnailStorage.clearThumbnails()
            }
            is TabListAction.RemoveTabAction -> {
                // Delete the tab screenshot from the storage when the tab is removed.
                val isPrivate = store.state.isTabIdPrivate(action.tabId)
                thumbnailStorage.deleteThumbnail(action.tabId, isPrivate)
            }
            is TabListAction.RemoveTabsAction -> {
                action.tabIds.forEach { id ->
                    val isPrivate = store.state.isTabIdPrivate(id)
                    thumbnailStorage.deleteThumbnail(id, isPrivate)
                }
            }
            is ContentAction.UpdateThumbnailAction -> {
                // Store the captured tab screenshot from the EngineView when the session's
                // thumbnail is updated.
                store.state.tabs
                    .find { it.id == action.sessionId }
                    ?.let { session ->
                        val request = ImageSaveRequest(session.id, session.content.private)
                        val startedAt = SystemClock.elapsedRealtime()
                        thumbnailStorage.saveThumbnail(request, action.thumbnail).invokeOnCompletion {
                            emitBrowserThumbnailsFact(
                                action = Action.IMPLEMENTATION_DETAIL,
                                item = BrowserThumbnailsFacts.Items.DISK_WRITE_DURATION,
                                metadata =
                                    mapOf(
                                        BrowserThumbnailsFacts.MetadataKeys.DURATION_MS to
                                            SystemClock.elapsedRealtime() - startedAt
                                    ),
                            )
                        }
                    }
                return // Do not let the thumbnail actions continue through to the reducer.
            }
            else -> {
                // no-op
            }
        }
        next(action)
    }

    private fun BrowserState.isTabIdPrivate(id: String): Boolean = tabs.any { it.id == id && it.content.private }
}
