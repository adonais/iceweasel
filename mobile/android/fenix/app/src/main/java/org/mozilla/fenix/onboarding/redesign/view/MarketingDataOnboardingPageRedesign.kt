/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding.redesign.view

import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalOverscrollFactory
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.compose.base.button.OutlinedButton
import mozilla.components.ui.colors.PhotonColors
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.LinkText
import org.mozilla.fenix.compose.LinkTextState
import org.mozilla.fenix.compose.ScrollIndicator
import org.mozilla.fenix.nimbus.MarketingCardVariant
import org.mozilla.fenix.onboarding.view.Action
import org.mozilla.fenix.onboarding.view.OnboardingMarketingData
import org.mozilla.fenix.onboarding.view.OnboardingPageState
import org.mozilla.fenix.theme.FirefoxTheme

private val MARKETING_CONTENT_IMAGE_HEIGHT = 150.dp

/**
 * UI for an onboarding page that allows the user to opt out of marketing data analytics.
 *
 * @param state the UI state containing strings etc.
 * @param onMarketingDataLearnMoreClick callback for when the user clicks the learn more text link.
 * @param onMarketingOptInToggle callback for when the user toggles the opt-in checkbox.
 * @param onMarketingDataContinueClick callback for when the user clicks the continue button.
 * @param onMarketingDataSkipClick callback for when the user clicks the skip button.
 */
@Suppress("LongMethod")
@Composable
fun MarketingDataOnboardingPageRedesign(
    state: OnboardingPageState,
    onMarketingDataLearnMoreClick: () -> Unit,
    onMarketingOptInToggle: (optIn: Boolean) -> Unit,
    onMarketingDataContinueClick: (allowMarketingDataCollection: Boolean) -> Unit,
    onMarketingDataSkipClick: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(if (state.shouldShowElevation) 6.dp else 0.dp),
    ) {
        Column(
            modifier = Modifier.padding(
                horizontal = 16.dp,
                vertical = if (state.isSmallDevice) 0.dp else 24.dp,
            ),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(TITLE_TOP_SPACER_WEIGHT)).takeIf { !state.isSmallDevice }

            var checkboxChecked by remember { mutableStateOf(true) }

            Box(
                modifier = Modifier
                    .weight(CONTENT_WEIGHT)
                    .fillMaxWidth(),
            ) {
                val scrollState = rememberScrollState()

                CompositionLocalProvider(
                    LocalOverscrollFactory provides null,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState)
                            .padding(start = 20.dp, end = 32.dp),
                        verticalArrangement = Arrangement.spacedBy(36.dp),
                    ) {
                        Text(
                            text = state.title,
                            textAlign = TextAlign.Start,
                            style = MaterialTheme.typography.headlineSmall,
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Image(
                                modifier = Modifier.height(MARKETING_CONTENT_IMAGE_HEIGHT),
                                painter = painterResource(id = state.imageRes),
                                contentDescription = null,
                            )
                        }

                        state.marketingData?.let {
                            MarketingDataView(
                                marketingData = it,
                                checkboxChecked = checkboxChecked,
                                onMarketingOptInToggle = { isChecked ->
                                    checkboxChecked = isChecked
                                    onMarketingOptInToggle(isChecked)
                                },
                            )
                        }
                    }
                }

                ScrollIndicator(
                    scrollState = scrollState,
                    modifier = Modifier.align(Alignment.CenterEnd),
                    enabled = state.isSmallDevice,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                state.marketingData?.let {
                    LinkText(
                        text = it.bodyOneLinkText,
                        linkTextStates = listOf(
                            LinkTextState(
                                text = it.bodyOneLinkText,
                                url = "",
                                onClick = { onMarketingDataLearnMoreClick() },
                            ),
                        ),
                        linkTextDecoration = TextDecoration.Underline,
                        style = FirefoxTheme.typography.body2,
                        textAlign = TextAlign.Start,
                    )
                }
            }

            Spacer(Modifier.height(32.dp))

            state.secondaryButton?.let { action ->
                when (state.marketingData?.marketingCardVariant) {
                    MarketingCardVariant.TREATMENT_A,
                    MarketingCardVariant.TREATMENT_B,
                        ->
                        SecondaryButtonFilled(action, state, onMarketingDataSkipClick)

                    else ->
                        SecondaryButtonOutline(action, state, onMarketingDataSkipClick)
                }
            }

            FilledButton(
                text = state.primaryButton.text,
                modifier = Modifier
                    .width(width = FirefoxTheme.layout.size.maxWidth.small)
                    .semantics {
                        testTag = state.title + "onboarding_card_redesign.positive_button"
                    },
                icon = painterResource(id = R.drawable.ic_favourite_filled),
                iconTint = PhotonColors.Red50,
                onClick = { onMarketingDataContinueClick(checkboxChecked) },
            )
        }
    }

    LaunchedEffect(Unit) {
        state.onRecordImpressionEvent()
    }
}

@Composable
private fun SecondaryButtonFilled(
    action: Action,
    state: OnboardingPageState,
    onMarketingDataSkipClick: () -> Unit,
) {
    FilledButton(
        text = action.text,
        modifier = Modifier
            .width(width = FirefoxTheme.layout.size.maxWidth.small)
            .semantics {
                testTag = state.title + "onboarding_card_redesign.negative_button"
            },
        onClick = { onMarketingDataSkipClick() },
    )
}

@Composable
private fun SecondaryButtonOutline(
    action: Action,
    state: OnboardingPageState,
    onMarketingDataSkipClick: () -> Unit,
) {
    OutlinedButton(
        text = action.text,
        modifier = Modifier
            .width(width = FirefoxTheme.layout.size.maxWidth.small)
            .semantics {
                testTag = state.title + "onboarding_card_redesign.negative_button"
            },
        onClick = { onMarketingDataSkipClick() },
    )
}

@Composable
private fun MarketingDataView(
    marketingData: OnboardingMarketingData,
    checkboxChecked: Boolean,
    onMarketingOptInToggle: (optIn: Boolean) -> Unit,
) {
    Column {
        Row(
            Modifier.toggleable(
                value = checkboxChecked,
                role = Role.Checkbox,
                onValueChange = {
                    onMarketingOptInToggle.invoke(!checkboxChecked)
                },
            ),
        ) {
            Checkbox(
                modifier = Modifier
                    .align(Alignment.Top)
                    .offset(y = (-12).dp, x = (-12).dp)
                    .clearAndSetSemantics {},
                checked = checkboxChecked,
                onCheckedChange = {
                    onMarketingOptInToggle.invoke(!checkboxChecked)
                },
            )

            val bodyCopyRes = bodyCopyForVariant(marketingData.marketingCardVariant)
            Text(
                text = stringResource(bodyCopyRes),
                style = FirefoxTheme.typography.body2,
                textAlign = TextAlign.Start,
            )
        }
    }
}

private fun bodyCopyForVariant(marketingCardVariant: MarketingCardVariant) =
    when (marketingCardVariant) {
        MarketingCardVariant.DEFAULT -> R.string.nova_onboarding_marketing_body_2
        MarketingCardVariant.TREATMENT_A -> R.string.nova_onboarding_marketing_body_3
        MarketingCardVariant.TREATMENT_B,
        MarketingCardVariant.TREATMENT_C,
            -> R.string.nova_onboarding_marketing_body_4

        MarketingCardVariant.TREATMENT_D -> R.string.nova_onboarding_marketing_body_5
    }

private class BodyResourcePreviewProvider : PreviewParameterProvider<MarketingCardVariant> {
    override val values = sequenceOf(
        MarketingCardVariant.DEFAULT,
        MarketingCardVariant.TREATMENT_A,
        MarketingCardVariant.TREATMENT_B,
        MarketingCardVariant.TREATMENT_C,
        MarketingCardVariant.TREATMENT_D,
    )

    override fun getDisplayName(index: Int): String {
        return values.elementAt(index).name
    }
}

// Uncomment @FlexibleWindowLightDarkPreview below to review changes across multiple screen sizes.
// @FlexibleWindowLightDarkPreview

// Use @PreviewLightDark by default for preview rendering performance and easier preview navigation.
@PreviewLightDark
@Composable
private fun MarketingDataOnboardingPagePreview(
    @PreviewParameter(BodyResourcePreviewProvider::class) variant: MarketingCardVariant,
) {
    FirefoxTheme {
        MarketingDataOnboardingPageRedesign(
            state = OnboardingPageState(
                imageRes = R.drawable.nova_onboarding_marketing,
                title = stringResource(id = R.string.nova_onboarding_marketing_title),
                description = "", // NB: not used in the redesign
                primaryButton = Action(
                    text = stringResource(id = R.string.nova_onboarding_marketing_primary_button_text),
                    onClick = {},
                ),
                secondaryButton = Action(
                    text = stringResource(id = R.string.nova_onboarding_marketing_secondary_button_text),
                    onClick = {},
                ),
                marketingData = OnboardingMarketingData(
                    marketingCardVariant = variant,
                    bodyOneText = "", // NB: not used in the redesign
                    bodyOneLinkText = stringResource(id = R.string.nova_onboarding_marketing_body_link_text),
                    bodyTwoText = "", // NB: not used in the redesign
                ),
            ),
            onMarketingDataLearnMoreClick = {},
            onMarketingOptInToggle = {},
            onMarketingDataContinueClick = {},
            onMarketingDataSkipClick = {},
        )
    }
}
