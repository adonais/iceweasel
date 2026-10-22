/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.menu

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import kotlinx.coroutines.CoroutineScope
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.menu.Menu
import mozilla.components.compose.menu.store.MenuStore
import mozilla.components.support.ktx.android.view.hideKeyboard
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.focus.R

private val MENU_WIDTH = 320.dp
private val MENU_ELEVATION = 8.dp
private val MENU_HORIZONTAL_MARGIN = 8.dp
private const val MENU_MAX_HEIGHT_RATIO = 0.8f

/**
 * The menu button and, while it is pressed, the menu itself in a popup anchored to the button.
 *
 * Nothing of the menu exists while it is closed: [buildMenuStore] is called when the user opens the menu, is given the
 * [CoroutineScope] to use for as long as the menu is shown and a callback for closing it, and everything it built is
 * discarded when the menu is closed again.
 */
@Composable
fun MenuButton(
    iconTint: Color = colorResource(R.color.primaryText),
    buildMenuStore: (scope: CoroutineScope, onDismiss: () -> Unit) -> MenuStore,
) {
    var isMenuShown by remember { mutableStateOf(false) }
    val view = LocalView.current
    val horizontalMargin = with(LocalDensity.current) { MENU_HORIZONTAL_MARGIN.roundToPx() }

    Box(contentAlignment = Alignment.Center) {
        IconButton(
            onClick = {
                view.hideKeyboard()
                isMenuShown = true
            },
            contentDescription = stringResource(R.string.content_description_menu),
            colors = IconButtonDefaults.iconButtonColors(contentColor = iconTint),
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_ellipsis_vertical_24),
                contentDescription = null,
            )
        }

        if (isMenuShown) {
            Popup(
                popupPositionProvider = MenuPositionProvider(horizontalMargin),
                onDismissRequest = { isMenuShown = false },
                properties = PopupProperties(focusable = true),
            ) {
                MenuPopupContent(
                    buildMenuStore = buildMenuStore,
                    onDismissRequest = { isMenuShown = false },
                )
            }
        }
    }
}

@Composable
private fun MenuPopupContent(
    buildMenuStore: (scope: CoroutineScope, onDismiss: () -> Unit) -> MenuStore,
    onDismissRequest: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val store = remember { buildMenuStore(scope, onDismissRequest) }

    MenuTheme {
        Surface(
            modifier =
                Modifier.width(MENU_WIDTH).layout { measurable, constraints ->
                    val placeable =
                        measurable.measure(
                            constraints.copy(maxHeight = (constraints.maxHeight * MENU_MAX_HEIGHT_RATIO).toInt())
                        )
                    layout(placeable.width, placeable.height) { placeable.place(0, 0) }
                },
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surfaceContainer,
            shadowElevation = MENU_ELEVATION,
        ) {
            Menu(store = store)
        }
    }
}

/**
 * Shows the menu starting from the middle of the anchor and inset from its end, flipping to end at the middle of the
 * anchor if there is not enough room below it.
 *
 * The window is only trusted to be at least as big as the anchor it contains: it is reported as the window of the popup
 * itself, which does not always follow the application's window when the device is rotated.
 */
private class MenuPositionProvider(private val horizontalMargin: Int) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val windowRight = maxOf(windowSize.width, anchorBounds.right)
        val windowBottom = maxOf(windowSize.height, anchorBounds.bottom)

        val x =
            when (layoutDirection) {
                LayoutDirection.Ltr -> anchorBounds.right - popupContentSize.width - horizontalMargin
                LayoutDirection.Rtl -> anchorBounds.left + horizontalMargin
            }

        val anchorMiddle = anchorBounds.top + anchorBounds.height / 2
        val below = anchorMiddle
        val above = anchorMiddle - popupContentSize.height
        val y = if (below + popupContentSize.height <= windowBottom || above < 0) below else above

        return IntOffset(
            x = x.coerceIn(0, (windowRight - popupContentSize.width).coerceAtLeast(0)),
            y = y.coerceIn(0, (windowBottom - popupContentSize.height).coerceAtLeast(0)),
        )
    }
}
