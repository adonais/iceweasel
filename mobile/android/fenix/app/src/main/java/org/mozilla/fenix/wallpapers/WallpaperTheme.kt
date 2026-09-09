/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.wallpapers

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * The current [WallpaperState] for the composition, used by [WallpaperTheme] to resolve its default colors. Provide the
 * observed wallpaper in the root Composable (e.g. around the `Homepage` Composable) via
 * `CompositionLocalProvider(LocalWallpaperState provides wallpaperState)`.
 *
 * Defaults to [WallpaperState.default] so composables (and their `@Preview`s) that don't provide it resolve to the
 * default wallpaper's colors automatically, with no store access.
 */
val LocalWallpaperState = compositionLocalOf { WallpaperState.default }

/**
 * Design tokens for content themed against the wallpaper, accessed as `WallpaperTheme.<token>`. Each falls back to the
 * corresponding default-wallpaper color when no [WallpaperTheme] is in scope.
 */
object WallpaperTheme {

    /** Color for content (text, icons) drawn directly on the wallpaper. */
    val onWallpaper: Color
        @Composable get() = LocalWallpaperState.current.textColor

    /** Background color for cards laid over the wallpaper. */
    val cardBackgroundColor: Color
        @Composable @ReadOnlyComposable get() = LocalWallpaperState.current.cardBackgroundColor

    /** Background color for buttons drawn over the wallpaper. */
    val buttonBackgroundColor: Color
        @Composable get() = LocalWallpaperState.current.buttonBackgroundColor

    /** Content color for buttons drawn over the wallpaper. */
    val buttonTextColor: Color
        @Composable get() = LocalWallpaperState.current.buttonTextColor
}
