/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.logins.ui

import android.util.Patterns
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.textfield.TextField
import mozilla.components.lib.state.ext.observeAsState
import mozilla.components.support.ktx.util.URLStringUtils.isHttpOrHttps
import mozilla.components.support.ktx.util.URLStringUtils.isValidHost
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme
import mozilla.components.ui.icons.R as iconsR

@Composable
internal fun AddLoginScreen(store: LoginsStore) {
    Scaffold(
        topBar = {
            AddLoginTopBar(store)
        },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static200))
            AddLoginHost(store = store)
            Spacer(modifier = Modifier.height(8.dp))
            AddLoginUsername(store = store)
            Spacer(modifier = Modifier.height(8.dp))
            AddLoginPassword(store = store)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddLoginTopBar(store: LoginsStore) {
    val state by store.observeAsState(store.state.loginsAddLoginState) { it.loginsAddLoginState }
    val host = state?.host ?: ""
    val username = state?.username ?: ""
    val password = state?.password ?: ""
    val isLoginValid = isValidHost(host) && username.isNotBlank() && password.isNotBlank()

    TopAppBar(
        windowInsets = WindowInsets(
            top = 0.dp,
            bottom = 0.dp,
        ),
        title = {
            Text(
                text = stringResource(R.string.add_login_2),
                style = FirefoxTheme.typography.headline5,
            )
        },
        navigationIcon = {
            IconButton(
                onClick = { store.dispatch(AddLoginBackClicked) },
                contentDescription = stringResource(
                    R.string.add_login_navigate_back_button_content_description,
                ),
            ) {
                Icon(
                    painter = painterResource(iconsR.drawable.mozac_ic_back_24),
                    contentDescription = null,
                )
            }
        },
        actions = {
            IconButton(
                onClick = {
                    store.dispatch(
                        AddLoginAction.AddLoginSaveClicked,
                    )
                },
                contentDescription = stringResource(
                    R.string.add_login_save_new_login_button_content_description,
                ),
                enabled = isLoginValid,
            ) {
                Icon(
                    painter = painterResource(iconsR.drawable.mozac_ic_checkmark_24),
                    contentDescription = null,
                )
            }
        },
    )
}

@Composable
private fun AddLoginHost(store: LoginsStore) {
    val state by store.observeAsState(store.state.loginsAddLoginState) { it.loginsAddLoginState }
    val host = state?.host ?: ""
    var isFocused by remember { mutableStateOf(false) }

    TextField(
        value = host,
        onValueChange = { newHost ->
            store.dispatch(AddLoginAction.HostChanged(newHost))
        },
        placeholder = stringResource(R.string.add_login_hostname_hint_text),
        errorText = stringResource(R.string.add_login_hostname_invalid_text_2),
        isError = host.isNotBlank() && !Patterns.WEB_URL.matcher(host).matches(),
        modifier = Modifier
            .onFocusChanged { isFocused = it.isFocused }
            .padding(
                horizontal = FirefoxTheme.layout.space.static200,
                vertical = FirefoxTheme.layout.space.static100,
            )
            .width(FirefoxTheme.layout.size.containerMaxWidth),
        label = stringResource(R.string.preferences_passwords_saved_logins_site),
        trailingIcon = {
            if (isFocused && isValidHost(host)) {
                CrossTextFieldButton { store.dispatch(AddLoginAction.HostChanged("")) }
            }
        },
    )

    if ((host.isEmpty() || isValidHost(host)) && !isHttpOrHttps(host)) {
        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = stringResource(R.string.add_login_hostname_invalid_text_3),
            modifier = Modifier
                .padding(horizontal = FirefoxTheme.layout.space.static200)
                .width(FirefoxTheme.layout.size.containerMaxWidth),
        )
    }
}

@Composable
private fun AddLoginUsername(store: LoginsStore) {
    val addLoginState by store.observeAsState(store.state.loginsAddLoginState) { it.loginsAddLoginState }
    val newLoginState by store.observeAsState(store.state.newLoginState) { it.newLoginState }
    val username = addLoginState?.username ?: ""
    var isFocused by remember { mutableStateOf(false) }

    TextField(
        value = username,
        onValueChange = { newUsername ->
            store.dispatch(AddLoginAction.UsernameChanged(newUsername))
        },
        placeholder = "",
        errorText = stringResource(R.string.saved_login_duplicate),
        isError = newLoginState == NewLoginState.Duplicate,
        modifier = Modifier
            .onFocusChanged { isFocused = it.isFocused }
            .padding(
                horizontal = FirefoxTheme.layout.space.static200,
                vertical = FirefoxTheme.layout.space.static100,
            )
            .width(FirefoxTheme.layout.size.containerMaxWidth),
        label = stringResource(R.string.preferences_passwords_saved_logins_username),
        trailingIcon = {
            if (isFocused && addLoginState?.username?.isNotEmpty() == true) {
                CrossTextFieldButton { store.dispatch(AddLoginAction.UsernameChanged("")) }
            }
        },
    )
}

@Composable
private fun AddLoginPassword(store: LoginsStore) {
    val state by store.observeAsState(store.state.loginsAddLoginState) { it.loginsAddLoginState }
    val password = state?.password ?: ""
    var isFocused by remember { mutableStateOf(false) }

    TextField(
        value = password,
        onValueChange = { newPassword ->
            store.dispatch(AddLoginAction.PasswordChanged(newPassword))
        },
        placeholder = "",
        errorText = stringResource(R.string.saved_login_password_required_2),
        isError = isFocused && password.isBlank(),
        modifier = Modifier
            .onFocusChanged { isFocused = it.isFocused }
            .padding(
                horizontal = FirefoxTheme.layout.space.static200,
                vertical = FirefoxTheme.layout.space.static100,
            )
            .width(FirefoxTheme.layout.size.containerMaxWidth),
        label = stringResource(R.string.preferences_passwords_saved_logins_password),
        trailingIcon = {
            if (isFocused && state?.password?.isNotEmpty() == true) {
                CrossTextFieldButton { store.dispatch(AddLoginAction.PasswordChanged("")) }
            }
        },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
    )
}

@Composable
@FlexibleWindowLightDarkPreview
private fun AddLoginScreenPreview() {
    val store = LoginsStore(
        initialState = LoginsState.default,
    )
    FirefoxTheme {
        AddLoginScreen(store)
    }
}

@Composable
@Preview
private fun AddLoginScreenPrivatePreview() {
    val store = LoginsStore(
        initialState = LoginsState.default,
    )
    FirefoxTheme(theme = Theme.Private) {
        AddLoginScreen(store)
    }
}
