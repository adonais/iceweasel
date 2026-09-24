/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.ui

import androidx.compose.foundation.background
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import mozilla.components.compose.base.badge.BADGE_SIZE_SMALL
import mozilla.components.compose.base.badge.BadgedIcon
import mozilla.components.compose.base.badge.StatusBadge
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.base.text.value
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.base.theme.information
import mozilla.components.compose.menu.R
import mozilla.components.compose.menu.data.MenuItemBadge
import mozilla.components.compose.menu.data.MenuItemSummary

@Composable
internal fun MenuListItemBadge(
    badge: MenuItemBadge?,
    state: MenuItemState,
) {
    if (badge != null) {
        Text(
            text = badge.text.value,
            color = MaterialTheme.colorScheme.onSurface,
            style = AcornTheme.typography.headline8,
            overflow = TextOverflow.Ellipsis,
            maxLines = 1,
            modifier =
                Modifier.clip(shape = MaterialTheme.shapes.extraLarge)
                    .background(state.badgeContainerColor)
                    .padding(
                        horizontal = AcornTheme.layout.space.static200,
                        vertical = AcornTheme.layout.space.static100,
                    ),
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
    title: Text,
    state: MenuItemState,
    summary: MenuItemSummary?,
) {
    Column(modifier = Modifier.weight(1f)) {
        Text(
            text = title.value,
            style = AcornTheme.typography.subtitle1.copy(hyphens = Hyphens.Auto),
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Start,
            maxLines = 2,
            softWrap = true,
            color = state.contentColor,
        )

        if (summary != null) {
            Text(
                text = summary.text.value,
                style = AcornTheme.typography.caption,
                overflow = TextOverflow.Ellipsis,
                maxLines = 1,
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
            tint = state.secondaryContentColor,
        )
    } else {
        Spacer(Modifier.size(AcornTheme.layout.size.static300))
    }
}
