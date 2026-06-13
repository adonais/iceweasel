/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.lens

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import mozilla.components.compose.base.button.IconButton
import org.mozilla.fenix.R
import mozilla.components.feature.qr.R as qrR
import mozilla.components.ui.icons.R as iconsR

private val ShutterButtonSize = 64.dp
private val ButtonSize = 48.dp
private val ShutterBorderWidth = 3.dp
private val ShutterBorderColor = Color.White.copy(alpha = 0.5f)

/**
 * Camera screen for Google Lens image capture.
 *
 * @param showError Whether to display the camera error message.
 * @param onClose Callback when the close button is tapped.
 * @param onShutter Callback when the shutter button is tapped.
 * @param onGallery Callback when the gallery button is tapped.
 * @param textureViewFactory Factory to create the [AutoFitTextureView] instance.
 * @param onTextureViewCreated Callback providing the created [AutoFitTextureView] reference.
 */
@Composable
fun LensCameraScreen(
    showError: Boolean,
    onClose: () -> Unit,
    onShutter: () -> Unit,
    onGallery: () -> Unit,
    textureViewFactory: (Context) -> AutoFitTextureView,
    onTextureViewCreated: (AutoFitTextureView) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        AndroidView(
            factory = { context ->
                textureViewFactory(context).also { onTextureViewCreated(it) }
            },
            modifier = Modifier
                .fillMaxSize()
                .wrapContentSize(Alignment.Center),
        )

        if (showError) {
            Text(
                text = stringResource(qrR.string.mozac_feature_qr_scanner_no_camera),
                color = Color.White,
                modifier = Modifier.align(Alignment.Center),
            )
        }

        IconButton(
            onClick = onClose,
            contentDescription = stringResource(R.string.content_description_close_button),
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(top = 48.dp, start = 12.dp)
                .size(ButtonSize),
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_cross_24),
                contentDescription = null,
                tint = Color.White,
            )
        }

        BottomControls(
            onShutter = onShutter,
            onGallery = onGallery,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun BottomControls(
    onShutter: () -> Unit,
    onGallery: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 24.dp, bottom = 48.dp, start = 32.dp, end = 32.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = onGallery,
            contentDescription = stringResource(R.string.content_description_gallery),
            modifier = Modifier
                .size(ButtonSize)
                .weight(1f),
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_image_24),
                contentDescription = null,
                tint = Color.White,
            )
        }

        IconButton(
            onClick = onShutter,
            contentDescription = stringResource(R.string.content_description_take_photo),
            modifier = Modifier
                .size(ShutterButtonSize)
                .border(ShutterBorderWidth, ShutterBorderColor, CircleShape)
                .background(Color.White, CircleShape),
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_camera_24),
                contentDescription = null,
                tint = Color.Black,
            )
        }

        Spacer(
            modifier = Modifier
                .size(ButtonSize)
                .weight(1f),
        )
    }
}
