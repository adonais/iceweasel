/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.experiments.view

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CornerSize
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.rememberNestedScrollInteropConnection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.BottomSheetHandle
import mozilla.components.compose.base.annotation.FlexibleWindowPreview
import org.mozilla.fenix.R
import org.mozilla.fenix.microsurvey.ui.MicrosurveyCompleted
import org.mozilla.fenix.microsurvey.ui.MicrosurveyContent
import org.mozilla.fenix.microsurvey.ui.MicrosurveyHeader
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.PreviewThemeProvider
import org.mozilla.fenix.theme.Theme

private const val BOTTOM_SHEET_HANDLE_WIDTH_PERCENT = 0.1f

/**
 * The microsurvey bottom sheet.
 *
 * @param question The question text.
 * @param answers The answer text options available for the given [question].
 * @param icon The icon that represents the feature for the given [question].
 * @param onPrivacyPolicyLinkClick Invoked when the privacy policy link is clicked.
 * @param onCloseButtonClicked Invoked when the close button is clicked.
 * @param onSubmitButtonClicked Invoked when the submit button is clicked.
 * @param isSubmitAlwaysEnabled Whether the submit button should remain enabled even if no option is selected.
 * @param buttonLabel The custom label text for the submission button.
 */
@Composable
fun UninstallSurveyBottomSheet(
    question: String,
    answers: List<String>,
    @DrawableRes icon: Int,
    onPrivacyPolicyLinkClick: () -> Unit,
    onCloseButtonClicked: () -> Unit,
    onSubmitButtonClicked: (String) -> Unit,
    isSubmitAlwaysEnabled: Boolean = false,
    buttonLabel: String? = null,
) {
    var selectedAnswer by remember { mutableStateOf<String?>(null) }
    var isSubmitted by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .padding(top = FirefoxTheme.layout.space.static100)
                    .nestedScroll(rememberNestedScrollInteropConnection())
                    .verticalScroll(rememberScrollState()),
            ) {
                BottomSheetHandle(
                    onRequestDismiss = {},
                    contentDescription = stringResource(R.string.microsurvey_close_handle_content_description),
                    modifier = Modifier
                        .padding(bottom = FirefoxTheme.layout.space.static25)
                        .fillMaxWidth(BOTTOM_SHEET_HANDLE_WIDTH_PERCENT)
                        .semantics { traversalIndex = -1f },
                )

                MicrosurveyHeader(title = stringResource(id = R.string.micro_survey_survey_header_2)) {
                    onCloseButtonClicked()
                }
            }
        },
        bottomBar = {
            Column(
                modifier = Modifier
                    .padding(bottom = FirefoxTheme.layout.space.static100),
            ) {
                Spacer(modifier = Modifier.height(24.dp))

                UninstallSurveyFooter(
                    buttonLabel = buttonLabel,
                    isSubmitted = isSubmitted,
                    isContentAnswerSelected = isSubmitAlwaysEnabled || selectedAnswer != null,
                    onPrivacyPolicyLinkClick = onPrivacyPolicyLinkClick,
                    onButtonClick = {
                        if (isSubmitAlwaysEnabled || selectedAnswer != null) {
                            onSubmitButtonClicked(selectedAnswer ?: "")
                            isSubmitted = true
                        }
                    },
                )
            }
        },
    ) { innerPadding ->
        Surface(
            modifier = Modifier
                .wrapContentHeight()
                .padding(innerPadding),
            shape = MaterialTheme.shapes.large.copy(
                bottomStart = CornerSize(0.dp),
                bottomEnd = CornerSize(0.dp),
            ),
        ) {
            if (isSubmitted) {
                MicrosurveyCompleted()
            } else {
                MicrosurveyContent(
                    question = question,
                    icon = icon,
                    answers = answers,
                    selectedAnswer = selectedAnswer,
                    onSelectionChange = { selectedAnswer = it },
                )
            }
        }
    }
}

@FlexibleWindowPreview
@Preview(
    name = "Large Font",
    fontScale = 2.0f,
)
@Composable
private fun UninstallSurveyBottomSheetPreview(
    @PreviewParameter(PreviewThemeProvider::class) theme: Theme,
) {
    FirefoxTheme(theme) {
        UninstallSurveyBottomSheet(
            question = stringResource(id = R.string.microsurvey_uninstall_survey_title),
            icon = R.drawable.ic_delete_black,
            onPrivacyPolicyLinkClick = {},
            onCloseButtonClicked = {},
            onSubmitButtonClicked = {},
            answers = listOf(
                stringResource(id = R.string.uninstall_survey_option_1_v2),
                stringResource(id = R.string.uninstall_survey_option_2_v2),
                stringResource(id = R.string.uninstall_survey_option_3_v2),
                stringResource(id = R.string.uninstall_survey_option_4_v2),
                stringResource(id = R.string.uninstall_survey_option_5_v2),
                stringResource(id = R.string.uninstall_survey_option_6_v2),
            ),
            isSubmitAlwaysEnabled = true,
            buttonLabel = stringResource(id = R.string.uninstall_survey_button_label),
        )
    }
}
