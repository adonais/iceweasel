/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.logins.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.textfield.TextField
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme
import mozilla.components.ui.icons.R as iconsR

@Composable
internal fun EditLoginScreen(store: LoginsStore) {
    val state by store.observeAsState(store.state) { it }
    val editState = state.loginsEditLoginState ?: return

    Scaffold(
        topBar = {
            EditLoginTopBar(
                store = store,
                loginItem = editState.login,
            )
        },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static200))
            EditLoginUrl(url = editState.login.url)
            Spacer(modifier = Modifier.height(8.dp))
            EditLoginUsername(store = store, user = editState.login.username)
            Spacer(modifier = Modifier.height(8.dp))
            EditLoginPassword(store = store, pass = editState.login.password)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EditLoginTopBar(store: LoginsStore, loginItem: LoginItem) {
    val state by store.observeAsState(store.state.loginsEditLoginState) { it.loginsEditLoginState }
    val username = state?.newUsername ?: loginItem.username
    val password = state?.newPassword ?: loginItem.password

    val validModifiedUser = username.isNotBlank() && username != loginItem.username
    val validModifiedPassword = password.isNotBlank() && password != loginItem.password
    val isLoginValid = validModifiedUser || validModifiedPassword

    TopAppBar(
        windowInsets = WindowInsets(
            top = 0.dp,
            bottom = 0.dp,
        ),
        title = {
            Text(
                text = stringResource(R.string.edit_2),
                style = FirefoxTheme.typography.headline5,
            )
        },
        navigationIcon = {
            IconButton(
                onClick = { store.dispatch(EditLoginBackClicked) },
                contentDescription = stringResource(
                    R.string.edit_login_navigate_back_button_content_description,
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
                        EditLoginAction.SaveEditClicked(loginItem),
                    )
                },
                contentDescription = stringResource(
                    R.string.edit_login_button_content_description,
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
private fun EditLoginUrl(url: String) {
    Text(
        text = stringResource(R.string.preferences_passwords_saved_logins_site),
        style = AcornTheme.typography.caption,
        color = AcornTheme.colors.textPrimary,
        modifier = Modifier
            .padding(horizontal = FirefoxTheme.layout.space.static200)
            .width(FirefoxTheme.layout.size.containerMaxWidth),
    )

    Text(
        text = url,
        style = AcornTheme.typography.subtitle1,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        modifier = Modifier
            .padding(
                horizontal = FirefoxTheme.layout.space.static200,
                vertical = FirefoxTheme.layout.space.static100,
            )
            .width(FirefoxTheme.layout.size.containerMaxWidth),
    )
}

@Composable
private fun EditLoginUsername(store: LoginsStore, user: String) {
    val editState by store.observeAsState(store.state.loginsEditLoginState) { it.loginsEditLoginState }
    val username = editState?.newUsername ?: user

    TextField(
        value = username,
        onValueChange = { newUsername ->
            store.dispatch(EditLoginAction.UsernameChanged(newUsername))
        },
        placeholder = "",
        errorText = stringResource(R.string.saved_login_username_required_2),
        isError = username.isBlank(),
        modifier = Modifier
            .padding(
                horizontal = FirefoxTheme.layout.space.static200,
                vertical = FirefoxTheme.layout.space.static100,
            )
            .width(FirefoxTheme.layout.size.containerMaxWidth),
        label = stringResource(R.string.preferences_passwords_saved_logins_username),
        trailingIcon = {
            if (editState?.newUsername?.isNotEmpty() == true) {
                CrossTextFieldButton {
                    store.dispatch(EditLoginAction.UsernameChanged(""))
                }
            }
        },
    )
}

@Composable
private fun EditLoginPassword(store: LoginsStore, pass: String) {
    val editState by store.observeAsState(store.state.loginsEditLoginState) { it.loginsEditLoginState }
    val isPasswordVisible = editState?.isPasswordVisible ?: true
    val password = editState?.newPassword ?: pass

    Row(verticalAlignment = Alignment.CenterVertically) {
        TextField(
            value = password,
            onValueChange = { newPassword ->
                store.dispatch(EditLoginAction.PasswordChanged(newPassword))
            },
            placeholder = "",
            errorText = stringResource(R.string.saved_login_password_required_2),
            isError = password.isBlank(),
            modifier = Modifier
                .padding(
                    horizontal = FirefoxTheme.layout.space.static200,
                    vertical = FirefoxTheme.layout.space.static100,
                )
                .width(FirefoxTheme.layout.size.containerMaxWidth),
            label = stringResource(R.string.preferences_passwords_saved_logins_password),
            trailingIcon = {
                EyePasswordIconButton(
                    isPasswordVisible = isPasswordVisible,
                    onTrailingIconClick = {
                        store.dispatch(
                            EditLoginAction.PasswordVisibilityChanged(
                                !isPasswordVisible,
                            ),
                        )
                    },
                )
                if (editState?.newPassword?.isNotEmpty() == true) {
                    CrossTextFieldButton {
                        store.dispatch(EditLoginAction.PasswordChanged(""))
                    }
                }
            },
            visualTransformation = if (isPasswordVisible) {
                VisualTransformation.None
            } else {
                PasswordVisualTransformation()
            },
        )
    }
}

private fun createStore() = LoginsStore(
    initialState = LoginsState.default.copy(
        loginsEditLoginState = LoginsEditLoginState(
            login = LoginItem(
                guid = "123",
                url = "https://www.justanothersite123.com",
                username = "username 123",
                password = "password 123",
            ),
            newUsername = "username 456",
            newPassword = "password 456",
            isPasswordVisible = true,
        ),
    ),
)

@Composable
@FlexibleWindowLightDarkPreview
private fun EditLoginScreenPreview() {
    FirefoxTheme {
        Surface {
            EditLoginScreen(store = createStore())
        }
    }
}

@Composable
@Preview
private fun EditLoginScreenPrivatePreview() {
    FirefoxTheme(theme = Theme.Private) {
        Surface {
            EditLoginScreen(store = createStore())
        }
    }
}
