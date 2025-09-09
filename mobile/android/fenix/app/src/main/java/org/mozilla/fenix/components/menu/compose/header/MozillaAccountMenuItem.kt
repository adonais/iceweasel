/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu.compose.header

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.service.fxa.manager.AccountState
import mozilla.components.service.fxa.manager.AccountState.Authenticated
import mozilla.components.service.fxa.manager.AccountState.Authenticating
import mozilla.components.service.fxa.manager.AccountState.AuthenticationProblem
import mozilla.components.service.fxa.manager.AccountState.NotAuthenticated
import mozilla.components.service.fxa.store.Account
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.Image
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.Theme

private val BUTTON_HEIGHT = 56.dp
private val BUTTON_SHAPE = RoundedCornerShape(size = 4.dp)
private val AVATAR_SIZE = 24.dp

@SuppressWarnings("LongMethod")
@Composable
internal fun MozillaAccountMenuItem(
    account: Account?,
    accountState: AccountState,
    isPrivate: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label: String
    val description: String?
    val contentDescription: String

    when (accountState) {
        NotAuthenticated -> {
            label = stringResource(id = R.string.browser_menu_sign_in)
            description = stringResource(id = R.string.browser_menu_sign_in_caption_3)
        }

        AuthenticationProblem -> {
            label = account?.displayName ?: account?.email
                    ?: stringResource(id = R.string.browser_menu_sign_back_in_to_sync)
            description = stringResource(id = R.string.browser_menu_syncing_paused_caption)
        }

        Authenticated -> {
            label = account?.displayName ?: account?.email
                    ?: stringResource(id = R.string.browser_menu_account_settings)
            description = stringResource(id = R.string.browser_menu_signed_in_caption)
        }

        is Authenticating -> {
            label = ""
            description = null
        }
    }

    contentDescription = if (description != null) "$label $description" else label

    Row(
        modifier = modifier
            .clearAndSetSemantics {
                role = Role.Button
                this.contentDescription = contentDescription
            }
            .wrapContentSize()
            .clip(shape = BUTTON_SHAPE)
            .background(color = FirefoxTheme.colors.layer3)
            .height(IntrinsicSize.Min)
            .defaultMinSize(minHeight = BUTTON_HEIGHT)
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarIcon(account, accountState, isPrivate)

        Spacer(modifier = Modifier.width(16.dp))

        Column(
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = label,
                color = FirefoxTheme.colors.textPrimary,
                overflow = TextOverflow.Ellipsis,
                style = FirefoxTheme.typography.subtitle1.merge(
                    platformStyle = PlatformTextStyle(includeFontPadding = true),
                ),
                maxLines = 2,
            )

            description?.let {
                Text(
                    text = description,
                    color = if (accountState is AuthenticationProblem) {
                        FirefoxTheme.colors.textCritical
                    } else {
                        FirefoxTheme.colors.textSecondary
                    },
                    overflow = TextOverflow.Ellipsis,
                    maxLines = 1,
                    style = FirefoxTheme.typography.body2
                        .merge(
                            textDirection = TextDirection.Content,
                            platformStyle = PlatformTextStyle(includeFontPadding = true),
                        ),
                )
            }
        }
    }
}

@Composable
private fun FallbackAvatarIcon() {
    Icon(
        painter = painterResource(id = R.drawable.mozac_ic_avatar_circle_24),
        contentDescription = null,
        tint = FirefoxTheme.colors.iconPrimary,
    )
}

@Composable
private fun PrivateWarningAvatarIcon() {
    Icon(
        painter = painterResource(id = R.drawable.mozac_ic_avatar_warning_circle_fill_critical_private_24),
        contentDescription = null,
        tint = Color.Unspecified,
    )
}

@Composable
private fun WarningAvatarIcon() {
    Icon(
        painter = painterResource(id = R.drawable.mozac_ic_avatar_warning_circle_fill_critical_24),
        contentDescription = null,
        tint = Color.Unspecified,
    )
}

@Composable
private fun AvatarIcon(
    account: Account?,
    accountState: AccountState,
    isPrivate: Boolean,
) {
    if (accountState is AuthenticationProblem && isPrivate) {
        PrivateWarningAvatarIcon()
    } else if (accountState is AuthenticationProblem) {
        WarningAvatarIcon()
    } else {
        val avatarUrl = account?.avatar?.url

        if (avatarUrl != null) {
            Image(
                url = avatarUrl,
                modifier = Modifier
                    .clip(CircleShape)
                    .size(AVATAR_SIZE),
                targetSize = AVATAR_SIZE,
                placeholder = { FallbackAvatarIcon() },
                fallback = { FallbackAvatarIcon() },
            )
        } else {
            FallbackAvatarIcon()
        }
    }
}

@Composable
private fun MenuHeaderPreviewContent() {
    Column(
        modifier = Modifier
            .background(color = FirefoxTheme.colors.layer2)
            .padding(all = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        MozillaAccountMenuItem(
            account = null,
            accountState = NotAuthenticated,
            isPrivate = false,
            onClick = {},
        )

        MozillaAccountMenuItem(
            account = null,
            accountState = AuthenticationProblem,
            isPrivate = true,
            onClick = {},
        )

        MozillaAccountMenuItem(
            account = Account(
                uid = "testUID",
                avatar = null,
                email = "test@example.com",
                displayName = "test profile",
                currentDeviceId = null,
                sessionToken = null,
            ),
            accountState = Authenticated,
            isPrivate = false,
            onClick = {},
        )

        MozillaAccountMenuItem(
            account = Account(
                uid = "testUID",
                avatar = null,
                email = "test@example.com",
                displayName = null,
                currentDeviceId = null,
                sessionToken = null,
            ),
            accountState = Authenticated,
            isPrivate = false,
            onClick = {},
        )

        MozillaAccountMenuItem(
            account = Account(
                uid = "testUID",
                avatar = null,
                email = null,
                displayName = null,
                currentDeviceId = null,
                sessionToken = null,
            ),
            accountState = Authenticated,
            isPrivate = false,
            onClick = {},
        )
    }
}

@PreviewLightDark
@Composable
private fun MenuHeaderPreview() {
    FirefoxTheme {
        MenuHeaderPreviewContent()
    }
}

@Preview
@Composable
private fun MenuHeaderPrivatePreview() {
    FirefoxTheme(theme = Theme.Private) {
        MenuHeaderPreviewContent()
    }
}
