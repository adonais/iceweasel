/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding.redesign.view

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.FilledButton
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.LinkText
import org.mozilla.fenix.compose.LinkTextState
import org.mozilla.fenix.onboarding.view.Action
import org.mozilla.fenix.onboarding.view.OnboardingPageState
import org.mozilla.fenix.onboarding.view.OnboardingTermsOfService
import org.mozilla.fenix.onboarding.view.OnboardingTermsOfServiceEventHandler
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * A Composable for displaying the terms of service onboarding page content.
 *
 * @param pageState The page content that's displayed.
 * @param eventHandler The event handler for all user interactions of this page.
 */
@Composable
fun TermsOfServiceOnboardingPageRedesign(
    pageState: OnboardingPageState,
    eventHandler: OnboardingTermsOfServiceEventHandler,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.weight(TITLE_TOP_SPACER_WEIGHT))

            Column(
                modifier = Modifier
                    .weight(CONTENT_WEIGHT)
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Header(pageState)

                Spacer(Modifier.weight(1f))

                pageState.termsOfService?.let { BodyText(it, eventHandler) }

                Spacer(Modifier.height(26.dp))
            }

            FilledButton(
                text = pageState.primaryButton.text,
                modifier = Modifier
                    .width(width = FirefoxTheme.layout.size.maxWidth.small)
                    .semantics {
                        testTag = pageState.title + "onboarding_card_redesign.positive_button"
                    },
                onClick = pageState.primaryButton.onClick,
            )
        }
    }

    LaunchedEffect(pageState) {
        pageState.onRecordImpressionEvent()
    }
}

@Composable
private fun Header(pageState: OnboardingPageState) {
    Image(
        painter = painterResource(id = pageState.imageRes),
        contentDescription = null, // Decorative image only.
        modifier = Modifier
            .height(IconSize.heightDp)
            .width(IconSize.widthDp),
    )

    Spacer(Modifier.height(20.dp))

    Text(
        text = pageState.title,
        textAlign = TextAlign.Center,
        style = MaterialTheme.typography.headlineMedium,
    )

    Spacer(Modifier.height(10.dp))

    pageState.termsOfService?.let { Subheaders(it) }
}

@Composable
private fun Subheaders(termsOfService: OnboardingTermsOfService) {
    with(termsOfService) {
        Spacer(Modifier.height(10.dp))

        Column(
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            subheaderOneText?.let { SubHeaderText(it) }
            subheaderTwoText?.let { SubHeaderText(it) }
            subheaderThreeText?.let { SubHeaderText(it) }
        }
    }
}

@Composable
private fun SubHeaderText(text: String) {
    Text(
        text = text,
        style = FirefoxTheme.typography.body2.copy(
            color = MaterialTheme.colorScheme.secondary,
            textAlign = TextAlign.Center,
        ),
    )
}

@Composable
private fun BodyText(
    termsOfService: OnboardingTermsOfService,
    eventHandler: OnboardingTermsOfServiceEventHandler,
) {
    with(termsOfService) {
        Column(modifier = Modifier.padding(horizontal = 8.dp)) {
            val bodyOneLinkState = LinkTextState(
                text = lineOneLinkText,
                url = lineOneLinkUrl,
                onClick = eventHandler::onTermsOfServiceLinkClicked,
            )
            BodyLinkText(
                lineOneText.updateFirstPlaceholder(lineOneLinkText),
                bodyOneLinkState,
            )

            val bodyTwoLinkState = LinkTextState(
                text = lineTwoLinkText,
                url = lineTwoLinkUrl,
                onClick = eventHandler::onPrivacyNoticeLinkClicked,
            )
            BodyLinkText(
                lineTwoText.updateFirstPlaceholder(lineTwoLinkText),
                bodyTwoLinkState,
            )

            val bodyThreeLinkState = LinkTextState(
                text = lineThreeLinkText,
                url = "", // No URL
                onClick = { _ -> eventHandler.onManagePrivacyPreferencesLinkClicked() },
            )
            BodyLinkText(
                lineThreeText.updateFirstPlaceholder(lineThreeLinkText),
                bodyThreeLinkState,
            )
        }
    }
}

@Composable
private fun BodyLinkText(
    text: String,
    linkState: LinkTextState,
) {
    val style = FirefoxTheme.typography.caption.copy(
        textAlign = TextAlign.Start,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    LinkText(
        text = text,
        linkTextStates = listOf(linkState),
        style = style,
        linkTextDecoration = TextDecoration.Underline,
        shouldApplyAccessibleSize = true,
    )
}

private fun String.updateFirstPlaceholder(text: String) = replace("%1\$s", text)

private object IconSize {
    val heightDp = 60.dp
    val widthDp = 58.dp
}

// *** Code below used for previews only *** //

@PreviewLightDark
@Composable
private fun OnboardingPagePreview() {
    FirefoxTheme {
        TermsOfServiceOnboardingPageRedesign(
            pageState = OnboardingPageState(
                title = stringResource(id = R.string.onboarding_redesign_tou_title),
                description = "",
                termsOfService = OnboardingTermsOfService(
                    subheaderOneText = stringResource(id = R.string.onboarding_redesign_tou_subheader_one),
                    subheaderTwoText = stringResource(id = R.string.onboarding_redesign_tou_subheader_two),
                    subheaderThreeText = stringResource(id = R.string.onboarding_redesign_tou_subheader_three),
                    lineOneText = stringResource(id = R.string.onboarding_redesign_tou_body_one),
                    lineOneLinkText = stringResource(id = R.string.onboarding_redesign_tou_body_one_link_text),
                    lineOneLinkUrl = "URL",
                    lineTwoText = stringResource(id = R.string.onboarding_redesign_tou_body_two),
                    lineTwoLinkText = stringResource(id = R.string.onboarding_redesign_tou_body_two_link_text),
                    lineTwoLinkUrl = "URL",
                    lineThreeText = stringResource(id = R.string.onboarding_redesign_tou_body_three),
                    lineThreeLinkText = stringResource(id = R.string.onboarding_redesign_tou_body_three_link_text),
                ),
                imageRes = R.drawable.ic_firefox,
                primaryButton = Action(
                    text = stringResource(
                        id = R.string.onboarding_redesign_tou_agree_and_continue_button_label,
                    ),
                    onClick = {},
                ),
            ),
            eventHandler = object : OnboardingTermsOfServiceEventHandler {},
        )
    }
}
