/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding.redesign.view

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.compose.base.button.TextButton
import org.mozilla.fenix.R
import org.mozilla.fenix.onboarding.redesign.view.defaultbrowser.SetToDefaultMainImage
import org.mozilla.fenix.onboarding.redesign.view.sync.SyncMainImage
import org.mozilla.fenix.onboarding.view.Action
import org.mozilla.fenix.onboarding.view.OnboardingPageState
import org.mozilla.fenix.theme.FirefoxTheme

const val TITLE_TOP_SPACER_WEIGHT = 0.3f
const val BODY_BUTTON_SPACER_WEIGHT = 1f

/**
 * A composable for displaying onboarding page content.
 *
 * @param pageState [OnboardingPageState] The page content that's displayed.
 * @param mainImage A [Composable] for displaying the main image.
 */
@Composable
fun OnboardingPageRedesign(
    pageState: OnboardingPageState,
    mainImage: @Composable () -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CardView(
            modifier = Modifier.weight(1f),
            pageState = pageState,
            mainImage = mainImage,
        )

        pageState.secondaryButton?.let {
            SecondaryButton(title = pageState.title, secondaryButton = it)
        }
    }

    LaunchedEffect(pageState) {
        pageState.onRecordImpressionEvent()
    }
}

@Composable
private fun SecondaryButton(
    title: String,
    secondaryButton: Action,
) {
    TextButton(
        modifier = Modifier
            .width(width = FirefoxTheme.layout.size.maxWidth.small)
            .semantics {
                testTag = title + "onboarding_card_redesign.negative_button"
            },
        text = secondaryButton.text,
        onClick = secondaryButton.onClick,
        colors = ButtonDefaults.textButtonColors(
            contentColor = FirefoxTheme.colors.textActionPrimary,
        ),
    )
}

@Composable
private fun CardView(
    modifier: Modifier = Modifier,
    pageState: OnboardingPageState,
    mainImage: @Composable () -> Unit,
) {
    Card(
        modifier = modifier,
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
    ) {
        Column(
            modifier = Modifier
                .background(FirefoxTheme.colors.layer1)
                .padding(horizontal = 16.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.weight(TITLE_TOP_SPACER_WEIGHT))

            Content(pageState) { mainImage() }

            Spacer(modifier = Modifier.weight(BODY_BUTTON_SPACER_WEIGHT))

            FilledButton(
                modifier = Modifier
                    .width(width = FirefoxTheme.layout.size.maxWidth.small)
                    .semantics {
                        testTag = pageState.title + "onboarding_card_redesign.positive_button"
                    },
                text = pageState.primaryButton.text,
                onClick = pageState.primaryButton.onClick,
            )
        }
    }
}

@Composable
private fun Content(
    pageState: OnboardingPageState,
    mainImage: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .background(FirefoxTheme.colors.layer1)
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = pageState.title,
            color = FirefoxTheme.colors.textPrimary,
            style = MaterialTheme.typography.headlineMedium,
        )

        mainImage()

        Text(
            text = pageState.description,
            color = FirefoxTheme.colors.textSecondary,
            style = FirefoxTheme.typography.body1,
        )
    }
}

@PreviewLightDark
@Composable
private fun OnboardingPageSetToDefaultPreview() {
    FirefoxTheme {
        OnboardingPageRedesign(
            pageState = OnboardingPageState(
                imageRes = R.drawable.ic_notification_permission,
                title = stringResource(R.string.onboarding_redesign_set_default_browser_title),
                description = stringResource(R.string.onboarding_redesign_set_default_browser_body),
                primaryButton = Action(
                    text = stringResource(R.string.juno_onboarding_default_browser_positive_button),
                    onClick = {},
                ),
                secondaryButton = Action(
                    text = stringResource(R.string.juno_onboarding_default_browser_negative_button),
                    onClick = {},
                ),
                onRecordImpressionEvent = {},
            ),
            mainImage = { SetToDefaultMainImage() },
        )
    }
}

@PreviewLightDark
@Composable
private fun OnboardingPageSyncPreview() {
    FirefoxTheme {
        OnboardingPageRedesign(
            pageState = OnboardingPageState(
                imageRes = R.drawable.ic_notification_permission, // Unused in the redesign.
                title = stringResource(R.string.onboarding_redesign_sync_title),
                description = stringResource(R.string.onboarding_redesign_sync_body),
                primaryButton = Action(
                    text = stringResource(R.string.onboarding_redesign_sync_positive_button),
                    onClick = {},
                ),
                secondaryButton = Action(
                    text = stringResource(R.string.onboarding_redesign_sync_negative_button),
                    onClick = {},
                ),
                onRecordImpressionEvent = {},
            ),
            mainImage = { SyncMainImage() },
        )
    }
}
