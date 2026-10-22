/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.text.Text
import mozilla.components.compose.base.text.value
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.menu.data.MenuAttribution
import mozilla.components.ui.icons.R as iconsR

private val ATTRIBUTION_ICON_SIZE = 16.dp

/** The application the menu is shown on behalf of, shown with its icon before its title. */
@Composable
internal fun MenuAttribution(attribution: MenuAttribution) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = AcornTheme.layout.space.static100),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        attribution.icon?.let { icon ->
            Image(
                painter = icon.painter,
                contentDescription = null,
                modifier = Modifier.size(ATTRIBUTION_ICON_SIZE),
            )

            Spacer(Modifier.width(AcornTheme.layout.space.static50))
        }

        Text(
            text = attribution.title.value,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = AcornTheme.typography.caption,
        )
    }
}

@PreviewLightDark
@Composable
private fun MenuAttributionPreview() {
    AcornTheme {
        Surface {
            MenuAttribution(
                MenuAttribution(
                    title = Text.String("Powered by Mozilla"),
                    icon = MenuItemIconRes(iconsR.drawable.mozac_ic_logo_firefox_24),
                    showAtTop = false,
                )
            )
        }
    }
}
