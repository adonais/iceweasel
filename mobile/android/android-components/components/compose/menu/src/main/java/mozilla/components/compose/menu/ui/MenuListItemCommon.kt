/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import mozilla.components.compose.base.badge.BADGE_SIZE_SMALL
import mozilla.components.compose.base.badge.BadgedIcon
import mozilla.components.compose.base.badge.StatusBadge
import mozilla.components.compose.base.modifier.debouncedClickable
import mozilla.components.compose.base.text.value
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.base.theme.information
import mozilla.components.compose.menu.R
import mozilla.components.compose.menu.data.MenuItemBadge
import mozilla.components.compose.menu.data.MenuItemSummary
import mozilla.components.compose.menu.data.MenuItemTitle
import mozilla.components.compose.menu.store.MenuEvent
import mozilla.components.compose.menu.ui.MenuItemState.DISABLED

/**
 * The badge of a menu list item.
 *
 * @param badge The [MenuItemBadge] to show, if any.
 * @param hideFromAccessibility Whether screen readers should skip the badge, for when its text is already announced in
 *   another way.
 */
@Composable
internal fun MenuListItemBadge(
    badge: MenuItemBadge?,
    hideFromAccessibility: Boolean = false,
) {
    if (badge != null) {
        Text(
            text = badge.text.value,
            color = badge.state.contentColor,
            style = AcornTheme.typography.headline8,
            overflow = TextOverflow.Ellipsis,
            maxLines = 1,
            modifier =
                Modifier.clip(shape = MaterialTheme.shapes.extraLarge)
                    .background(badge.state.badgeContainerColor)
                    .padding(
                        horizontal = AcornTheme.layout.space.static200,
                        vertical = AcornTheme.layout.space.static100,
                    )
                    .then(if (hideFromAccessibility) Modifier.clearAndSetSemantics {} else Modifier),
        )
    }
}

@Composable
internal fun MenuListItemNewIndicator(
    showNewIndicator: Boolean,
    state: MenuItemState,
) {
    if (showNewIndicator) {
        StatusBadge(
            containerColor = state.newIndicatorContainerColor,
            status = stringResource(R.string.mozac_menu_item_new_indicator_label),
        )
    }
}

@Composable
internal fun RowScope.MenuListItemText(
    title: MenuItemTitle,
    state: MenuItemState,
    summary: MenuItemSummary?,
) {
    Column(modifier = Modifier.weight(1f)) {
        Text(
            text = title.text.value,
            style = AcornTheme.typography.subtitle1.copy(hyphens = Hyphens.Auto),
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Start,
            overflow = TextOverflow.Ellipsis,
            maxLines = title.maxLines,
            softWrap = true,
            color = state.contentColor,
        )

        if (summary != null) {
            Text(
                text = summary.text.value,
                style = AcornTheme.typography.body2,
                overflow = TextOverflow.Ellipsis,
                maxLines = summary.maxLines,
                color = summary.state.secondaryContentColor,
            )
        }
    }
}

@Composable
internal fun MenuListItemIcon(
    icon: MenuItemIcon?,
    state: MenuItemState,
) {
    if (icon != null) {
        BadgedIcon(
            painter = icon.painter,
            isHighlighted = icon.isHighlighted,
            modifier = Modifier.size(AcornTheme.layout.size.static300),
            size = BADGE_SIZE_SMALL,
            contentDescription = null,
            containerColor = MaterialTheme.colorScheme.information,
            tint =
                if (icon is MenuItemIconRes) {
                    state.secondaryContentColor
                } else Color.Unspecified,
        )
    } else {
        Spacer(Modifier.size(AcornTheme.layout.size.static300))
    }
}

@Composable
internal fun Modifier.menuItemClickableBehavior(
    state: MenuItemState,
    role: Role,
    onClickEvent: MenuEvent?,
    onLongClickEvent: MenuEvent?,
    onInteraction: (MenuEvent) -> Unit,
): Modifier {
    val haptic = LocalHapticFeedback.current
    return if (onLongClickEvent != null) {
        this.combinedClickable(
            enabled = state != DISABLED,
            onClick = { onClickEvent?.let { onInteraction(it) } },
            onLongClick = {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onInteraction(onLongClickEvent)
            },
            role = role,
        )
    } else if (onClickEvent != null && state != DISABLED) {
        this.debouncedClickable(
            onClick = { onInteraction(onClickEvent) },
            role = role,
        )
    } else {
        this
    }
}
