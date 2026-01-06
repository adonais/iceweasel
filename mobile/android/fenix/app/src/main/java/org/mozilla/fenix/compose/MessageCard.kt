/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.compose

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.service.nimbus.messaging.Message
import org.mozilla.fenix.R
import org.mozilla.fenix.home.fake.FakeHomepagePreview
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.wallpapers.Wallpaper
import org.mozilla.fenix.wallpapers.WallpaperState
import mozilla.components.ui.icons.R as iconsR

/**
 * State-based Message Card.
 *
 * @param messageCardState State representing the card.
 * @param modifier Modifier to be applied to the card.
 * @param onClick Invoked when user clicks on the message card.
 * @param onCloseButtonClick Invoked when user clicks on close button to remove message.
 */
@Composable
fun MessageCard(
    messageCardState: MessageCardState,
    modifier: Modifier = Modifier,
    onClick: () -> Unit = {},
    onCloseButtonClick: () -> Unit = {},
) {
    with(messageCardState) {
        MessageCard(
            messageText = messageText,
            modifier = modifier,
            titleText = titleText,
            buttonText = buttonText,
            messageColors = messageColors,
            onClick = onClick,
            onCloseButtonClick = onCloseButtonClick,
        )
    }
}

/**
 * Message Card.
 *
 * @param messageText The message card's body text to be displayed.
 * @param modifier Modifier to be applied to the card.
 * @param titleText An optional title of message card. If the provided title text is blank or null,
 * the title will not be shown.
 * @param buttonText An optional button text of the message card. If the provided button text is blank or null,
 * the button won't be shown.
 * @param messageColors The color set defined by [MessageCardColors] used to style the message card.
 * @param onClick Invoked when user clicks on the message card.
 * @param onCloseButtonClick Invoked when user clicks on close button to remove message.
 */
@Suppress("LongMethod")
@Composable
fun MessageCard(
    messageText: String,
    modifier: Modifier = Modifier,
    titleText: String? = null,
    buttonText: String? = null,
    messageColors: MessageCardColors = MessageCardColors.buildMessageCardColors(),
    onClick: () -> Unit,
    onCloseButtonClick: () -> Unit,
) {
    Card(
        modifier = modifier
            .padding(vertical = 16.dp)
            .then(
                if (buttonText.isNullOrBlank()) {
                    Modifier.clickable(onClick = onClick)
                } else {
                    Modifier
                },
            ),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(containerColor = messageColors.backgroundColor),
    ) {
        Column(
            Modifier
                .padding(all = 16.dp)
                .fillMaxWidth(),
        ) {
            if (!titleText.isNullOrBlank()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = titleText,
                        modifier = Modifier.weight(1f),
                        color = messageColors.titleTextColor,
                        overflow = TextOverflow.Ellipsis,
                        maxLines = 2,
                        style = FirefoxTheme.typography.headline7,
                    )

                    MessageCardIconButton(
                        iconTint = messageColors.iconColor,
                        onCloseButtonClick = onCloseButtonClick,
                    )
                }

                Text(
                    text = messageText,
                    modifier = Modifier.fillMaxWidth(),
                    fontSize = 14.sp,
                    color = messageColors.messageTextColor,
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = messageText,
                        modifier = Modifier.weight(1f),
                        fontSize = 14.sp,
                        color = messageColors.titleTextColor,
                    )

                    MessageCardIconButton(
                        iconTint = messageColors.iconColor,
                        onCloseButtonClick = onCloseButtonClick,
                    )
                }
            }

            if (!buttonText.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(16.dp))

                FilledButton(
                    text = buttonText,
                    modifier = Modifier.fillMaxWidth(),
                    contentColor = messageColors.buttonTextColor,
                    containerColor = messageColors.buttonColor,
                    onClick = onClick,
                )
            }
        }
    }
}

/**
 * IconButton within a MessageCard.
 *
 * @param iconTint The [Color] used to tint the button's icon.
 * @param onCloseButtonClick Invoked when user clicks on close button to remove message.
 */
@Composable
private fun MessageCardIconButton(
    iconTint: Color,
    onCloseButtonClick: () -> Unit,
) {
    IconButton(
        modifier = Modifier.size(20.dp),
        onClick = onCloseButtonClick,
    ) {
        Icon(
            painter = painterResource(iconsR.drawable.mozac_ic_cross_20),
            contentDescription = stringResource(
                R.string.content_description_close_button,
            ),
            tint = iconTint,
        )
    }
}

/**
 * Wrapper for the color parameters of [MessageCard].
 *
 * @property backgroundColor The background [Color] of the message.
 * @property titleTextColor [Color] to apply to the message's title, or the body text when there is no title.
 * @property messageTextColor [Color] to apply to the message's body text.
 * @property iconColor [Color] to apply to the message's icon.
 * @property buttonColor The background [Color] of the message's button.
 * @property buttonTextColor [Color] to apply to the button text.
 */
data class MessageCardColors(
    val backgroundColor: Color,
    val titleTextColor: Color,
    val messageTextColor: Color,
    val iconColor: Color,
    val buttonColor: Color,
    val buttonTextColor: Color,
) {
    companion object {

        /**
         * Builder function used to construct an instance of [MessageCardColors].
         */
        @Composable
        fun buildMessageCardColors(
            backgroundColor: Color = MaterialTheme.colorScheme.surfaceContainerLowest,
            titleTextColor: Color = MaterialTheme.colorScheme.onSurface,
            messageTextColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
            iconColor: Color = MaterialTheme.colorScheme.onSurface,
            buttonColor: Color = ButtonDefaults.buttonColors().containerColor,
            buttonTextColor: Color = ButtonDefaults.buttonColors().contentColor,
        ): MessageCardColors {
            return MessageCardColors(
                backgroundColor = backgroundColor,
                titleTextColor = titleTextColor,
                messageTextColor = messageTextColor,
                iconColor = iconColor,
                buttonColor = buttonColor,
                buttonTextColor = buttonTextColor,
            )
        }
    }
}

@Composable
@PreviewLightDark
private fun MessageCardPreview() {
    FirefoxTheme {
        Surface {
            MessageCard(
                messageCardState = FakeHomepagePreview.messageCardState(),
                modifier = Modifier.padding(all = 16.dp),
                onClick = {},
                onCloseButtonClick = {},
            )
        }
    }
}

@Composable
@PreviewLightDark
private fun MessageCardWithoutTitlePreview() {
    FirefoxTheme {
        Surface {
            MessageCard(
                messageText = stringResource(id = R.string.default_browser_experiment_card_text),
                modifier = Modifier.padding(all = 16.dp),
                onClick = {},
                onCloseButtonClick = {},
            )
        }
    }
}

@Composable
@PreviewLightDark
private fun MessageCardWithButtonLabelPreview() {
    FirefoxTheme {
        Surface {
            MessageCard(
                messageText = stringResource(id = R.string.default_browser_experiment_card_text),
                modifier = Modifier.padding(all = 16.dp),
                titleText = stringResource(id = R.string.default_browser_experiment_card_title),
                buttonText = stringResource(id = R.string.preferences_set_as_default_browser),
                onClick = {},
                onCloseButtonClick = {},
            )
        }
    }
}

/**
 * State object that describes a message card.
 *
 * @property messageText The message card's body text to be displayed.
 * @property titleText An optional title of message card. If the provided title text is blank or null,
 * the title will not be shown.
 * @property buttonText An optional button text of the message card. If the provided button text is blank or null,
 * the button won't be shown.
 * @property messageColors The color set defined by [MessageCardColors] used to style the message card.
 */
data class MessageCardState(
    val messageText: String,
    val titleText: String? = null,
    val buttonText: String? = null,
    val messageColors: MessageCardColors,
) {

    /**
     * Companion object for building [MessageCardState].
     */
    companion object {

        /**
         * Builds a new [MessageCardState] from a [Message] and the current [WallpaperState].
         *
         * @param message [Message] to be displayed.
         * @param wallpaperState [WallpaperState] specifying the colors to be used.
         */
        @Composable
        fun build(message: Message, wallpaperState: WallpaperState): MessageCardState {
            val isWallpaperNotDefault =
                !Wallpaper.nameIsDefault(wallpaperState.currentWallpaper.name)

            var (_, _, _, _, buttonColor, buttonTextColor) = MessageCardColors.buildMessageCardColors()

            if (isWallpaperNotDefault) {
                buttonColor = MaterialTheme.colorScheme.surface
                buttonTextColor = MaterialTheme.colorScheme.onSurface
            }

            val messageCardColors = MessageCardColors.buildMessageCardColors(
                backgroundColor = wallpaperState.cardBackgroundColor,
                buttonColor = buttonColor,
                buttonTextColor = buttonTextColor,
            )

            return MessageCardState(
                messageText = message.text,
                titleText = message.title,
                buttonText = message.buttonLabel,
                messageColors = messageCardColors,
            )
        }
    }
}
