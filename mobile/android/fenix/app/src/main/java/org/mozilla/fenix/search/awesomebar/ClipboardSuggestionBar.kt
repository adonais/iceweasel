/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.search.awesomebar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.Divider
import mozilla.components.compose.base.theme.AcornTheme
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * A suggestion bar that appears when a link is copied to the clipboard.
 * It allows the user to fill the link into the current input field.
 *
 * @param shouldUseBottomToolbar Indicates whether the toolbar is at the bottom of the screen.
 * @param onClick Callback invoked when the suggestion bar is clicked.
 */
@Composable
fun ClipboardSuggestionBar(
    shouldUseBottomToolbar: Boolean,
    onClick: () -> Unit,
) {
    Box {
        Row(
            modifier = Modifier
                .clickable(onClick = onClick)
                .background(color = AcornTheme.colors.layer1)
                .padding(8.dp)
                .height(32.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painter = painterResource(id = R.drawable.mozac_ic_link_24),
                contentDescription = null,
                tint = FirefoxTheme.colors.iconPrimary,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.awesomebar_clipboard_title),
                color = FirefoxTheme.colors.textPrimary,
                style = FirefoxTheme.typography.body2,
                modifier = Modifier.weight(1f),
            )
        }
        Divider(
            modifier = when (shouldUseBottomToolbar) {
                true -> Modifier.align(Alignment.TopCenter)
                false -> Modifier.align(Alignment.BottomCenter)
            },
        )
    }
}

@PreviewLightDark
@Composable
private fun ClipboardBarPreview() {
    AcornTheme {
        ClipboardSuggestionBar(
            shouldUseBottomToolbar = false,
            onClick = {},
        )
    }
}
