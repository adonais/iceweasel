/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.trustpanel.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.theme.surfaceDimVariant
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

private val BANNER_IMAGE_SIZE = 80.dp
private val GradientAISubtleStop2Light = Color(0xFFE9DAFB)
private val GradientAISubtleStop3Light = Color(0xFFFFE3CE)
private val GradientAISubtleStop2Dark = Color(0xFFAB71FF)
private val GradientAISubtleStop3Dark = Color(0xFFFF8A50)

@Immutable
private data class ProtectionPanelBannerContent(
    val imageId: Int,
    val title: String,
    val description: String?,
    val backgroundColor: Color,
    val isGradient: Boolean = false,
)

@Composable
private fun protectionPanelBannerContent(
    isSecured: Boolean,
    isTrackingProtectionEnabled: Boolean,
    numberOfTrackersBlocked: Int,
): ProtectionPanelBannerContent {
    val defaultBackground = MaterialTheme.colorScheme.surfaceDimVariant
    val appName = stringResource(id = R.string.app_name_firefox)
    val protectedTitle = stringResource(id = R.string.protection_panel_banner_protected_title, appName)
    return when {
        !isSecured -> ProtectionPanelBannerContent(
            imageId = R.drawable.protection_panel_not_secure,
            title = stringResource(id = R.string.protection_panel_banner_not_secure_title),
            description = stringResource(id = R.string.protection_panel_banner_not_secure_description),
            backgroundColor = defaultBackground,
        )
        !isTrackingProtectionEnabled -> ProtectionPanelBannerContent(
            imageId = R.drawable.protection_panel_not_protected,
            title = stringResource(id = R.string.protection_panel_banner_not_protected_title),
            description = stringResource(
                id = R.string.protection_panel_banner_not_protected_description,
                appName,
            ),
            backgroundColor = MaterialTheme.colorScheme.surfaceContainerHighest,
        )
        else -> ProtectionPanelBannerContent(
            imageId = R.drawable.kit_head_protection_blocker_banner,
            title = protectedTitle,
            description = if (numberOfTrackersBlocked > 0) {
                pluralStringResource(
                    id = R.plurals.protection_panel_banner_protected_blocked_trackers_description,
                    count = numberOfTrackersBlocked,
                    numberOfTrackersBlocked,
                )
            } else {
                stringResource(id = R.string.protection_panel_banner_protected_no_blocked_trackers_description)
            },
            backgroundColor = defaultBackground,
            isGradient = true,
        )
    }
}

@Composable
internal fun ProtectionPanelBanner(
    isSecured: Boolean,
    isTrackingProtectionEnabled: Boolean,
    numberOfTrackersBlocked: Int,
    onClick: (() -> Unit)? = null,
) {
    val content = protectionPanelBannerContent(
        isSecured = isSecured,
        isTrackingProtectionEnabled = isTrackingProtectionEnabled,
        numberOfTrackersBlocked = numberOfTrackersBlocked,
    )
    val mergedContentDescription = if (content.description == null) {
        content.title
    } else {
        "${content.title}. ${content.description}"
    }
    val bannerModifier = Modifier
        .fillMaxWidth()
        .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
        .clearAndSetSemantics {
            contentDescription = mergedContentDescription
            if (onClick != null) {
                role = Role.Button
                onClick { onClick(); true }
            }
        }

    if (content.isGradient) {
        ProtectionPanelGradientBanner(
            title = content.title,
            description = content.description,
            imageId = content.imageId,
            modifier = bannerModifier,
        )
    } else {
        Card(
            modifier = bannerModifier,
            colors = CardDefaults.cardColors(containerColor = content.backgroundColor),
            shape = MaterialTheme.shapes.extraLarge,
        ) {
            ProtectionPanelBannerRow(content = content, showChevron = onClick != null)
        }
    }
}

@Composable
private fun BannerTexts(title: String, description: String?) {
    Text(text = title, style = FirefoxTheme.typography.headline7)
    if (description != null) {
        Text(text = description, style = FirefoxTheme.typography.body2)
    }
}

@Composable
private fun ProtectionPanelBannerRow(
    content: ProtectionPanelBannerContent,
    showChevron: Boolean,
) {
    Row(
        modifier = Modifier.padding(horizontal = FirefoxTheme.layout.space.static200),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            modifier = Modifier.size(BANNER_IMAGE_SIZE),
            painter = painterResource(id = content.imageId),
            contentDescription = null,
        )

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) {
                BannerTexts(title = content.title, description = content.description)
            }
        }

        if (showChevron) {
            Icon(
                painter = painterResource(id = iconsR.drawable.mozac_ic_chevron_right_24),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun ProtectionPanelGradientBanner(
    title: String,
    description: String?,
    imageId: Int,
    modifier: Modifier = Modifier,
) {
    val (stop2, stop3) = if (isSystemInDarkTheme()) {
        GradientAISubtleStop2Dark to GradientAISubtleStop3Dark
    } else {
        GradientAISubtleStop2Light to GradientAISubtleStop3Light
    }
    Box(
        modifier = Modifier
            .clip(MaterialTheme.shapes.extraLarge)
            .background(
                brush = Brush.horizontalGradient(listOf(stop2, stop3)),
            )
            .then(modifier),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = FirefoxTheme.layout.space.static200),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier
                    .padding(vertical = FirefoxTheme.layout.space.static150)
                    .weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                BannerTexts(title = title, description = description)
            }

            Image(
                painter = painterResource(id = imageId),
                contentDescription = null,
                modifier = Modifier.size(BANNER_IMAGE_SIZE),
            )
        }
    }
}

internal data class ProtectionPanelBannerPreviewState(
    val isSecured: Boolean,
    val isTrackingProtectionEnabled: Boolean,
)

internal class ProtectionPanelBannerPreviewProvider : PreviewParameterProvider<ProtectionPanelBannerPreviewState> {
    private val data = listOf(
        "Not secure" to ProtectionPanelBannerPreviewState(
            isSecured = false,
            isTrackingProtectionEnabled = true,
        ),
        "Not protected" to ProtectionPanelBannerPreviewState(
            isSecured = true,
            isTrackingProtectionEnabled = false,
        ),
        "Protected" to ProtectionPanelBannerPreviewState(
            isSecured = true,
            isTrackingProtectionEnabled = true,
        ),
    )

    override val values: Sequence<ProtectionPanelBannerPreviewState>
        get() = data.map { it.second }.asSequence()

    override fun getDisplayName(index: Int): String {
        return data[index].first
    }
}

@PreviewLightDark
@Composable
private fun ProtectionPanelBannerPreview(
    @PreviewParameter(ProtectionPanelBannerPreviewProvider::class) state: ProtectionPanelBannerPreviewState,
) {
    FirefoxTheme {
        Surface {
            Column(
                modifier = Modifier.padding(all = FirefoxTheme.layout.space.static200),
            ) {
                ProtectionPanelBanner(
                    isSecured = state.isSecured,
                    isTrackingProtectionEnabled = state.isTrackingProtectionEnabled,
                    numberOfTrackersBlocked = 5,
                )
            }
        }
    }
}
