/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker.ui

import android.content.Context
import android.util.AttributeSet
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.preference.Preference
import androidx.preference.PreferenceViewHolder
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import org.mozilla.fenix.R
import org.mozilla.fenix.iconpicker.SettingsAppIcon
import org.mozilla.fenix.theme.FirefoxTheme

private val PreferencePadding = 16.dp
private val IconSize = 40.dp

/**
 * User preference showing the currently selected icon and enables the user to navigate to the app icon selection view.
 */
class AppIconPreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : Preference(context, attrs) {

    init {
        layoutResource = R.layout.app_icon_preference
    }

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)

        (holder.findViewById(R.id.compose_view) as ComposeView).setContent {
            FirefoxTheme {
                SelectAppIcon(
                    appIcon = SettingsAppIcon.appDefault,
                    onClick = {},
                )
            }
        }
    }
}

@Composable
private fun SelectAppIcon(
    appIcon: SettingsAppIcon,
    onClick: (SettingsAppIcon) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick(appIcon) }
            .background(color = FirefoxTheme.colors.layer1)
            .padding(PreferencePadding),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppIcon(
            appIcon = appIcon,
            iconSize = IconSize,
        )

        Spacer(modifier = Modifier.width(16.dp))

        Column {
            Text(
                text = stringResource(id = R.string.preference_select_app_icon_title),
                style = FirefoxTheme.typography.subtitle1,
                color = FirefoxTheme.colors.textPrimary,
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = stringResource(appIcon.titleId),
                style = FirefoxTheme.typography.caption,
                color = FirefoxTheme.colors.textPrimary,
            )
        }
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun AppIconOptionPreview() {
    FirefoxTheme {
        SelectAppIcon(SettingsAppIcon.appDefault) {}
    }
}
