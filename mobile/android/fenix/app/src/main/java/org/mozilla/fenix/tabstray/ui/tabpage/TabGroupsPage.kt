/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.tabpage

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

private val EmptyPageWidth = 225.dp

/**
 * UI for displaying the Tab Groups Page in the Tab Manager.
 */
@Composable
internal fun TabGroupsPage() {
    EmptyTabGroupsPage()
}

/**
 * UI for displaying the empty state of the Tab Groups Page in the Tab Manager.
 *
 * @param modifier The [Modifier] to be applied to the layout.
 */
@Composable
private fun EmptyTabGroupsPage(
    modifier: Modifier = Modifier,
) {
    EmptyTabPage(
        modifier = modifier.testTag(TabsTrayTestTag.EMPTY_TAB_GROUPS_LIST),
    ) {
        Column(
            modifier = Modifier.width(EmptyPageWidth),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                painter = painterResource(id = iconsR.drawable.mozac_ic_tab_group_24),
                contentDescription = null,
                modifier = Modifier.size(72.dp),
                tint = MaterialTheme.colorScheme.surfaceContainerHighest,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = stringResource(id = R.string.tab_manager_empty_tab_groups_page_header),
                textAlign = TextAlign.Center,
                style = FirefoxTheme.typography.headline7,
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = stringResource(id = R.string.tab_manager_empty_tab_groups_page_description),
                textAlign = TextAlign.Center,
                style = FirefoxTheme.typography.caption,
            )
        }
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun EmptyTabGroupsPagePreview() {
    FirefoxTheme {
        EmptyTabGroupsPage(modifier = Modifier.background(color = MaterialTheme.colorScheme.surface))
    }
}
