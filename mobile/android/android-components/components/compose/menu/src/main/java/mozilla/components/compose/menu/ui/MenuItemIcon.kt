/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.ui

import android.graphics.drawable.Drawable
import androidx.annotation.DrawableRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.res.painterResource
import com.google.accompanist.drawablepainter.rememberDrawablePainter

/**
 * Menu item icon.
 *
 * @property isHighlighted Whether the icon is highlighted (has a blue dot indicator).
 */
sealed class MenuItemIcon(open val isHighlighted: Boolean = false)

/**
 * Menu item icon in the form of a [DrawableRes].
 *
 * @property iconRes Resource ID of the drawable resource to show as icon.
 * @property isHighlighted Whether the icon is highlighted (has a blue dot indicator).
 */
data class MenuItemIconRes(
    @DrawableRes val iconRes: Int,
    override val isHighlighted: Boolean = false,
) : MenuItemIcon(isHighlighted)

/**
 * Menu item icon in the form of a [Drawable].
 *
 * @property icon Drawable to show as icon.
 * @property isHighlighted Whether the icon is highlighted (has a blue dot indicator).
 */
data class MenuItemIconDrawable(
    val icon: Drawable,
    override val isHighlighted: Boolean = false,
) : MenuItemIcon(isHighlighted)

/** Get a [Painter] to draw the icon. */
internal val MenuItemIcon.painter
    @Composable
    get() =
        when (this) {
            is MenuItemIconRes -> painterResource(iconRes)
            is MenuItemIconDrawable -> rememberDrawablePainter(icon)
        }
