/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CollectionItemInfo
import androidx.compose.ui.semantics.Role.Companion.Button
import androidx.compose.ui.semantics.collectionItemInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.badge.BADGE_SIZE_SMALL
import mozilla.components.compose.base.badge.BadgedIcon
import mozilla.components.compose.base.modifier.thenConditional
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.base.text.value
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.base.theme.information
import mozilla.components.compose.menu.store.MenuEvent
import mozilla.components.compose.menu.ui.MenuItemState.DEFAULT
import mozilla.components.compose.menu.ui.MenuItemState.DISABLED
import mozilla.components.ui.icons.R as iconsR

/**
 * A menu item shown as a cell in a grid.
 *
 * @param title The title of the menu item.
 * @param contentDescription The content description of the menu item.
 * @param icon An icon of the menu item.
 * @param onClickEvent [MenuEvent] to dispatch when the menu item is clicked.
 * @param onInteraction The callback to invoke when the menu item is interacted with.
 * @param index The optional index of this item in the grid.
 * @param modifier The modifier to apply to the menu item.
 * @param state The state of this menu item.
 * @param onLongClickEvent [MenuEvent] to dispatch when the menu item is long-clicked.
 * @param showContainer Whether the menu item should be shown inside a styled container.
 * @param shape The [Shape] to clip the background into.
 */
@Composable
internal fun MenuGridItem(
    title: Text,
    contentDescription: Text,
    icon: MenuItemIcon,
    onClickEvent: MenuEvent,
    onInteraction: (MenuEvent) -> Unit,
    modifier: Modifier = Modifier,
    index: Int? = null,
    state: MenuItemState = DEFAULT,
    onLongClickEvent: MenuEvent? = null,
    showContainer: Boolean = false,
    shape: Shape = RectangleShape,
) {
    val description = contentDescription.value
    val backgroundColor =
        if (showContainer) {
            MaterialTheme.colorScheme.surfaceBright
        } else {
            Color.Transparent
        }

    val containerModifier =
        modifier
            .clip(shape)
            .background(backgroundColor)
            .menuGridItemClickable(
                state = state,
                onClickEvent = onClickEvent,
                onLongClickEvent = onLongClickEvent,
                onInteraction = onInteraction,
            )
            .menuGridItemSemantics(index, description)

    Column(
        modifier =
            if (showContainer) {
                containerModifier.padding(
                    horizontal = AcornTheme.layout.space.static50,
                    vertical = AcornTheme.layout.space.static150,
                )
            } else {
                containerModifier
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
        MenuGridItemContent(title, icon, state)
    }
}

@Composable
private fun Modifier.menuGridItemClickable(
    state: MenuItemState,
    onClickEvent: MenuEvent,
    onLongClickEvent: MenuEvent?,
    onInteraction: (MenuEvent) -> Unit,
): Modifier {
    val haptic = LocalHapticFeedback.current
    return this.clickable(
            enabled = state != DISABLED && onLongClickEvent == null,
            onClick = { onInteraction(onClickEvent) },
            role = Button,
        )
        .thenConditional(
            Modifier.combinedClickable(
                enabled = state != DISABLED,
                onClick = { onInteraction(onClickEvent) },
                onLongClick =
                    onLongClickEvent?.let {
                        {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onInteraction(it)
                        }
                    },
                role = Button,
            )
        ) {
            onLongClickEvent != null
        }
}

@Composable
private fun Modifier.menuGridItemSemantics(
    index: Int?,
    description: String,
): Modifier {
    return this.semantics(mergeDescendants = true) {
        index?.let {
            this.collectionItemInfo =
                CollectionItemInfo(
                    rowIndex = 0,
                    rowSpan = 1,
                    columnIndex = it,
                    columnSpan = 1,
                )
        }
        this.contentDescription = description
        this.role = Button
    }
}

@Composable
private fun MenuGridItemContent(
    title: Text,
    icon: MenuItemIcon,
    state: MenuItemState,
) {
    BadgedIcon(
        painter = icon.painter,
        isHighlighted = icon.isHighlighted,
        modifier = Modifier.size(AcornTheme.layout.size.static300),
        size = BADGE_SIZE_SMALL,
        contentDescription = null,
        containerColor = MaterialTheme.colorScheme.information,
        tint = state.secondaryContentColor,
    )

    Spacer(modifier = Modifier.height(AcornTheme.layout.space.static50))

    Text(
        text = title.value,
        style = AcornTheme.typography.caption.copy(hyphens = Hyphens.Auto),
        color = state.contentColor,
        maxLines = 2,
        softWrap = true,
        textAlign = TextAlign.Center,
    )
}

@PreviewLightDark
@Composable
private fun MenuGridItemPreview() {
    AcornTheme {
        Surface {
            MenuGridItem(
                title = Text.String("Title"),
                contentDescription = Text.String(""),
                onClickEvent = object : MenuEvent {},
                onInteraction = {},
                index = 0,
                modifier = Modifier.fillMaxWidth(),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_globe_24, isHighlighted = true),
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun MenuGridItemWithContainerPreview() {
    AcornTheme {
        Surface {
            MenuGridItem(
                title = Text.String("Title"),
                contentDescription = Text.String(""),
                onClickEvent = object : MenuEvent {},
                onInteraction = {},
                index = 0,
                modifier = Modifier.fillMaxWidth(),
                icon = MenuItemIconRes(iconsR.drawable.mozac_ic_globe_24),
                showContainer = true,
                shape = MaterialTheme.shapes.extraLarge,
            )
        }
    }
}
