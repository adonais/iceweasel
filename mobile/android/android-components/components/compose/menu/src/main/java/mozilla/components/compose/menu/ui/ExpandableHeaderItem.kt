/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Alignment.Companion.CenterVertically
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.dimensionResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.Role.Companion.Button
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.R as composeBaseR
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.base.text.value
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.menu.R
import mozilla.components.compose.menu.data.MenuItemBadge
import mozilla.components.compose.menu.data.MenuItemSummary
import mozilla.components.compose.menu.data.StandardMenuItem
import mozilla.components.compose.menu.store.MenuEvent
import mozilla.components.compose.menu.ui.MenuItemState.DEFAULT
import mozilla.components.ui.icons.R as iconsR

private const val ANIMATION_DURATION_MS = 75

/**
 * A menu item that can be expanded to show others or collapsed to hide them.
 *
 * @param title The title of the menu item.
 * @param contentDescription The content description of the menu item.
 * @param subMenuItems List of [StandardMenuItem] to show when this item is expanded.
 * @param modifier The modifier to apply to the menu item.
 * @param hideOnExpand Whether to automatically hide the menu item when it is expanded so that only its [subMenuItems]
 *   will remain displayed. This also means that once expanded the list of [subMenuItems] cannot be collapsed again.
 * @param onClickEvent [MenuEvent] to dispatch when the menu item is clicked.
 * @param onClick The callback to invoke when the menu item is clicked.
 * @param role The [Role] of the menu item.
 * @param summary An optional summary of the menu item.
 * @param icon An optional icon of the menu item.
 * @param showNewIndicator Whether to show a new indicator.
 * @param badge An optional badge to show.
 * @param actionButtonText An optional text to show in the expanded button indicator.
 * @param state The state of this menu item.
 */
@Composable
fun ExpandableHeaderItem(
    title: Text,
    contentDescription: Text,
    subMenuItems: List<StandardMenuItem>,
    modifier: Modifier = Modifier,
    hideOnExpand: Boolean = false,
    onClickEvent: MenuEvent? = null,
    onClick: (MenuEvent) -> Unit = {},
    role: Role = Button,
    summary: MenuItemSummary? = null,
    icon: MenuItemIcon? = null,
    showNewIndicator: Boolean = false,
    badge: MenuItemBadge? = null,
    actionButtonText: Text? = null,
    state: MenuItemState = DEFAULT,
) {
    var isExpanded by remember { mutableStateOf(false) }
    val contentDescriptionValue = contentDescription.value
    val expandedDescription = stringResource(composeBaseR.string.mozac_compose_base_a11y_state_label_expanded)
    val collapsedDescription = stringResource(composeBaseR.string.mozac_compose_base_a11y_state_label_collapsed)
    val statefulContentDescription =
        remember(isExpanded) {
            "$contentDescriptionValue. ${if (isExpanded) expandedDescription else collapsedDescription}"
        }

    Column(modifier = modifier) {
        if (!hideOnExpand || !isExpanded) {
            Row(
                modifier =
                    Modifier.background(MaterialTheme.colorScheme.surfaceBright)
                        .minimumInteractiveComponentSize()
                        .height(IntrinsicSize.Min)
                        .padding(
                            horizontal = AcornTheme.layout.space.static200,
                            vertical = AcornTheme.layout.space.static100,
                        )
                        .semantics(mergeDescendants = true) {
                            this.contentDescription = statefulContentDescription
                            this.role = role
                        }
                        .clickable(
                            enabled = state != MenuItemState.DISABLED,
                            onClickLabel =
                                if (isExpanded) {
                                    stringResource(composeBaseR.string.mozac_compose_base_a11y_action_label_collapse)
                                } else {
                                    stringResource(composeBaseR.string.mozac_compose_base_a11y_action_label_expand)
                                },
                        ) {
                            isExpanded = !isExpanded
                            onClickEvent?.let { onClick(it) }
                        },
                verticalAlignment = CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(AcornTheme.layout.space.static200),
            ) {
                MenuListItemIcon(icon, state)

                MenuListItemText(title, state, summary)

                MenuListItemNewIndicator(showNewIndicator, state)

                MenuListItemBadge(badge, state)

                ChevronBadge(actionButtonText?.value, isExpanded)
            }
        }
    }

    MenuItemAnimation(isExpanded) {
        subMenuItems.forEach {
            MenuListItem(
                title = it.title,
                contentDescription = it.contentDescription,
                modifier = Modifier,
                role = it.role,
                summary = it.summary,
                icon = it.icon,
                showNewIndicator = it.showNewIndicator,
                badge = it.badge,
                actionButton = it.actionButton,
                state = it.state,
                onClickEvent = it.onClickEvent,
                onClick = onClick,
            )
        }
    }
}

@Composable
private fun MenuItemAnimation(
    isExpanded: Boolean,
    content: @Composable ColumnScope.() -> Unit,
) {
    AnimatedVisibility(
        visible = isExpanded,
        enter =
            expandVertically(
                expandFrom = Alignment.Top,
                animationSpec =
                    tween(
                        durationMillis = ANIMATION_DURATION_MS,
                        easing = LinearEasing,
                    ),
            ) +
                fadeIn(
                    animationSpec =
                        tween(
                            durationMillis = ANIMATION_DURATION_MS,
                            easing = LinearEasing,
                        )
                ),
        exit =
            shrinkVertically(
                shrinkTowards = Alignment.Top,
                animationSpec =
                    tween(
                        durationMillis = ANIMATION_DURATION_MS,
                        easing = LinearEasing,
                    ),
            ) +
                fadeOut(
                    animationSpec =
                        tween(
                            durationMillis = ANIMATION_DURATION_MS,
                            easing = LinearEasing,
                        )
                ),
    ) {
        Column {
            content()
        }
    }
}

@Composable
private fun ChevronBadge(
    text: String?,
    isExpanded: Boolean,
) {
    val extraSmallPadding = dimensionResource(R.dimen.mozac_menu_extra_small_padding)
    Row(
        modifier =
            Modifier.background(
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                    shape = MaterialTheme.shapes.large,
                )
                .padding(
                    start = if (text != null) AcornTheme.layout.size.static100 else extraSmallPadding,
                    top = extraSmallPadding,
                    bottom = extraSmallPadding,
                    end = extraSmallPadding,
                ),
        horizontalArrangement = Arrangement.spacedBy(AcornTheme.layout.size.static100),
        verticalAlignment = CenterVertically,
    ) {
        if (text != null) {
            Text(
                text = text,
                color = MaterialTheme.colorScheme.onSurface,
                overflow = TextOverflow.Ellipsis,
                style = AcornTheme.typography.caption,
                maxLines = 1,
            )
        }

        Icon(
            painter =
                if (isExpanded) {
                    painterResource(id = iconsR.drawable.mozac_ic_chevron_up_20)
                } else {
                    painterResource(id = iconsR.drawable.mozac_ic_chevron_down_20)
                },
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@PreviewLightDark
@Composable
private fun ExpandableHeaderItemPreview() = AcornTheme {
    Surface {
        ExpandableHeaderItem(
            title = Text.String("Title"),
            contentDescription = Text.String(""),
            subMenuItems = emptyList(),
            summary = MenuItemSummary(Text.String("Summary")),
            icon = MenuItemIconRes(iconsR.drawable.mozac_ic_extension_24),
            actionButtonText = Text.String("2"),
        )
    }
}
