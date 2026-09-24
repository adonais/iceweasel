/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.toolbar

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.colorResource
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.utils.Settings
import org.mozilla.fenix.wallpapers.Wallpaper

/**
 * Returns the wallpaper and browsing mode derived colors for home content.
 *
 * @param isPrivateMode Whether private browsing is enabled.
 * @param shouldUseEdgeToEdgeColors Whether the edge-to-edge wallpaper colors should be used.
 */
@Composable
fun homepageToolbarColors(
    isPrivateMode: Boolean,
    shouldUseEdgeToEdgeColors: Boolean,
): ColorScheme {
    val colors = MaterialTheme.colorScheme

    return when {
        isPrivateMode ->
            colors.copy(outlineVariant = colorResource(R.color.homepage_tab_edge_to_edge_private_toolbar_outline))

        shouldUseEdgeToEdgeColors -> colors.withEdgeToEdgeToolbarColors()

        else -> colors
    }
}

/**
 * Overrides the surface and divider colors of this [ColorScheme] with the transparent ones needed by toolbars drawn on
 * top of an edge-to-edge wallpaper.
 */
@Composable
internal fun ColorScheme.withEdgeToEdgeToolbarColors(): ColorScheme =
    copy(
        surface = colorResource(R.color.homepage_tab_edge_to_edge_toolbar_background),
        outlineVariant = colorResource(R.color.homepage_tab_edge_to_edge_toolbar_outline),
    )

/**
 * Whether the homepage toolbars are drawn on top of a wallpaper and therefore need a transparent background.
 *
 * With the universal edge-to-edge treatment on, the wallpaper is drawn edge-to-edge behind the toolbars for any
 * non-default wallpaper. When off, only the dedicated edge-to-edge wallpaper is treated this way (gated by its own
 * feature flag).
 *
 * @param appStore [AppStore] used to observe the currently applied wallpaper.
 * @param settings [Settings] used to query the edge-to-edge feature flags.
 * @param isPrivateMode Whether private browsing is enabled.
 */
@Composable
internal fun hasWallpaperBackground(
    appStore: AppStore,
    settings: Settings,
    isPrivateMode: Boolean,
): Boolean {
    val currentWallpaperName = appStore.observeAsComposableState { it.wallpaperState.currentWallpaper.name }.value

    return when {
        isPrivateMode -> false
        settings.enableUniversalEdgeToEdgeWallpapers -> true
        else -> settings.enableHomepageEdgeToEdgeBackgroundFeature && currentWallpaperName == Wallpaper.EDGE_TO_EDGE
    }
}

/**
 * Returns the background color for the clipboard suggestion bar.
 *
 * When Edge2Edge background is enabled, the surrounding homepage toolbar surface is transparent, so the clipboard bar
 * needs its own color to stay legible on top of the wallpaper. In private mode, we defer to the theme-aware
 * [MaterialTheme] surface, which honors the private color scheme.
 *
 * @param shouldUseEdgeToEdgeColors Whether the edge-to-edge wallpaper colors should be used.
 * @param isPrivateMode Whether private browsing is enabled.
 * @return The [Color] to be used for the clipboard bar background.
 */
@Composable
@ReadOnlyComposable
fun edgeToEdgeClipboardBarBackground(
    shouldUseEdgeToEdgeColors: Boolean,
    isPrivateMode: Boolean,
): Color =
    if (shouldUseEdgeToEdgeColors && !isPrivateMode) {
        colorResource(R.color.fx_mobile_surface)
    } else {
        MaterialTheme.colorScheme.surface
    }
