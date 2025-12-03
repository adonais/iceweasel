/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.webcompat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.FilledButton
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.BottomSheetHandle
import org.mozilla.fenix.theme.FirefoxTheme

private val BottomSheetHandleVerticalPadding = 16.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun WebCompatReporterPreviewSheet(
    isSendButtonEnabled: Boolean,
    previewJSON: String,
    onDismissRequest: () -> Unit,
    onSendClick: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        dragHandle = {
            BottomSheetHandle(
                onRequestDismiss = onDismissRequest,
                contentDescription = stringResource(R.string.a11y_action_label_collapse),
                modifier = Modifier
                    .width(32.dp)
                    .padding(vertical = BottomSheetHandleVerticalPadding)
                    .semantics { traversalIndex = -1f },
                color = FirefoxTheme.colors.borderInverted,
            )
        },
        containerColor = FirefoxTheme.colors.layer2,
        modifier = Modifier.padding(top = 72.dp),
        contentWindowInsets = { WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom) },
    ) {
            PreviewSheetContent(
                isSendButtonEnabled = isSendButtonEnabled,
                previewJSON = previewJSON,
                onSendClick = onSendClick,
            )
        }
    }

@Composable
private fun PreviewSheetContent(
    previewJSON: String,
    onSendClick: () -> Unit,
    isSendButtonEnabled: Boolean,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                color = FirefoxTheme.colors.layer2,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,

        ) {
        Text(
            text = stringResource(id = R.string.webcompat_reporter_preview_bottom_sheet_header),
            color = FirefoxTheme.colors.textPrimary,
            style = FirefoxTheme.typography.headline7,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Text(
                text = previewJSON,
                color = FirefoxTheme.colors.textPrimary,
                style = FirefoxTheme.typography.body2,
            )
        }
        FilledButton(
            text = stringResource(id = R.string.webcompat_reporter_preview_bottom_sheet_send),
            onClick = onSendClick,
            modifier = Modifier
                .fillMaxWidth()
                .background(color = FirefoxTheme.colors.layer1)
                .padding(all = 16.dp),
            enabled = isSendButtonEnabled,
        )
    }
}

// Note: run the interactive preview for this composable to see the bottom sheet behaviour of the report preview.
@Composable
@PreviewLightDark
private fun WebCompatReporterSheetPreview() {
    FirefoxTheme {
        WebCompatReporterPreviewSheet(
            isSendButtonEnabled = true,
            previewJSON = WebCompatReporterPreviewSampleJsonData.SAMPLE_WEBCOMPAT_JSON_DATA,
            onDismissRequest = {},
            onSendClick = {},
        )
    }
}

@Composable
@PreviewLightDark
private fun SheetContentPreview() {
    FirefoxTheme {
        PreviewSheetContent(
            previewJSON = WebCompatReporterPreviewSampleJsonData.SAMPLE_WEBCOMPAT_JSON_DATA,
            onSendClick = {},
            isSendButtonEnabled = true,
        )
    }
}
