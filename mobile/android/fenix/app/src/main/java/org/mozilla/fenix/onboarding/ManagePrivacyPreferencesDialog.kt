/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.TextButton
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.LinkText
import org.mozilla.fenix.compose.LinkTextState
import org.mozilla.fenix.compose.SwitchWithLabel
import org.mozilla.fenix.onboarding.store.PrivacyPreferencesAction
import org.mozilla.fenix.onboarding.store.PrivacyPreferencesStore
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme

/**
 * Dialog to manage privacy preferences during onboarding.
 */
@Composable
fun ManagePrivacyPreferencesDialog(
    store: PrivacyPreferencesStore,
    onDismissRequest: () -> Unit,
    onCrashReportingLinkClick: () -> Unit,
    onUsageDataLinkClick: () -> Unit,
) {
    val state by store.observeAsState(initialValue = store.state) { state -> state }

    Dialog(
        onDismissRequest = { onDismissRequest() },
        properties = DialogProperties(dismissOnClickOutside = false),
    ) {
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
            shape = RoundedCornerShape(8.dp),
        ) {
            Column(Modifier.padding(16.dp)) {
                Title()

                Spacer(modifier = Modifier.height(16.dp))

                UsageDataPreference(store, state.usageDataEnabled, onUsageDataLinkClick)

                Spacer(modifier = Modifier.height(24.dp))

                CrashReportingPreference(
                    store,
                    state.crashReportingEnabled,
                    onCrashReportingLinkClick,
                )

                Spacer(modifier = Modifier.height(16.dp))

                PositiveButton(onDismissRequest)
            }
        }
    }
}

@Composable
private fun Title() {
    Text(
        text = stringResource(R.string.onboarding_preferences_dialog_title),
        style = FirefoxTheme.typography.headline7,
        maxLines = 1,
    )
}

@Composable
private fun CrashReportingPreference(
    store: PrivacyPreferencesStore,
    crashReportingEnabled: Boolean,
    onLinkClick: () -> Unit,
) {
    SwitchWithLabel(
        label = stringResource(R.string.onboarding_preferences_dialog_crash_reporting_title),
        checked = crashReportingEnabled,
        onCheckedChange = {
            store.dispatch(
                PrivacyPreferencesAction.CrashReportingPreferenceUpdatedTo(it),
            )
        },
        modifier = Modifier.wrapContentWidth(),
        labelStyle = FirefoxTheme.typography.body2,
    )

    Spacer(modifier = Modifier.height(8.dp))

    Text(
        text = stringResource(R.string.onboarding_preferences_dialog_crash_reporting_description),
        style = FirefoxTheme.typography.caption,
    )

    Spacer(modifier = Modifier.height(16.dp))

    LinkText(
        text = stringResource(R.string.onboarding_preferences_dialog_crash_reporting_learn_more_2),
        linkTextStates = listOf(
            LinkTextState(
                text = stringResource(id = R.string.onboarding_preferences_dialog_crash_reporting_learn_more_2),
                url = "",
                onClick = { onLinkClick() },
            ),
        ),
        style = FirefoxTheme.typography.caption,
    )
}

@Composable
private fun UsageDataPreference(
    store: PrivacyPreferencesStore,
    usageDataEnabled: Boolean,
    onLinkClick: () -> Unit,
) {
    SwitchWithLabel(
        label = stringResource(R.string.onboarding_preferences_dialog_usage_data_title),
        checked = usageDataEnabled,
        onCheckedChange = {
            store.dispatch(
                PrivacyPreferencesAction.UsageDataPreferenceUpdatedTo(it),
            )
        },
        modifier = Modifier.wrapContentWidth(),
        labelStyle = FirefoxTheme.typography.body2,
    )

    Spacer(modifier = Modifier.height(8.dp))

    Text(
        text = stringResource(R.string.onboarding_preferences_dialog_usage_data_description_2),
        style = FirefoxTheme.typography.caption,
    )

    Spacer(modifier = Modifier.height(16.dp))

    LinkText(
        text = stringResource(R.string.onboarding_preferences_dialog_usage_data_learn_more_2),
        linkTextStates = listOf(
            LinkTextState(
                text = stringResource(id = R.string.onboarding_preferences_dialog_usage_data_learn_more_2),
                url = "",
                onClick = { onLinkClick() },
            ),
        ),
        style = FirefoxTheme.typography.caption,
    )
}

@Composable
private fun PositiveButton(onDismissRequest: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .wrapContentHeight(),
        horizontalArrangement = Arrangement.End,
    ) {
        TextButton(
            text = stringResource(R.string.onboarding_preferences_dialog_positive_button),
            onClick = { onDismissRequest() },
        )
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun ManagePrivacyPreferencesDialogPreview() {
    FirefoxTheme {
        ManagePrivacyPreferencesDialog(PrivacyPreferencesStore(), {}, {}, {})
    }
}

@Preview
@Composable
private fun ManagePrivacyPreferencesDialogPrivatePreview() {
    FirefoxTheme(theme = Theme.Private) {
        ManagePrivacyPreferencesDialog(PrivacyPreferencesStore(), {}, {}, {})
    }
}
