/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.browser.toolbar.concept.PageOrigin
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchQueryUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.CommitUrl
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarState
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.DisplayState
import mozilla.components.compose.browser.toolbar.store.EditState
import mozilla.components.compose.browser.toolbar.store.Mode
import mozilla.components.compose.browser.toolbar.ui.BrowserToolbarQuery
import mozilla.components.lib.state.ext.observeAsComposableState

/**
 * A customizable toolbar for browsers.
 *
 * The toolbar can switch between two modes: display and edit. The display mode displays the current
 * URL and controls for navigation. In edit mode the current URL can be edited. Those two modes are
 * implemented by the [BrowserDisplayToolbar] and [BrowserEditToolbar] composables.
 *
 * @param store The [BrowserToolbarStore] to observe the UI state from.
 */
@Composable
fun BrowserToolbar(
    store: BrowserToolbarStore,
) {
    val uiState by store.observeAsComposableState { it }

    if (uiState.isEditMode()) {
        BrowserEditToolbar(
            query = uiState.editState.query.current,
            hint = stringResource(uiState.editState.hint),
            isQueryPrefilled = uiState.editState.isQueryPrefilled,
            usePrivateModeQueries = uiState.editState.isQueryPrivate,
            gravity = uiState.gravity,
            suggestion = uiState.editState.suggestion,
            editActionsStart = uiState.editState.editActionsStart,
            editActionsEnd = uiState.editState.editActionsEnd,
            onUrlCommitted = { text -> store.dispatch(CommitUrl(text)) },
            onUrlEdit = { store.dispatch(SearchQueryUpdated(it)) },
            onInteraction = { store.dispatch(it) },
        )
    } else {
        BrowserDisplayToolbar(
            pageOrigin = uiState.displayState.pageOrigin,
            progressBarConfig = uiState.displayState.progressBarConfig,
            gravity = uiState.gravity,
            browserActionsStart = uiState.displayState.browserActionsStart,
            pageActionsStart = uiState.displayState.pageActionsStart,
            pageActionsEnd = uiState.displayState.pageActionsEnd,
            browserActionsEnd = uiState.displayState.browserActionsEnd,
            onInteraction = { store.dispatch(it) },
        )
    }
}

@PreviewLightDark
@Composable
private fun BrowserToolbarPreview_EditMode() {
    // Mock edit state
    val editState = EditState(
        query = BrowserToolbarQuery("https://www.mozilla.org"),
        suggestion = null,
        editActionsStart = emptyList(),
        editActionsEnd = emptyList(),
    )
    val toolbarState = BrowserToolbarState(
        mode = Mode.EDIT,
        editState = editState,
    )
    val store = BrowserToolbarStore(toolbarState)

    AcornTheme {
        BrowserToolbar(
            store = store,
        )
    }
}

@PreviewLightDark
@Composable
private fun BrowserToolbarPreview_DisplayMode() {
    val mockPageOrigin = PageOrigin(
        hint = 0,
        title = "Preview Title",
        url = "https://www.mozilla.org",
        onClick = object : BrowserToolbarEvent {},
        onLongClick = null,
        textGravity = PageOrigin.Companion.TextGravity.TEXT_GRAVITY_START,
    )
    val displayState = DisplayState(
        pageOrigin = mockPageOrigin,
        browserActionsStart = emptyList(),
        pageActionsStart = emptyList(),
        pageActionsEnd = emptyList(),
        browserActionsEnd = emptyList(),
    )
    val toolbarState = BrowserToolbarState(
        mode = Mode.DISPLAY,
        displayState = displayState,
    )
    val store = BrowserToolbarStore(toolbarState)

    AcornTheme {
        BrowserToolbar(
            store = store,
        )
    }
}
