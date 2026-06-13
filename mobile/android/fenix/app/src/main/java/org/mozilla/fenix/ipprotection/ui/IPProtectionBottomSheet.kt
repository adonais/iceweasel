/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ipprotection.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mozilla.components.compose.base.LinkText
import mozilla.components.compose.base.LinkTextState
import mozilla.components.compose.base.annotation.FlexibleWindowPreview
import mozilla.components.compose.base.button.FilledButton
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.PreviewThemeProvider
import org.mozilla.fenix.theme.Theme

private val bannerImageSize = 170.dp
private val sheetMaxHeight = 154.dp
private val sheetMaxWidth = 450.dp

/**
 * The IP Protection onboarding prompt.
 *
 * @param maxGib The total monthly allowance in GB for unpaid users.
 * @param onDismiss The callback to invoke when the prompt is dismissed.
 * @param onDismissRequest The callback to invoke when the user clicks outside of the bottom sheet,
 * after sheet animates to Hidden. See [ModalBottomSheet].
 * @param onLearnMoreClicked The callback to invoke when user clicks on the hyperlink that points to
 * an article about VPN on Firefox.
 * @param onGetStartedClicked The callback to invoke when user clicks on "Get started" to
 * start the VPN authentication or authorization process.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IPProtectionBottomSheet(
    maxGib: Int,
    onDismiss: () -> Unit,
    onDismissRequest: () -> Unit,
    onLearnMoreClicked: () -> Unit,
    onGetStartedClicked: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(Unit) {
        sheetState.show()
    }

    BottomSheet(
        maxGib = maxGib,
        sheetState = sheetState,
        onDismiss = onDismiss,
        onDismissRequest = onDismissRequest,
        onLearnMoreClicked = onLearnMoreClicked,
        onGetStartedClicked = onGetStartedClicked,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BottomSheet(
    maxGib: Int,
    sheetState: SheetState,
    onDismiss: () -> Unit = {},
    onDismissRequest: () -> Unit = {},
    onLearnMoreClicked: () -> Unit = {},
    onGetStartedClicked: () -> Unit = {},
) {
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        sheetMaxWidth = sheetMaxWidth,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        BottomSheetContent(
            maxGib = maxGib,
            sheetState = sheetState,
            onDismiss = onDismiss,
            onLearnMoreClicked = onLearnMoreClicked,
            onGetStartedClicked = onGetStartedClicked,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BottomSheetContent(
    maxGib: Int,
    sheetState: SheetState,
    onDismiss: () -> Unit,
    onLearnMoreClicked: () -> Unit,
    onGetStartedClicked: () -> Unit,
) {
    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .verticalScroll(scrollState)
            .padding(bottom = 16.dp, start = 16.dp, end = 16.dp),
    ) {
        PromoBannerCard()

        Spacer(Modifier.height(32.dp))

        Text(
            text = stringResource(
                R.string.ip_protection_onboarding_card_headline,
                stringResource(R.string.firefox),
            ),
            style = MaterialTheme.typography.bodyLarge,
        )

        Spacer(Modifier.height(16.dp))

        IPProtectionContent(
            maxGib = maxGib,
            onLearnMoreClicked = onLearnMoreClicked,
        )

        Spacer(Modifier.height(16.dp))

        IPProtectionButtons(
            onNotNowClicked = {
                coroutineScope.launch {
                    sheetState.hide()
                }.invokeOnCompletion {
                    onDismiss()
                }
            },
            onGetStartedClicked = {
                onGetStartedClicked()
                coroutineScope.launch {
                    sheetState.hide()
                }.invokeOnCompletion {
                    onDismiss()
                }
            },
        )
    }
}

@Composable
private fun IPProtectionContent(
    maxGib: Int,
    onLearnMoreClicked: () -> Unit,
) {
    val learnMoreText = stringResource(R.string.ip_protection_onboarding_body_link)

    LinkText(
        text = stringResource(
            id = R.string.ip_protection_onboarding_body,
            learnMoreText,
            maxGib,
        ),
        linkTextStates = listOf(
            LinkTextState(
                text = learnMoreText,
                url = "",
                onClick = { onLearnMoreClicked() },
            ),
        ),
        style = FirefoxTheme.typography.body2.copy(
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
        linkTextDecoration = TextDecoration.Underline,
    )
}

@Composable
private fun IPProtectionButtons(
    onNotNowClicked: () -> Unit,
    onGetStartedClicked: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = onNotNowClicked) {
            Text(
                text = stringResource(R.string.ip_protection_onboarding_not_now_button),
                style = FirefoxTheme.typography.button,
            )
        }

        Spacer(Modifier.width(8.dp))
        FilledButton(
            text = stringResource(R.string.ip_protection_get_started),
            onClick = onGetStartedClicked,
        )
    }
}

@Composable
private fun PromoBannerCard() {
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(sheetMaxHeight)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.primaryContainer),
        ) {
            BetaBadge()
        }

        Image(
            painter = painterResource(id = R.drawable.ic_kit_shield_on_state),
            contentDescription = null,
            modifier = Modifier
                .size(bannerImageSize)
                .offset(y = 16.dp),
        )
    }
}

@Composable
private fun BetaBadge() {
    Box(modifier = Modifier.padding(8.dp)) {
        Surface(
            shape = CircleShape,
            color = Color.Transparent,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.tertiary),
        ) {
            Text(
                text = stringResource(R.string.preferences_ip_protection_beta_badge_label),
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.tertiary,
                style = FirefoxTheme.typography.body2,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@FlexibleWindowPreview
@Composable
private fun IPProtectionBottomSheetPreview(
    @PreviewParameter(PreviewThemeProvider::class) theme: Theme,
) {
    FirefoxTheme(theme = theme) {
        IPProtectionBottomSheet(
            maxGib = 50,
            onDismiss = {},
            onDismissRequest = {},
            onGetStartedClicked = {},
            onLearnMoreClicked = {},
        )
    }
}
