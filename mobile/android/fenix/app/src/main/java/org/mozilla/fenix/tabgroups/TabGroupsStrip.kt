/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.dimensionResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * The bottom toolbar shown while the active tab is in a group.
 *
 * @param modifier The [Modifier] to be applied to the strip.
 * @param containerColor The background color.
 */
@Composable
fun TabGroupsStrip(
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.surface,
) {
    Surface(
        modifier =
            modifier
                .fillMaxWidth()
                .height(dimensionResource(R.dimen.tab_groups_strip_height))
                .testTag(TabGroupsTestTag.TAB_GROUPS_STRIP),
        color = containerColor,
        content = {},
    )
}

@PreviewLightDark
@Composable
private fun TabGroupsStripPreview() {
    FirefoxTheme {
        TabGroupsStrip()
    }
}
