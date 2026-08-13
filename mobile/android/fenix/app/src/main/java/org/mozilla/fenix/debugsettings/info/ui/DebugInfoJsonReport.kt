/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.debugsettings.info.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import mozilla.components.compose.base.button.IconButton
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.PreviewThemeProvider
import org.mozilla.fenix.theme.Theme
import mozilla.components.ui.icons.R as iconsR

/**
 * Displays the debug info as a JSON report.
 *
 * @param json The JSON report of the debug info to display.
 * @param onBackClick Invoked when the user navigates back.
 */
@Composable
internal fun DebugInfoJsonReport(
    json: String,
    onBackClick: () -> Unit,
) {
    BackHandler(onBack = onBackClick)

    Column {
        Header(
            json = json,
            onBackClick = onBackClick,
        )

        Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static150))

        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = FirefoxTheme.layout.space.static200)
                .padding(bottom = FirefoxTheme.layout.space.static400),
        ) {
            SelectionContainer {
                Text(
                    text = json,
                    style = FirefoxTheme.typography.body2,
                )
            }
        }
    }
}

@Composable
private fun Header(
    json: String,
    onBackClick: () -> Unit,
) {
    val context = LocalContext.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = onBackClick,
            contentDescription = stringResource(
                id = R.string.debug_drawer_back_button_content_description,
            ),
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_back_24),
                contentDescription = null,
            )
        }

        Text(
            text = stringResource(id = R.string.debug_info_json_title),
            style = FirefoxTheme.typography.headline5,
            modifier = Modifier.weight(1f),
        )

        IconButton(
            onClick = {
                context.components.clipboardHandler.text = json
            },
            contentDescription = "",
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_copy_24),
                contentDescription = null,
            )
        }
    }
}

@Preview
@Composable
private fun DebugInfoJsonReportPreview(
    @PreviewParameter(PreviewThemeProvider::class) theme: Theme,
) {
    FirefoxTheme(theme = theme) {
        Surface {
            DebugInfoJsonReport(
                json = "{\n  \"Application\": {\n    \"Version\": \"142.0\"\n  }\n}",
                onBackClick = {},
            )
        }
    }
}
