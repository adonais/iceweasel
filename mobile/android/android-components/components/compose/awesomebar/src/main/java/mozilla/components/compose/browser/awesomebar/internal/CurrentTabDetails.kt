/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.awesomebar.internal

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CornerSize
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.browser.awesomebar.AwesomeBarTestTags.COPY_CURRENT_SITE_DETAILS_BUTTON
import mozilla.components.compose.browser.awesomebar.AwesomeBarTestTags.CURRENT_SITE_DETAILS
import mozilla.components.compose.browser.awesomebar.AwesomeBarTestTags.CURRENT_URL_IN_SITE_DETAILS
import mozilla.components.compose.browser.awesomebar.AwesomeBarTestTags.EDIT_CURRENT_SITE_URL_BUTTON
import mozilla.components.compose.browser.awesomebar.AwesomeBarTestTags.SHARE_CURRENT_SITE_DETAILS_BUTTON
import mozilla.components.compose.browser.awesomebar.R
import mozilla.components.compose.browser.awesomebar.internal.CurrentTabDetailsInteractions.CopyClicked
import mozilla.components.compose.browser.awesomebar.internal.CurrentTabDetailsInteractions.DetailsClicked
import mozilla.components.compose.browser.awesomebar.internal.CurrentTabDetailsInteractions.EditClicked
import mozilla.components.compose.browser.awesomebar.internal.CurrentTabDetailsInteractions.ShareClicked
import mozilla.components.support.ktx.util.URLStringUtils
import mozilla.components.ui.icons.R as iconsR

/**
 * A composable that displays the current tab details in the AwesomeBar.
 *
 * @param currentTabData The current tab details to be displayed.
 * @param onInteraction Invoked when the user interacts with any of the shown buttons.
 * @param modifier The modifier to be applied to the composable.
 */
@Composable
@Suppress("LongMethod")
internal fun CurrentTabDetails(
    currentTabData: CurrentTabData,
    onInteraction: (CurrentTabDetailsInteractions) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .background(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = MaterialTheme.shapes.extraLarge.copy(CornerSize(56.dp)),
                )
                .fillMaxWidth()
                .defaultMinSize(minHeight = 56.dp)
                .padding(
                    horizontal = AcornTheme.layout.space.static50,
                    vertical = AcornTheme.layout.space.static100,
                )
                .semantics {
                    collectionInfo =
                        CollectionInfo(
                            rowCount = 1,
                            columnCount = 4,
                        )
                },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier =
                Modifier.weight(1f)
                    .clickable(
                        onClickLabel = stringResource(R.string.mozac_browser_awesomebar_reload_website),
                        role = Role.Button,
                    ) {
                        onInteraction(DetailsClicked)
                    }
                    .clearAndSetSemantics {
                        contentDescription =
                            when (currentTabData.title.isNotBlank()) {
                                true -> currentTabData.title
                                else -> currentTabData.url
                            }
                        testTag = CURRENT_SITE_DETAILS
                    },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val icon = currentTabData.icon

            Image(
                painter =
                    when (icon) {
                        null -> painterResource(iconsR.drawable.mozac_ic_globe_24)
                        else -> remember(icon) { BitmapPainter(icon.asImageBitmap()) }
                    },
                contentDescription = null,
                colorFilter =
                    when (icon) {
                        null -> ColorFilter.tint(MaterialTheme.colorScheme.onSurfaceVariant)
                        else -> null
                    },
                modifier =
                    Modifier.padding(AcornTheme.layout.space.static100)
                        .size(AcornTheme.layout.space.static400)
                        .padding(AcornTheme.layout.space.static50),
            )

            Column {
                if (currentTabData.title.isNotBlank()) {
                    Text(
                        text = currentTabData.title,
                        style = AcornTheme.typography.body1,
                        overflow = TextOverflow.Ellipsis,
                        maxLines = 1,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }

                Text(
                    text = URLStringUtils.toDisplayUrl(currentTabData.url).toString(),
                    modifier = Modifier.testTag(CURRENT_URL_IN_SITE_DETAILS),
                    style = AcornTheme.typography.body2,
                    overflow = TextOverflow.Ellipsis,
                    maxLines = 1,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        IconButton(
            onClick = { onInteraction(ShareClicked) },
            contentDescription = stringResource(R.string.mozac_browser_awesomebar_share_website_details),
            modifier = Modifier.size(AcornTheme.layout.space.static600).testTag(SHARE_CURRENT_SITE_DETAILS_BUTTON),
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_share_android_24),
                contentDescription = null,
                modifier = Modifier.size(AcornTheme.layout.space.static300),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        IconButton(
            onClick = { onInteraction(CopyClicked) },
            contentDescription = stringResource(R.string.mozac_browser_awesomebar_copy_website_details),
            modifier = Modifier.size(AcornTheme.layout.space.static600).testTag(COPY_CURRENT_SITE_DETAILS_BUTTON),
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_copy_24),
                contentDescription = null,
                modifier = Modifier.size(AcornTheme.layout.space.static300),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        IconButton(
            onClick = { onInteraction(EditClicked) },
            contentDescription = stringResource(R.string.mozac_browser_awesomebar_edit_website_details),
            modifier = Modifier.size(AcornTheme.layout.space.static600).testTag(EDIT_CURRENT_SITE_URL_BUTTON),
        ) {
            Icon(
                painter = painterResource(iconsR.drawable.mozac_ic_edit_24),
                contentDescription = null,
                modifier = Modifier.size(AcornTheme.layout.space.static300),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
@PreviewLightDark
private fun CurrentTabDetailsPreview() {
    AcornTheme {
        Surface(modifier = Modifier.background(MaterialTheme.colorScheme.surface)) {
            CurrentTabDetails(
                CurrentTabData(
                    title = "Headline",
                    url = "https://www.mozilla.org/firefox/android",
                    icon = null,
                ),
                onInteraction = {},
            )
        }
    }
}

@Composable
@PreviewLightDark
private fun CurrentTabDetailsWithUrlOnlyPreview() {
    AcornTheme {
        Surface(modifier = Modifier.background(MaterialTheme.colorScheme.surface)) {
            CurrentTabDetails(
                CurrentTabData(
                    title = "",
                    url = "https://www.mozilla.org/firefox/android",
                    icon = null,
                ),
                onInteraction = {},
            )
        }
    }
}

/**
 * Current tab details to be shown in the AwesomeBar.
 *
 * @property title The title of the current tab.
 * @property url The URL of the current tab.
 * @property icon The icon of the current tab.
 */
data class CurrentTabData(
    val title: String,
    val url: String,
    val icon: Bitmap?,
)

/** All possible interactions with the View showing the current website details and controls. */
sealed class CurrentTabDetailsInteractions {
    /** Indicates the user clicked on the current website (icon, title, URL) details. */
    data object DetailsClicked : CurrentTabDetailsInteractions()

    /** Indicates the user clicked on the "share" button. */
    data object ShareClicked : CurrentTabDetailsInteractions()

    /** Indicates the user clicked on the "copy" button. */
    data object CopyClicked : CurrentTabDetailsInteractions()

    /** Indicates the user clicked on the "edit" button. */
    data object EditClicked : CurrentTabDetailsInteractions()
}
