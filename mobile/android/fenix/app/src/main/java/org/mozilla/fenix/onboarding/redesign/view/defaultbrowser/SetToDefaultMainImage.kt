/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding.redesign.view.defaultbrowser

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * Renders the main image for the "Set to Default" onboarding screen.
 *
 * **This is a non-interactive, static image view only**.
 */
@Composable
fun SetToDefaultMainImage() {
    Column(
        modifier = Modifier.padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BrowserChoiceRow()

        BrowserChoiceRow(selected = true)

        BrowserChoiceRow()
    }
}

@Composable
private fun BrowserChoiceRow(selected: Boolean = false) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(40.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BrowserDetailsRow(selected)

        SelectedCheckmark(selected)
    }
}

@Composable
private fun RowScope.BrowserDetailsRow(selected: Boolean = false) {
    Row(
        modifier = Modifier
            .fillMaxHeight()
            .weight(1f)
            .border(3.dp, FirefoxTheme.colors.borderPrimary, RoundedCornerShape(10.dp))
            .padding(start = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (selected) {
            Image(
                painter = painterResource(R.drawable.ic_firefox),
                contentDescription = null, // Decorative only.
                modifier = Modifier.size(24.dp),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(FirefoxTheme.colors.borderPrimary),
            )
        }
    }
}

@Composable
private fun SelectedCheckmark(selected: Boolean = false) {
    if (selected) {
        Box(
            modifier = Modifier
                .size(24.dp)
                .padding(1.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.tertiary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                painter = painterResource(id = iconsR.drawable.mozac_ic_checkmark_24),
                contentDescription = null, // Decorative only.
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier
                    .size(24.dp)
                    .padding(2.dp),
            )
        }
    } else {
        Box(
            modifier = Modifier
                .size(24.dp)
                .border(
                    width = 3.dp,
                    color = FirefoxTheme.colors.borderPrimary,
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) { }
    }
}

@PreviewLightDark
@Composable
private fun SetToDefaultMainImagePreview() {
    FirefoxTheme {
        Box(Modifier.background(FirefoxTheme.colors.layer1)) {
            SetToDefaultMainImage()
        }
    }
}
