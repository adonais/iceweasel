/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.toolbar

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.theme.localAcornColors
import mozilla.components.compose.browser.toolbar.ActionContainer
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.wallpapers.WallpaperState

/**
 * A simple browser toolbar that displays only the browser end actions configured in [store].
 *
 * @param store The [BrowserToolbarStore] to observe the UI state from.
 * @param appStore The [AppStore] to observe the wallpaper state from.
 */
@Composable
fun BrowserSimpleToolbar(
    store: BrowserToolbarStore,
    appStore: AppStore,
) {
    val uiState by store.observeAsComposableState { it }

    val pageOrigin = uiState.displayState.pageOrigin
    val browserActionsEnd = uiState.displayState.browserActionsEnd
    val onInteraction: (BrowserToolbarEvent) -> Unit = { store.dispatch(it) }

    val currentWallpaperTextColor = appStore.observeAsComposableState { state ->
        state.wallpaperState.currentWallpaper.textColor
    }
    val defaultWallpaperTextColor = WallpaperState.default.buttonTextColor
    val buttonsColor by remember(currentWallpaperTextColor.value) {
        derivedStateOf {
            currentWallpaperTextColor.value?.let { Color(it) } ?: defaultWallpaperTextColor
        }
    }
    val firefoxColors = FirefoxTheme.colors
    val customTheme = remember(buttonsColor) {
        firefoxColors.copy(
            textPrimary = buttonsColor,
            iconPrimary = buttonsColor,
        )
    }

    CompositionLocalProvider(localAcornColors provides customTheme) {
        Row(
            modifier = Modifier
                .fillMaxWidth(),
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
    }
}
