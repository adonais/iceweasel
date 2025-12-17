/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding.notification

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Renders the main image for the "Notification" onboarding screen.
 *
 * **This is a non-interactive, static image view only**.
 */
@Composable
fun NotificationMainImage() {
    Image(
        painter = painterResource(R.drawable.ic_notification_permission),
        contentDescription = null, // Decorative only
    )
}

@PreviewLightDark
@Composable
private fun NotificationMainImagePreview() {
    FirefoxTheme {
        Box(Modifier.background(FirefoxTheme.colors.layer1)) {
            NotificationMainImage()
        }
    }
}
