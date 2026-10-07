/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp

/** Media player with controls for Listen To Page feature */
@Composable
fun ListenSheet(modifier: Modifier = Modifier) {
    Box(modifier = modifier.background(color = Color.Cyan).height(60.dp))
}

@Composable
@PreviewLightDark
private fun ListenSheetPreview() {
    ListenSheet()
}
