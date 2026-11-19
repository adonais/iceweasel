/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentDataType
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDataType
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Devices.TABLET
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.button.TextButton
import mozilla.components.compose.base.modifier.thenConditional
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.pdf.PdfToolsTestTag
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * The signature dialog is used for adding a signature to a PDF.
 *
 * @param state The [TextFieldState] holding the signature being typed.
 * @param isAddingSignature The signature is being sent to the PDF.
 * @param onCloseClick Invoked when the user dismisses the dialog without adding a signature.
 * @param onClearClick Invoked when the user erases the signature they typed.
 * @param onAddClick Invoked when the user adds the signature they typed to the PDF.
 * @param modifier [Modifier] to be applied to the layout.
 */
@Composable
fun SignatureDialog(
    state: TextFieldState,
    isAddingSignature: Boolean,
    onCloseClick: () -> Unit,
    onClearClick: () -> Unit,
    onAddClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(
                    start = FirefoxTheme.layout.space.static200,
                    top = FirefoxTheme.layout.space.static100,
                    end = FirefoxTheme.layout.space.static200,
                    bottom = FirefoxTheme.layout.space.static200,
                ),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier.widthIn(max = 640.dp).testTag(PdfToolsTestTag.SIGNATURE_DIALOG),
            shape = MaterialTheme.shapes.extraLarge,
            colors =
                CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ),
            border = BorderStroke(FirefoxTheme.layout.border.default, MaterialTheme.colorScheme.outlineVariant),
        ) {
            SignatureHeader(onCloseClick = onCloseClick)

            SignatureField(state = state)

            SignatureButtons(
                // Whitespace alone cannot be added, but it still should be clearable
                isClearEnabled = state.text.isNotEmpty() && !isAddingSignature,
                isAddEnabled = state.text.isNotBlank(),
                isAddingSignature = isAddingSignature,
                onClearClick = onClearClick,
                onAddClick = onAddClick,
            )
        }
    }
}

/**
 * The title of the dialog along with the button dismissing it.
 *
 * @param onCloseClick Invoked when the user activates the close button.
 */
@Composable
private fun SignatureHeader(onCloseClick: () -> Unit) {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .padding(
                    start = FirefoxTheme.layout.space.static200,
                    end = FirefoxTheme.layout.space.static50,
                    top = FirefoxTheme.layout.space.static50,
                    bottom = FirefoxTheme.layout.space.static50,
                ),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(id = R.string.pdf_tools_signature_title),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = FirefoxTheme.typography.headline7,
            modifier = Modifier.semantics { heading() },
        )

        IconButton(
            onClick = onCloseClick,
            contentDescription = stringResource(id = R.string.pdf_tools_signature_close_content_description),
            modifier = Modifier.testTag(PdfToolsTestTag.SIGNATURE_CLOSE_BUTTON),
        ) {
            Icon(
                painter = painterResource(id = iconsR.drawable.mozac_ic_cross_24),
                contentDescription = null,
            )
        }
    }
}

/**
 * The field for typing the user's signature.
 *
 * @param state The [TextFieldState] holding the signature that has been typed.
 */
@Composable
private fun SignatureField(state: TextFieldState) {
    val placeholder = stringResource(id = R.string.pdf_tools_signature_placeholder)
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    val signatureStyle =
        TextStyle(
            color = MaterialTheme.colorScheme.primary,
            fontSize = 36.sp,
            fontFamily = FontFamily.Cursive,
            letterSpacing = 1.25.sp,
            textAlign = TextAlign.Center,
        )
    val placeholderStyle = signatureStyle.copy(color = MaterialTheme.colorScheme.secondary)

    Box(
        modifier =
            Modifier.fillMaxWidth()
                .padding(
                    start = FirefoxTheme.layout.space.static200,
                    top = FirefoxTheme.layout.space.static100,
                    end = FirefoxTheme.layout.space.static200,
                    bottom = FirefoxTheme.layout.space.static150,
                )
                .height(136.dp)
                .background(MaterialTheme.colorScheme.tertiaryContainer, MaterialTheme.shapes.large)
                .border(
                    width = FirefoxTheme.layout.border.default,
                    color = MaterialTheme.colorScheme.outlineVariant,
                    shape = MaterialTheme.shapes.large,
                ),
        contentAlignment = Alignment.Center,
    ) {
        if (state.text.isEmpty()) {
            // The content description is set on the field, so this does not need to be double processed.
            Text(text = placeholder, style = placeholderStyle, modifier = Modifier.clearAndSetSemantics {})
        }

        BasicTextField(
            state = state,
            textStyle = signatureStyle,
            lineLimits = TextFieldLineLimits.SingleLine,
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions =
                KeyboardOptions(
                    autoCorrectEnabled = false,
                    keyboardType = KeyboardType.PersonName,
                ),
            modifier =
                Modifier.fillMaxWidth()
                    .testTag(PdfToolsTestTag.SIGNATURE_INPUT)
                    .focusRequester(focusRequester)
                    .semantics {
                        contentDescription = placeholder
                        contentDataType = ContentDataType.None
                    },
        )
    }
}

/**
 * The buttons for controlling the typed signature.
 *
 * @param isClearEnabled Whether anything has been typed for the clear button to erase.
 * @param isAddEnabled Whether enough has been typed for the signature to be added.
 * @param isAddingSignature Whether the signature is in the process of being added to the PDF, which shows progress on
 *   the add button.
 * @param onClearClick Invoked when the user activates the clear button.
 * @param onAddClick Invoked when the user activates the add button.
 */
@Composable
private fun SignatureButtons(
    isClearEnabled: Boolean,
    isAddEnabled: Boolean,
    isAddingSignature: Boolean,
    onClearClick: () -> Unit,
    onAddClick: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(FirefoxTheme.layout.space.static100),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(
            text = stringResource(id = R.string.pdf_tools_signature_clear_button),
            onClick = onClearClick,
            modifier = Modifier.testTag(PdfToolsTestTag.SIGNATURE_CLEAR_BUTTON),
            enabled = isClearEnabled,
        )

        AddSignatureButton(
            isEnabled = isAddEnabled,
            isAddingSignature = isAddingSignature,
            onClick = onAddClick,
        )
    }
}

/**
 * The button for adding a signature to the PDF. While [isAddingSignature] is true, a loading indicator will be shown.
 *
 * @param isEnabled The button is ready for submission.
 * @param isAddingSignature The signature is in the process of being added to the PDF. A loading indication will be
 *   shown.
 * @param onClick Invoked when the user activates the button.
 */
@Composable
private fun AddSignatureButton(
    isEnabled: Boolean,
    isAddingSignature: Boolean,
    onClick: () -> Unit,
) {
    val addingDescription = stringResource(id = R.string.pdf_tools_signature_adding_content_description)

    FilledButton(
        onClick = { if (!isAddingSignature) onClick() },
        modifier =
            Modifier.testTag(PdfToolsTestTag.SIGNATURE_ADD_BUTTON).thenConditional(
                Modifier.clearAndSetSemantics {
                    role = Role.Button
                    contentDescription = addingDescription
                }
            ) {
                isAddingSignature
            },
        enabled = isEnabled,
        containerColor = MaterialTheme.colorScheme.tertiary,
    ) {
        Box(contentAlignment = Alignment.Center) {
            // The label is hidden to retain same button width.
            Text(
                text = stringResource(id = R.string.pdf_tools_signature_add_button),
                modifier = Modifier.alpha(if (isAddingSignature) 0f else 1f),
                style = FirefoxTheme.typography.button,
            )

            if (isAddingSignature) {
                CircularProgressIndicator(
                    modifier = Modifier.size(ButtonDefaults.IconSize),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = FirefoxTheme.layout.border.heavy,
                )
            }
        }
    }
}

@PreviewLightDark
@Preview(name = "Tablet - Landscape", device = TABLET)
@Composable
private fun SignatureDialogPhonePreview() {
    FirefoxTheme {
        SignatureDialog(
            state = rememberTextFieldState(),
            isAddingSignature = false,
            onCloseClick = {},
            onClearClick = {},
            onAddClick = {},
        )
    }
}

@PreviewLightDark
@Composable
private fun SignatureDialogAddingPreview() {
    FirefoxTheme {
        SignatureDialog(
            state = rememberTextFieldState(initialText = "Test"),
            isAddingSignature = true,
            onCloseClick = {},
            onClearClick = {},
            onAddClick = {},
        )
    }
}
