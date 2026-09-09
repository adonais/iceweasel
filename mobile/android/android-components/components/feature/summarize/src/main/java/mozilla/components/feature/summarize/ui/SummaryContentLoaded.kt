/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.summarize.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.concept.llm.LlmProvider
import mozilla.components.feature.summarize.R
import mozilla.components.feature.summarize.SummaryFeedback
import mozilla.components.ui.icons.R as iconsR
import mozilla.components.ui.richtext.RichText
import mozilla.components.ui.richtext.ir.RichDocument

private val FeedbackButtonSize = 24.dp

/** Content being shown after the page summary has been generated */
@Composable
internal fun SummaryContentLoaded(
    document: RichDocument,
    info: LlmProvider.Info,
    onSettingsClicked: () -> Unit = {},
    feedback: SummaryFeedback = SummaryFeedback.NOT_READY,
    onFeedbackClicked: (SummaryFeedback) -> Unit = {},
) {
    Column(modifier = Modifier.padding(horizontal = AcornTheme.layout.space.static200).fillMaxWidth()) {
        SummarizationHeader(info, onSettingsClicked = onSettingsClicked)
        Spacer(Modifier.height(AcornTheme.layout.space.static200))
        SummarizedContent(
            document = document,
            modifier = Modifier.weight(1f, fill = true).fillMaxWidth().verticalScroll(rememberScrollState()),
        )
        Spacer(Modifier.height(AcornTheme.layout.space.static200))
        SummaryFooter(feedback = feedback, onFeedbackClicked = onFeedbackClicked)
        Spacer(Modifier.height(AcornTheme.layout.space.static200))
    }
}

@Composable
internal fun SummarizationHeader(
    info: LlmProvider.Info,
    modifier: Modifier = Modifier,
    onSettingsClicked: () -> Unit,
) {
    Row(
        modifier = modifier.height(32.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ModelInformation(info)

        Spacer(modifier = Modifier.weight(1f))

        IconButton(
            onClick = onSettingsClicked,
            contentDescription = stringResource(id = R.string.mozac_summarize_settings_button_content_description),
        ) {
            Icon(
                painter = painterResource(id = iconsR.drawable.mozac_ic_settings_24),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ModelInformation(
    info: LlmProvider.Info,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxHeight()
                .background(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = MaterialTheme.shapes.small,
                ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Spacer(Modifier.width(8.dp))

        info.iconRes?.let {
            Image(
                painter = painterResource(it),
                contentDescription = null,
                modifier = Modifier.size(16.dp).offset(y = (-1).dp),
            )

            Spacer(Modifier.width(8.dp))
        }

        Text(
            text =
                stringResource(
                    id = R.string.mozac_feature_summarize_summary_model,
                    stringResource(info.nameRes),
                ),
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
        )

        Spacer(Modifier.width(8.dp))
    }
}

@Composable
private fun SummarizedContent(document: RichDocument, modifier: Modifier = Modifier) {
    SelectionContainer(modifier = modifier) {
        RichText(document = document)
    }
}

@Composable
private fun SummaryFooter(
    feedback: SummaryFeedback,
    onFeedbackClicked: (SummaryFeedback) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth().heightIn(min = FeedbackButtonSize),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DisclaimerMessage(modifier = Modifier.weight(1f))

        if (feedback != SummaryFeedback.NOT_READY) {
            SummaryFeedbackControl(feedback = feedback, onFeedbackClicked = onFeedbackClicked)
        }
    }
}

@Composable
private fun DisclaimerMessage(modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.mozac_feature_summarize_disclaimer_message),
        fontSize = 14.sp,
        modifier = modifier,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun SummaryFeedbackControl(
    feedback: SummaryFeedback,
    onFeedbackClicked: (SummaryFeedback) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(FeedbackButtonSize),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FeedbackButton(
            selected = feedback == SummaryFeedback.GOOD,
            selectedIcon = iconsR.drawable.mozac_ic_thumbs_up_fill_24,
            unselectedIcon = iconsR.drawable.mozac_ic_thumbs_up_24,
            contentDescription = stringResource(R.string.mozac_feature_summarize_feedback_good_content_description),
            onClickLabel = stringResource(R.string.mozac_feature_summarize_feedback_good_click_label),
            onClick = { onFeedbackClicked(SummaryFeedback.GOOD) },
        )

        FeedbackButton(
            selected = feedback == SummaryFeedback.BAD,
            selectedIcon = iconsR.drawable.mozac_ic_thumbs_down_fill_24,
            unselectedIcon = iconsR.drawable.mozac_ic_thumbs_down_24,
            contentDescription = stringResource(R.string.mozac_feature_summarize_feedback_bad_content_description),
            onClickLabel = stringResource(R.string.mozac_feature_summarize_feedback_bad_click_label),
            onClick = { onFeedbackClicked(SummaryFeedback.BAD) },
        )
    }
}

@Composable
private fun FeedbackButton(
    selected: Boolean,
    @DrawableRes selectedIcon: Int,
    @DrawableRes unselectedIcon: Int,
    contentDescription: String,
    onClickLabel: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // The two ratings are mutually exclusive, so they are exposed as a radio group: Compose withholds the click action
    // from an already selected radio button, which stops screen readers from offering an activation that would do
    // nothing. Only the selected button carries a state, so activating it announces the confirmation, while the other
    // one falls back to the platform's "not selected" rather than claiming the summary is unrated.
    val state = stringResource(R.string.mozac_feature_summarize_feedback_state_submitted).takeIf { selected }

    Box(
        modifier = modifier.size(FeedbackButtonSize),
        contentAlignment = Alignment.Center,
    ) {
        IconButton(
            onClick = onClick,
            contentDescription = contentDescription,
            modifier =
                Modifier.requiredSize(48.dp).semantics {
                    this.role = Role.RadioButton
                    this.selected = selected
                    state?.let { this.stateDescription = it }
                },
            onClickLabel = onClickLabel,
        ) {
            Icon(
                painter = painterResource(if (selected) selectedIcon else unselectedIcon),
                contentDescription = null,
                tint =
                    if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
            )
        }
    }
}
