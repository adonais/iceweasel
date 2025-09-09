/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.Divider
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.TextButton
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.button.RadioButton
import org.mozilla.fenix.iconpicker.AppIcon
import org.mozilla.fenix.iconpicker.DefaultAppIconRepository
import org.mozilla.fenix.iconpicker.IconBackground
import org.mozilla.fenix.iconpicker.IconGroupTitle
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.Settings

private val ListItemHeight = 56.dp
private val AppIconSize = 40.dp
private val AppIconPadding = 6.dp
private val AppIconBorderWidth = 1.dp
private val AppIconCornerRadius = 4.dp
private val GroupHeaderHeight = 36.dp
private val GroupHeaderPaddingStart = 72.dp
private val GroupSpacerHeight = 8.dp

/**
 * A composable that displays a list of app icon options.
 *
 * @param currentAppIcon The currently selected app icon alias.
 * @param groupedIconOptions Icons are displayed in sections under their respective titles.
 * @param onAppIconSelected A callback invoked when the user has confirmed an alternative icon to be
 * applied (they get informed about the required restart providing an opportunity to back out).
 */
@Composable
fun AppIconSelection(
    currentAppIcon: AppIcon,
    groupedIconOptions: Map<IconGroupTitle, List<AppIcon>>,
    onAppIconSelected: (AppIcon) -> Unit,
) {
    var currentAppIcon by remember { mutableStateOf(currentAppIcon) }
    var selectedAppIcon by remember { mutableStateOf<AppIcon?>(null) }

    LazyColumn(
        modifier = Modifier.background(color = FirefoxTheme.colors.layer1),
    ) {
        groupedIconOptions.forEach { (header, icons) ->
            item(contentType = { header::class }) {
                AppIconGroupHeader(header)
            }

            items(
                items = icons,
                contentType = { item -> item::class },
            ) { icon ->
                val iconSelected = icon == currentAppIcon

                AppIconOption(
                    appIcon = icon,
                    selected = iconSelected,
                    onClick = {
                        if (!iconSelected) {
                            selectedAppIcon = icon
                        }
                    },
                )
            }

            item {
                Spacer(modifier = Modifier.height(GroupSpacerHeight))

                Divider(color = FirefoxTheme.colors.borderPrimary)
            }
        }
    }

    selectedAppIcon?.let {
        RestartWarningDialog(
            onConfirm = {
                currentAppIcon = it
                onAppIconSelected(it)
                selectedAppIcon = null
            },
            onDismiss = {
                selectedAppIcon = null
            },
        )
    }
}

@Composable
private fun AppIconGroupHeader(title: IconGroupTitle) {
    Text(
        text = stringResource(id = title.titleId),
        modifier = Modifier
            .height(GroupHeaderHeight)
            .padding(start = GroupHeaderPaddingStart)
            .wrapContentHeight(Alignment.CenterVertically)
            .semantics { heading() },
        style = FirefoxTheme.typography.headline8,
        color = FirefoxTheme.colors.textAccent,
    )
}

@Composable
private fun AppIconOption(
    appIcon: AppIcon,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(ListItemHeight)
            .clickable { onClick() },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(
            selected = selected,
            onClick = {
                onClick()
            },
        )

        AppIcon(appIcon)

        Spacer(modifier = Modifier.width(16.dp))

        Text(
            text = stringResource(appIcon.titleId),
            modifier = Modifier.weight(1f),
            style = FirefoxTheme.typography.subtitle1,
            color = FirefoxTheme.colors.textPrimary,
        )
    }
}

/**
 * Renders a preview of the app’s launcher icon similarly to how it will drawn by the users's launcher.
 */
@Composable
fun AppIcon(
    appIcon: AppIcon,
    iconSize: Dp = AppIconSize,
    borderWidth: Dp = AppIconBorderWidth,
    cornerRadius: Dp = AppIconCornerRadius,
) {
    val roundedShape = RoundedCornerShape(cornerRadius)
    // Spacing the background to make up for inconsistency between box and background clippings.
    // If unchanged, the background will spill over the border; if adjusted by the border width,
    // the background won't exactly reach the border. Pixel hunting.
    val backgroundPadding = borderWidth / 2

    Box(
        modifier = Modifier
            .size(iconSize)
            .border(
                width = borderWidth,
                color = FirefoxTheme.colors.borderPrimary,
                shape = roundedShape,
            )
            .padding(backgroundPadding)
            .clip(roundedShape),
    ) {
        when (val background = appIcon.iconBackground) {
            is IconBackground.Color -> {
                Box(
                    modifier = Modifier
                        .size(iconSize)
                        .background(colorResource(id = background.colorResId)),
                )
            }

            is IconBackground.Drawable -> {
                Image(
                    painter = painterResource(id = background.drawableResId),
                    contentDescription = null,
                    modifier = Modifier.size(iconSize),
                )
            }
        }

        Image(
            painter = painterResource(id = appIcon.iconForegroundId),
            contentDescription = null,
            modifier = Modifier
                .size(iconSize)
                .padding(AppIconPadding),
        )
    }
}

@Composable
private fun RestartWarningDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        title = {
            Text(
                text = stringResource(R.string.restart_warning_dialog_title),
                color = FirefoxTheme.colors.textPrimary,
                style = FirefoxTheme.typography.headline7,
            )
                },
        text = {
            Text(
                text = stringResource(R.string.restart_warning_dialog_body),
                color = FirefoxTheme.colors.textPrimary,
                style = FirefoxTheme.typography.body2,
            )
        },
        onDismissRequest = { onDismiss() },
        confirmButton = {
            TextButton(
                text = stringResource(id = R.string.restart_warning_dialog_button_positive),
                upperCaseText = false,
                onClick = { onConfirm() },
            )
        },
        dismissButton = {
            TextButton(
                text = stringResource(id = R.string.restart_warning_dialog_button_negative),
                upperCaseText = false,
                onClick = { onDismiss() },
            )
        },
    )
}

@FlexibleWindowLightDarkPreview
@Composable
private fun AppIconSelectionPreview() {
    FirefoxTheme {
        AppIconSelection(
            currentAppIcon = AppIcon.AppDefault,
            groupedIconOptions = DefaultAppIconRepository(Settings(LocalContext.current)).groupedAppIcons,
            onAppIconSelected = {},
        )
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun AppIconOptionPreview() {
    FirefoxTheme {
        AppIconOption(AppIcon.AppDefault, false) {}
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun RestartWarningDialogPreview() {
    FirefoxTheme {
        RestartWarningDialog(
            onConfirm = {},
            onDismiss = {},
        )
    }
}
