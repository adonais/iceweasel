/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding.redesign.view

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.onboarding.store.OnboardingStore
import org.mozilla.fenix.onboarding.view.Action
import org.mozilla.fenix.onboarding.view.OnboardingPageState
import org.mozilla.fenix.onboarding.view.ToolbarOption
import org.mozilla.fenix.onboarding.view.ToolbarOptionType
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * A Composable for displaying toolbar placement onboarding page content.
 *
 * @param onboardingStore The [OnboardingStore] that holds the toolbar selection state.
 * @param pageState The page content that's displayed.
 * @param onToolbarSelectionClicked Callback for when a toolbar selection is clicked.
 */
@Composable
fun ToolbarOnboardingPageRedesign(
    onboardingStore: OnboardingStore,
    pageState: OnboardingPageState,
    onToolbarSelectionClicked: (ToolbarOptionType) -> Unit,
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
                    .padding(horizontal = 20.dp)
                    .weight(CONTENT_WEIGHT)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(36.dp),
            ) {
                Text(
                    text = pageState.title,
                    textAlign = TextAlign.Start,
                    style = MaterialTheme.typography.headlineSmall,
                )

                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    ToolbarPositionOptions(
                        onboardingStore = onboardingStore,
                        pageState = pageState,
                        onToolbarSelectionClicked = onToolbarSelectionClicked,
                    )
                }
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
private fun ToolbarPositionOptions(
    onboardingStore: OnboardingStore,
    pageState: OnboardingPageState,
    onToolbarSelectionClicked: (ToolbarOptionType) -> Unit,
) {
    val state by onboardingStore.observeAsState(initialValue = onboardingStore.state) { it }
    pageState.toolbarOptions?.let { options ->
        Row(horizontalArrangement = Arrangement.spacedBy(26.dp)) {
            options.forEach {
                ToolbarPositionOption(
                    option = it,
                    isSelected = it.toolbarType == state.toolbarOptionSelected,
                    onClick = { onToolbarSelectionClicked(it.toolbarType) },
                )
            }
        }
    }
}

@Composable
private fun ToolbarPositionOption(
    option: ToolbarOption,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        ToolbarPositionImage(
            option = option,
            isSelected = isSelected,
            onClick = { onClick() },
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = option.label,
            modifier = Modifier.align(Alignment.CenterHorizontally),
            style = FirefoxTheme.typography.headline7,
        )
    }
}

@Composable
private fun ToolbarPositionImage(
    option: ToolbarOption,
    isSelected: Boolean,
    onClick: () -> Unit,
    aspectRatio: Float = 0.7f,
) {
    val cardShape = RoundedCornerShape(16.dp)
    val imageColors = imageColors(isSelected)

    Box(
        modifier = Modifier
            .height(CONTENT_IMAGE_HEIGHT)
            .aspectRatio(aspectRatio)
            .clickable(role = Role.Button, onClick = onClick)
            .clip(shape = cardShape)
            .background(color = imageColors.cardBackground)
            .border(2.dp, imageColors.borderColor, cardShape),
    ) {
        BrowserIllustration(
            imageColors = imageColors,
            isTop = option.toolbarType == ToolbarOptionType.TOOLBAR_TOP,
        )
    }
}

@Composable
private fun BrowserIllustration(
    imageColors: ImageColors,
    isTop: Boolean,
) {
    val browserShape = RoundedCornerShape(6.dp)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp)
            .clip(shape = browserShape)
            .border(2.dp, imageColors.borderColor, browserShape),
    ) {
        val (paddingTop, paddingBottom) = if (isTop) 6.dp to 4.dp else 4.dp to 6.dp

        if (isTop) {
            ToolbarIllustration(
                toolbarBackground = imageColors.toolbarBackground,
                addressBarBackground = imageColors.addressBarBackground,
                iconTint = imageColors.iconColor,
                paddingTop = paddingTop,
                paddingBottom = paddingBottom,
            )
        }

        TabIllustration(Modifier.weight(1f))

        if (!isTop) {
            ToolbarIllustration(
                toolbarBackground = imageColors.toolbarBackground,
                addressBarBackground = imageColors.addressBarBackground,
                iconTint = imageColors.iconColor,
                paddingTop = paddingTop,
                paddingBottom = paddingBottom,
            )
        }
    }
}

@Composable
private fun ToolbarIllustration(
    toolbarBackground: Color,
    addressBarBackground: Color,
    iconTint: Color,
    paddingTop: Dp,
    paddingBottom: Dp,
) {
    Box(modifier = Modifier.background(toolbarBackground)) {
        AddressBarIllustration(
            addressBarBackground = addressBarBackground,
            iconTint = iconTint,
            paddingTop = paddingTop,
            paddingBottom = paddingBottom,
        )
    }
}

@Composable
private fun AddressBarIllustration(
    addressBarBackground: Color,
    iconTint: Color,
    paddingTop: Dp,
    paddingBottom: Dp,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(24.dp)
            .padding(top = paddingTop, bottom = paddingBottom, start = 6.dp, end = 6.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(addressBarBackground),
    ) {
        Icon(
            painter = painterResource(iconsR.drawable.mozac_ic_search_24),
            tint = iconTint,
            contentDescription = null,
            modifier = Modifier
                .padding(start = 4.dp, top = 2.dp, bottom = 2.dp)
                .align(Alignment.CenterStart),
        )
    }
}

@Composable
private fun TabIllustration(modifier: Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.White),
    )
}

@Composable
private fun imageColors(isSelected: Boolean): ImageColors {
    val borderColor by animateColorAsState(
        targetValue = if (isSelected) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.outlineVariant
        },
        label = "borderColor",
    )
    val cardBackground by animateColorAsState(
        targetValue = if (isSelected) MaterialTheme.colorScheme.primaryContainer else Color.White,
        label = "cardBackground",
    )
    val addressBarBackground by animateColorAsState(
        targetValue = if (isSelected) MaterialTheme.colorScheme.primary else Color.White,
        label = "addressBarBackground",
    )
    val toolbarBackground by animateColorAsState(
        targetValue = if (isSelected) {
            MaterialTheme.colorScheme.surfaceDim
        } else {
            MaterialTheme.colorScheme.outlineVariant
        },
        label = "toolbarBackground",
    )
    val iconColor by animateColorAsState(
        targetValue = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
        label = "iconColor",
    )

    return ImageColors(
        borderColor = borderColor,
        cardBackground = cardBackground,
        addressBarBackground = addressBarBackground,
        toolbarBackground = toolbarBackground,
        iconColor = iconColor,
    )
}

private data class ImageColors(
    val borderColor: Color,
    val cardBackground: Color,
    val addressBarBackground: Color,
    val toolbarBackground: Color,
    val iconColor: Color,
)

@FlexibleWindowLightDarkPreview
@Composable
private fun OnboardingPagePreview() {
    FirefoxTheme {
        ToolbarOnboardingPageRedesign(
            onboardingStore = OnboardingStore(),
            pageState = OnboardingPageState(
                imageRes = R.drawable.ic_onboarding_customize_toolbar,
                title = stringResource(id = R.string.onboarding_redesign_customize_toolbar_title),
                description = stringResource(id = R.string.onboarding_customize_toolbar_description),
                primaryButton = Action(
                    text = stringResource(
                        id = R.string.onboarding_redesign_continue_button,
                    ),
                    onClick = {},
                ),
                toolbarOptions = listOf(
                    ToolbarOption(
                        toolbarType = ToolbarOptionType.TOOLBAR_TOP,
                        imageRes = R.drawable.ic_onboarding_top_toolbar,
                        label = stringResource(R.string.onboarding_customize_toolbar_top_option),
                    ),
                    ToolbarOption(
                        toolbarType = ToolbarOptionType.TOOLBAR_BOTTOM,
                        imageRes = R.drawable.ic_onboarding_bottom_toolbar,
                        label = stringResource(R.string.onboarding_customize_toolbar_bottom_option),
                    ),
                ),
                onRecordImpressionEvent = {},
            ),
            onToolbarSelectionClicked = {},
        )
    }
}
