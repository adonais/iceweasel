/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.toolbar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.Divider
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.browser.toolbar.ActionContainer
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.lib.state.ext.observeAsComposableState

/**
 * A simple browser toolbar that displays only the browser end actions configured in [store].
 *
 * @param store The [BrowserToolbarStore] to observe the UI state from.
 */
@Composable
fun BrowserSimpleToolbar(
    store: BrowserToolbarStore,
) {
    val uiState by store.observeAsComposableState { it }

    val pageOrigin = uiState.displayState.pageOrigin
    val browserActionsEnd = uiState.displayState.browserActionsEnd
    val onInteraction: (BrowserToolbarEvent) -> Unit = { store.dispatch(it) }

    Box(
        modifier = Modifier
            .background(color = AcornTheme.colors.layer1)
            .fillMaxWidth(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(
                modifier = Modifier
                    .clickable { onInteraction(requireNotNull(pageOrigin.onClick)) }
                    .height(64.dp)
                    .weight(1f),
            )

            if (browserActionsEnd.isNotEmpty()) {
                ActionContainer(
                    actions = browserActionsEnd,
                    onInteraction = onInteraction,
                )
            }
        }

        Divider(modifier = Modifier.align(Alignment.BottomCenter))
    }
}
