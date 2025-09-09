/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.fab

import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.ExtendedFloatingActionButton
import mozilla.components.compose.base.button.FloatingActionButtonDefaults
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayState.Mode
import org.mozilla.fenix.tabstray.TabsTrayStore
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.theme.FirefoxTheme
import androidx.compose.material3.FloatingActionButtonDefaults as M3FloatingActionButtonDefaults

/**
 * Floating action button for the Tab Manager.
 *
 * @param tabsTrayStore [TabsTrayStore] used to listen for changes to [TabsTrayState].
 * @param isSignedIn Whether the user is signed into their Firefox account.
 * @param modifier The [Modifier] to be applied to this FAB.
 * @param expanded Controls the expansion state of this FAB. In an expanded state, the FAB will
 * show both the icon and text. In a collapsed state, the FAB will show only the icon.
 * @param onOpenNewNormalTabClicked Invoked when the fab is clicked in [Page.NormalTabs].
 * @param onOpenNewPrivateTabClicked Invoked when the fab is clicked in [Page.PrivateTabs].
 * @param onSyncedTabsFabClicked Invoked when the fab is clicked in [Page.SyncedTabs].
 */
@Composable
internal fun TabsTrayFab(
    tabsTrayStore: TabsTrayStore,
    isSignedIn: Boolean,
    modifier: Modifier = Modifier,
    expanded: Boolean = true,
    onOpenNewNormalTabClicked: () -> Unit,
    onOpenNewPrivateTabClicked: () -> Unit,
    onSyncedTabsFabClicked: () -> Unit,
) {
    val state by tabsTrayStore.observeAsState(initialValue = tabsTrayStore.state) { it }

    AnimatedVisibility(
        visible = state.mode is Mode.Normal,
    ) {
        @DrawableRes val icon: Int
        val contentDescription: String
        val label: String
        var colors = FloatingActionButtonDefaults.colorsPrimary()
        var elevation = if (expanded) {
            M3FloatingActionButtonDefaults.loweredElevation(
                defaultElevation = 0.dp,
            )
        } else {
            M3FloatingActionButtonDefaults.elevation()
        }
        val onClick: () -> Unit
        when (state.selectedPage) {
            Page.NormalTabs -> {
                icon = R.drawable.mozac_ic_plus_24
                contentDescription = stringResource(id = R.string.add_tab)
                label = stringResource(id = R.string.tab_manager_floating_action_button_new_normal_tab)
                onClick = onOpenNewNormalTabClicked
            }

            Page.PrivateTabs -> {
                icon = R.drawable.mozac_ic_plus_24
                contentDescription = stringResource(id = R.string.add_private_tab)
                label = stringResource(id = R.string.tab_manager_floating_action_button_new_private_tab)
                onClick = onOpenNewPrivateTabClicked
            }

            Page.SyncedTabs -> {
                icon = R.drawable.mozac_ic_sync_24
                contentDescription = stringResource(id = R.string.resync_button_content_description)
                label = stringResource(id = R.string.tab_manager_floating_action_button_sync_tabs)
                onClick = onSyncedTabsFabClicked
                if (!isSignedIn) {
                    colors = FloatingActionButtonDefaults.colorsDisabled()
                    elevation = M3FloatingActionButtonDefaults.elevation(
                        defaultElevation = 0.dp,
                        pressedElevation = 0.dp,
                        focusedElevation = 0.dp,
                        hoveredElevation = 0.dp,
                    )
                }
            }
        }

        ExtendedFloatingActionButton(
            label = label,
            icon = icon,
            contentDescription = contentDescription,
            onClick = onClick,
            modifier = modifier.testTag(TabsTrayTestTag.FAB),
            expanded = expanded,
            colors = colors,
            elevation = elevation,
        )
    }
}

private data class TabsTrayFabPreviewDataModel(
    val state: TabsTrayState,
    val expanded: Boolean,
    val isSignedIn: Boolean = true,
)

private class TabsTrayFabParameterProvider : PreviewParameterProvider<TabsTrayFabPreviewDataModel> {
    override val values: Sequence<TabsTrayFabPreviewDataModel>
        get() = sequenceOf(
            TabsTrayFabPreviewDataModel(
                state = TabsTrayState(selectedPage = Page.NormalTabs),
                expanded = false,
            ),
            TabsTrayFabPreviewDataModel(
                state = TabsTrayState(selectedPage = Page.NormalTabs),
                expanded = true,
            ),
            TabsTrayFabPreviewDataModel(
                state = TabsTrayState(selectedPage = Page.PrivateTabs),
                expanded = false,
            ),
            TabsTrayFabPreviewDataModel(
                state = TabsTrayState(selectedPage = Page.PrivateTabs),
                expanded = true,
            ),
            TabsTrayFabPreviewDataModel(
                state = TabsTrayState(selectedPage = Page.SyncedTabs),
                expanded = false,
            ),
            TabsTrayFabPreviewDataModel(
                state = TabsTrayState(selectedPage = Page.SyncedTabs),
                expanded = true,
            ),
            TabsTrayFabPreviewDataModel(
                state = TabsTrayState(selectedPage = Page.SyncedTabs),
                expanded = false,
                isSignedIn = false,
            ),
            TabsTrayFabPreviewDataModel(
                state = TabsTrayState(selectedPage = Page.SyncedTabs),
                expanded = true,
                isSignedIn = false,
            ),
        )
}

@Preview
@Composable
private fun TabsTrayFabPreview(
    @PreviewParameter(TabsTrayFabParameterProvider::class) previewDataModel: TabsTrayFabPreviewDataModel,
) {
    FirefoxTheme {
        TabsTrayFab(
            tabsTrayStore = remember { TabsTrayStore(initialState = previewDataModel.state) },
            expanded = previewDataModel.expanded,
            isSignedIn = previewDataModel.isSignedIn,
            modifier = Modifier
                .background(color = MaterialTheme.colorScheme.surfaceContainerHigh)
                .padding(all = 16.dp),
            onOpenNewNormalTabClicked = {},
            onOpenNewPrivateTabClicked = {},
            onSyncedTabsFabClicked = {},
        )
    }
}
