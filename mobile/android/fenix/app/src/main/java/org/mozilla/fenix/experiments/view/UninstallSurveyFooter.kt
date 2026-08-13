/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.experiments.view

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import mozilla.components.compose.base.LinkText
import mozilla.components.compose.base.LinkTextState
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.FilledButton
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * The footer UI used for microsurvey.
 *
 * @param isSubmitted Whether the user has "Submitted" the survey or not.
 * @param isContentAnswerSelected Whether the user clicked on one of the answers or not.
 * @param onPrivacyPolicyLinkClick Invoked when the privacy policy link is clicked.
 * @param onButtonClick Invoked when the "Submit"/"Close" button is clicked.
 * @param buttonLabel The custom label text for the submission button.
 */
@Composable
fun UninstallSurveyFooter(
    isSubmitted: Boolean,
    isContentAnswerSelected: Boolean,
    onPrivacyPolicyLinkClick: () -> Unit,
    onButtonClick: () -> Unit,
    buttonLabel: String? = null,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth().padding(horizontal = FirefoxTheme.layout.space.static200),
    ) {
        if (!isSubmitted) {
            FilledButton(
                text = buttonLabel ?: stringResource(id = R.string.micro_survey_submit_button_label),
                modifier = Modifier.fillMaxWidth(),
                enabled = isContentAnswerSelected,
                onClick = { onButtonClick() },
            )
        }

        Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static150))

        LinkText(
            text = stringResource(id = R.string.micro_survey_privacy_notice_2),
            linkTextStates = listOf(
                LinkTextState(
                    text = stringResource(id = R.string.micro_survey_privacy_notice_2),
                    url = "",
                    onClick = { onPrivacyPolicyLinkClick() },
                ),
            ),
            style = FirefoxTheme.typography.caption,
            linkTextDecoration = TextDecoration.Underline,
        )
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun UninstallSurveyFooterPreview() {
    FirefoxTheme {
        Surface {
            Column(
                modifier = Modifier.padding(FirefoxTheme.layout.space.static200),
                verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static200),
            ) {
                UninstallSurveyFooter(
                    isSubmitted = false,
                    isContentAnswerSelected = false,
                    onPrivacyPolicyLinkClick = {},
                    onButtonClick = {},
                )

                UninstallSurveyFooter(
                    isSubmitted = false,
                    isContentAnswerSelected = true,
                    onPrivacyPolicyLinkClick = {},
                    onButtonClick = {},
                )

                UninstallSurveyFooter(
                    isSubmitted = true,
                    isContentAnswerSelected = true,
                    onPrivacyPolicyLinkClick = {},
                    onButtonClick = {},
                )
            }
        }
    }
}
