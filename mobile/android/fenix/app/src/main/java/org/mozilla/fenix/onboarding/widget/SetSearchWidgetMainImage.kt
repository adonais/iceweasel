/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding.widget

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

private val IMAGE_HEIGHT = 200.dp

/**
 * Renders the main image for the "Set search widget" onboarding screen.
 *
 * **This is a non-interactive, static image view only**.
 */
@Composable
fun SetSearchWidgetMainImage() {
    Image(
        painter = painterResource(R.drawable.ic_onboarding_search_widget),
        contentDescription = null, // Decorative only
        modifier = Modifier.height(IMAGE_HEIGHT),
    )
}

@PreviewLightDark
@Composable
private fun SetSearchWidgetMainImagePreview() {
    FirefoxTheme {
        Surface {
            SetSearchWidgetMainImage()
        }
    }
}
