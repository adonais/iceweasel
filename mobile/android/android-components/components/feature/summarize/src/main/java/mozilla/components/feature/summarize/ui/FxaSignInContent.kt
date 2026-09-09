/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.summarize.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.compose.base.button.OutlinedButton
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.feature.summarize.R
import mozilla.components.feature.summarize.SignInSummarizationContentAction

@Composable
internal fun FxaSignInContent(dispatchAction: (SignInSummarizationContentAction) -> Unit = {}) {
    FxaSignInContentBody(
        onSignIn = { dispatchAction(SignInSummarizationContentAction.SignInClicked) },
        onDismiss = { dispatchAction(SignInSummarizationContentAction.DismissClicked) },
        onClickLearnMore = { dispatchAction(SignInSummarizationContentAction.LearnMoreClicked) },
    )
}

@Composable
private fun FxaSignInContentBody(
    onSignIn: () -> Unit,
    onDismiss: () -> Unit,
    onClickLearnMore: () -> Unit,
) {
    Column {
        FxaSignInDescription(onClickLearnMore = onClickLearnMore)

        Spacer(modifier = Modifier.height(AcornTheme.layout.space.static600))

        FxaSignInButtons(
            onSignIn = onSignIn,
            onDismiss = onDismiss,
        )
    }
}

@Composable
private fun FxaSignInDescription(
    modifier: Modifier = Modifier,
    onClickLearnMore: () -> Unit,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = stringResource(R.string.mozac_summarize_fxa_sign_in_title),
            style = AcornTheme.typography.headline6,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(AcornTheme.layout.space.static100))

        FxaSignInAnnotatedBodyText(onClickLearnMore = onClickLearnMore)
    }
}

@Composable
private fun FxaSignInAnnotatedBodyText(
    modifier: Modifier = Modifier,
    onClickLearnMore: () -> Unit,
) {
    val linkColor = MaterialTheme.colorScheme.tertiary
    val message = stringResource(R.string.mozac_summarize_fxa_sign_in_message)
    val learnMore = stringResource(R.string.mozac_summarize_learn_more_link)

    val annotatedMessage = buildAnnotatedString {
        append("$message ")
        withLink(
            LinkAnnotation.Clickable(
                tag = "LEARN_MORE",
                styles =
                    TextLinkStyles(style = SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)),
                linkInteractionListener = { onClickLearnMore() },
            )
        ) {
            append(learnMore)
        }
    }

    Text(
        modifier = modifier,
        text = annotatedMessage,
        style =
            AcornTheme.typography.body2.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            ),
    )
}

@Composable
private fun FxaSignInButtons(
    modifier: Modifier = Modifier,
    onSignIn: () -> Unit,
    onDismiss: () -> Unit,
) {
    Column(modifier = modifier) {
        FilledButton(
            modifier = Modifier.fillMaxWidth(),
            onClick = { onSignIn() },
            text = stringResource(R.string.mozac_summarize_fxa_sign_in_button_positive),
        )

        Spacer(Modifier.height(AcornTheme.layout.space.static200))

        OutlinedButton(
            modifier = Modifier.fillMaxWidth(),
            text = stringResource(R.string.mozac_summarize_error_dissmiss),
            onClick = { onDismiss() },
        )
    }
}

@PreviewLightDark
@Composable
private fun PreviewFxaSignInContent() = AcornTheme {
    Surface {
        FxaSignInContent()
    }
}
