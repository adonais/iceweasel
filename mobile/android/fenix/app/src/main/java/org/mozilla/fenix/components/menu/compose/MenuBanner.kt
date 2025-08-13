/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu.compose

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme

/**
 * A full-width banner shown in the menu prompting the user to set Firefox as their default browser.
 *
 * The entire banner (icon, illustration, and text) is clickable to launch the
 * system default-browser picker. An “X” icon at the end lets the user permanently dismiss the
 * banner.
 *
 * @param onDismiss Invoked when the user taps the dismiss icon (“X”).
 * @param onClick Invoked when the user taps anywhere else on the banner.
 */
@Composable
fun MenuBanner(
    onDismiss: () -> Unit,
    onClick: () -> Unit,
) {
    val appName = LocalContext.current.getString(R.string.app_name)
    val shape = RoundedCornerShape(28.dp)
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .clickable(onClick = onClick),
        color = FirefoxTheme.colors.layer3,
    ) {
        Box {
            Row {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = 24.dp, top = 12.dp, bottom = 10.dp),
                ) {
                    Text(
                        text = stringResource(id = R.string.browser_menu_default_banner_title, appName),
                        style = FirefoxTheme.typography.body1,
                        color = FirefoxTheme.colors.textPrimary,
                        overflow = TextOverflow.Ellipsis,
                        maxLines = 3,
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    Text(
                        text = stringResource(id = R.string.browser_menu_default_banner_subtitle_2),
                        style = FirefoxTheme.typography.caption,
                        color = FirefoxTheme.colors.textSecondary,
                        overflow = TextOverflow.Ellipsis,
                        maxLines = 3,
                    )
                }
                Image(
                    painter = painterResource(id = R.drawable.firefox_as_default_banner_illustration),
                    contentDescription = null,
                    modifier = Modifier
                        .align(Alignment.Bottom)
                        .padding(end = 16.dp)
                        .graphicsLayer(
                            scaleX = if (isRtl) 1f else -1f,
                        ),
                )
            }
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(48.dp)
                    .semantics(mergeDescendants = true) {},
            ) {
                Icon(
                    painter = painterResource(id = R.drawable.mozac_ic_cross_20),
                    contentDescription = stringResource(id = R.string.browser_menu_default_banner_dismiss_promotion),
                    modifier = Modifier
                        .padding(top = 8.dp, end = 12.dp)
                        .align(Alignment.TopEnd),
                    tint = FirefoxTheme.colors.iconPrimary,
                )
            }
        }
    }
}

@PreviewLightDark
@Composable
private fun MenuBannerPreview() {
    FirefoxTheme {
        Column(
            modifier = Modifier
                .padding(16.dp),
        ) {
            MenuBanner(
                onDismiss = {},
                onClick = {},
            )
        }
    }
}

@Preview
@Composable
private fun MenuBannerPrivatePreview() {
    FirefoxTheme(theme = Theme.Private) {
        Column(
            modifier = Modifier
                .padding(16.dp),
        ) {
            MenuBanner(
                onDismiss = {},
                onClick = {},
            )
        }
    }
}
