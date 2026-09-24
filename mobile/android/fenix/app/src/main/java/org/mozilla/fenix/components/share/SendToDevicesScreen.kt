/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.rememberNestedScrollInteropConnection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.BottomSheetHandle
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.compose.base.button.TextButton
import mozilla.components.concept.sync.Device
import mozilla.components.concept.sync.DeviceType
import mozilla.components.ui.icons.R as IconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.compose.MenuGroup
import org.mozilla.fenix.components.menu.compose.MenuItem
import org.mozilla.fenix.share.ShareViewModel
import org.mozilla.fenix.share.listadapters.SyncShareOption
import org.mozilla.fenix.theme.FirefoxTheme

private val SendToDevicesContentBottomPadding = 64.dp

@Composable
internal fun SendToDevicesContent(
    uiState: ShareViewModel.ShareUiState,
    onDismiss: () -> Unit,
    onSendToDevice: (SyncShareOption.SingleDevice) -> Unit,
    onSendToAll: () -> Unit,
    onSignInClicked: () -> Unit,
    onSignOutClicked: () -> Unit,
) {
    val singleDevices = uiState.devices.filterIsInstance<SyncShareOption.SingleDevice>()
    FirefoxTheme {
        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(
                        start = FirefoxTheme.layout.space.static200,
                        end = FirefoxTheme.layout.space.static200,
                        bottom = SendToDevicesContentBottomPadding,
                    )
                    .nestedScroll(rememberNestedScrollInteropConnection())
        ) {
            Spacer(modifier = Modifier.height(20.dp))

            Column(
                modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                BottomSheetHandle(
                    onRequestDismiss = onDismiss,
                    contentDescription =
                        stringResource(R.string.send_to_devices_bottom_sheet_close_content_description),
                    modifier = Modifier.padding(vertical = 16.dp).align(Alignment.CenterHorizontally),
                )

                Text(
                    text = stringResource(id = R.string.share_device_subheader),
                    style = FirefoxTheme.typography.headline7,
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center,
                    modifier =
                        Modifier.fillMaxWidth()
                            .padding(
                                bottom = 16.dp,
                                top = 8.dp,
                                start = 16.dp,
                                end = 16.dp,
                            ),
                )
            }

            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                when (sendToDevicesUiMode(isLoading = uiState.isLoading, devices = uiState.devices)) {
                    SendToDevicesUiMode.Loading -> LoadingScreen()
                    SendToDevicesUiMode.Offline -> NoInternetConnectionScreen()
                    SendToDevicesUiMode.Reconnect,
                    SendToDevicesUiMode.SignIn -> ReconnectToSyncScreen(onSignInClicked, onSignOutClicked)
                    SendToDevicesUiMode.NoDevices -> NoDevicesAvailableScreen()
                    SendToDevicesUiMode.DeviceList -> {
                        DeviceList(
                            devices = singleDevices,
                            onDeviceClick = onSendToDevice,
                        )
                        if (singleDevices.size > 1) {
                            Spacer(modifier = Modifier.size(8.dp))
                            SendToAllItem(onSendToAll = onSendToAll)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceList(
    devices: List<SyncShareOption.SingleDevice>,
    onDeviceClick: (SyncShareOption.SingleDevice) -> Unit,
) {
    MenuGroup {
        for (option in devices) {
            MenuItem(
                label = option.device.displayName,
                beforeIconPainter =
                    painterResource(
                        id =
                            if (option.device.deviceType == DeviceType.MOBILE) {
                                IconsR.drawable.mozac_ic_device_mobile_24
                            } else {
                                IconsR.drawable.mozac_ic_device_desktop_24
                            }
                    ),
                onClick = { onDeviceClick(option) },
            )
        }
    }
}

@Composable
private fun SendToAllItem(onSendToAll: () -> Unit) {
    MenuGroup {
        MenuItem(
            label = stringResource(id = R.string.sync_send_to_all),
            beforeIconPainter = painterResource(id = IconsR.drawable.mozac_ic_select_all_24),
            onClick = onSendToAll,
        )
    }
}

@Composable
private fun LoadingScreen() {
    Column(modifier = Modifier.fillMaxWidth()) {
        CircularProgressIndicator(
            modifier =
                Modifier.align(Alignment.CenterHorizontally).padding(vertical = FirefoxTheme.layout.space.static500)
        )
    }
}

@Composable
private fun NoDevicesAvailableScreen() {
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Image(
            painter = painterResource(id = R.drawable.kit_devices_sync),
            contentDescription = null,
            modifier = Modifier.width(210.dp).align(Alignment.CenterHorizontally),
        )

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = stringResource(id = R.string.sync_send_tab_empty_state_title),
                style = FirefoxTheme.typography.headline6,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            Column(modifier = Modifier.width(284.dp).align(alignment = Alignment.CenterHorizontally)) {
                Text(
                    text = stringResource(id = R.string.sync_send_tab_empty_state_description),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.secondary,
                    style = FirefoxTheme.typography.body2,
                )
            }
        }
    }
}

@Composable
private fun ReconnectToSyncScreen(
    onSignInClicked: () -> Unit,
    onSignOutClicked: () -> Unit,
) {
    Column(
        modifier =
            Modifier.padding(
                start = FirefoxTheme.layout.space.static200,
                end = FirefoxTheme.layout.space.static200,
            ),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Image(
            painter = painterResource(id = R.drawable.kit_devices_sync_error),
            contentDescription = null,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )
        Text(
            text = stringResource(R.string.sync_send_tab_error_auth_title),
            style = FirefoxTheme.typography.headline6,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            modifier =
                Modifier.fillMaxWidth()
                    .padding(
                        start = FirefoxTheme.layout.space.static400,
                        end = FirefoxTheme.layout.space.static400,
                    ),
        )
    }
    Spacer(modifier = Modifier.size(20.dp))
    Column(
        verticalArrangement = Arrangement.spacedBy(FirefoxTheme.layout.space.static150),
        modifier = Modifier.fillMaxWidth(),
    ) {
        FilledButton(
            text = stringResource(R.string.sync_send_tab_error_auth_button),
            onClick = onSignInClicked,
            containerColor = MaterialTheme.colorScheme.primary,
            modifier = Modifier.width(284.dp).height(40.dp).align(alignment = Alignment.CenterHorizontally),
        )
        TextButton(
            text = stringResource(R.string.sync_send_tab_error_auth_remove_account),
            onClick = onSignOutClicked,
            modifier = Modifier.width(284.dp).height(40.dp).align(alignment = Alignment.CenterHorizontally),
        )
    }
}

@Composable
private fun NoInternetConnectionScreen() {
    Column(
        verticalArrangement = Arrangement.spacedBy(20.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Image(
            painter = painterResource(id = R.drawable.kit_plug_error),
            contentDescription = null,
            modifier = Modifier.width(176.dp).align(Alignment.CenterHorizontally),
        )
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.width(284.dp).align(Alignment.CenterHorizontally),
        ) {
            Text(
                text = stringResource(id = R.string.sync_send_tab_error_connection_title),
                style = FirefoxTheme.typography.headline6,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = stringResource(id = R.string.sync_send_tab_error_connection_text),
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.secondary,
                style = FirefoxTheme.typography.body2,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun previewDevice(name: String, type: DeviceType) =
    SyncShareOption.SingleDevice(
        device =
            Device(
                id = name,
                displayName = name,
                deviceType = type,
                isCurrentDevice = false,
                lastAccessTime = null,
                capabilities = emptyList(),
                subscriptionExpired = false,
                subscription = null,
            )
    )

@PreviewLightDark
@Composable
private fun SendToDevicesContentWithDevicesPreview() {
    FirefoxTheme {
        Surface {
            SendToDevicesContent(
                uiState =
                    ShareViewModel.ShareUiState(
                        devices =
                            listOf(
                                previewDevice("My Phone", DeviceType.MOBILE),
                                previewDevice("My Laptop", DeviceType.DESKTOP),
                            )
                    ),
                onDismiss = {},
                onSendToDevice = {},
                onSendToAll = {},
                onSignInClicked = {},
                onSignOutClicked = {},
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun SendToDevicesContentNoDevicesPreview() {
    FirefoxTheme {
        Surface {
            SendToDevicesContent(
                uiState = ShareViewModel.ShareUiState(devices = emptyList()),
                onDismiss = {},
                onSendToDevice = {},
                onSendToAll = {},
                onSignInClicked = {},
                onSignOutClicked = {},
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun SendToDevicesContentReconnectToSyncPreview() {
    FirefoxTheme {
        Surface {
            SendToDevicesContent(
                uiState = ShareViewModel.ShareUiState(devices = listOf(SyncShareOption.Reconnect)),
                onDismiss = {},
                onSendToDevice = {},
                onSendToAll = {},
                onSignInClicked = {},
                onSignOutClicked = {},
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun SendToDevicesContentNoInternetPreview() {
    FirefoxTheme {
        Surface {
            SendToDevicesContent(
                uiState = ShareViewModel.ShareUiState(devices = listOf(SyncShareOption.Offline)),
                onDismiss = {},
                onSendToDevice = {},
                onSendToAll = {},
                onSignInClicked = {},
                onSignOutClicked = {},
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun SendToDevicesLoadingPreview() {
    FirefoxTheme {
        Surface {
            SendToDevicesContent(
                uiState = ShareViewModel.ShareUiState(isLoading = true),
                onDismiss = {},
                onSendToDevice = {},
                onSendToAll = {},
                onSignInClicked = {},
                onSignOutClicked = {},
            )
        }
    }
}
