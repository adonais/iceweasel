/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.tabsearch

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.FilledButton
import org.mozilla.fenix.tabstray.TabsTrayAction
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayStore
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * The top-level Composable for the Tab Search feature within the Tab Manager.
 *
 * @param store [TabsTrayStore] used to listen for changes to [TabsTrayState].
 */
@Composable
fun TabSearchScreen(
    store: TabsTrayStore,
) {
    Scaffold { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .padding(all = 16.dp),
        ) {
            Text("Welcome to tab search!")

            Spacer(modifier = Modifier.height(16.dp))

            FilledButton(
                text = "Return to tab manager",
            ) { store.dispatch(TabsTrayAction.NavigateBackInvoked) }
        }
    }
}

private class TabSearchParameterProvider : PreviewParameterProvider<TabsTrayState> {
    override val values = sequenceOf(
        TabsTrayState(),
    )
}

@PreviewLightDark
@Composable
private fun TabSearchScreenPreview(
    @PreviewParameter(TabSearchParameterProvider::class) state: TabsTrayState,
) {
    val store = remember { TabsTrayStore(initialState = state) }

    FirefoxTheme {
        TabSearchScreen(store)
    }
}
