/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar

import androidx.appcompat.content.res.AppCompatResources
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.Divider
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.browser.toolbar.concept.Action
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButtonRes
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction.ContentDescription.StringResContentDescription
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction.Icon.DrawableIcon
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Bottom
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Top
import mozilla.components.compose.browser.toolbar.ui.InlineAutocompleteTextField
import mozilla.components.concept.toolbar.AutocompleteProvider
import mozilla.components.ui.icons.R as iconsR

private val ROUNDED_CORNER_SHAPE = RoundedCornerShape(90.dp)

/**
 * Sub-component of the [BrowserToolbar] responsible for allowing the user to edit the current
 * URL ("edit mode").
 *
 * @param query The current query.
 * @param isQueryPrefilled Whether [query] is prefilled and not user entered.
 * @param gravity [ToolbarGravity] for where the toolbar is being placed on the screen.
 * @param autocompleteProviders Optional list of [AutocompleteProvider]s to be used for
 * inline autocompleting the current query.
 * @param useComposeTextField Whether or not to use the Compose [TextField] or a view-based
 * inline autocomplete text field.
 * @param editActionsStart List of [Action]s to be displayed at the start of the URL of
 * the edit toolbar.
 * @param editActionsEnd List of [Action]s to be displayed at the end of the URL of
 * the edit toolbar.
 * @param onUrlEdit Will be called when the URL value changes. An updated text value comes as a
 * parameter of the callback.
 * @param onUrlEditAborted Will be called when the user has aborted editing the URL.
 * This callback works only up until Android API 33.
 * @param onUrlCommitted Will be called when the user has finished editing and wants to initiate
 * loading the entered URL. The committed text value comes as a parameter of the callback.
 * @param onInteraction Callback for handling [BrowserToolbarEvent]s on user interactions.
 */
@Composable
@Suppress("LongMethod")
fun BrowserEditToolbar(
    query: String,
    hint: String,
    isQueryPrefilled: Boolean = false,
    gravity: ToolbarGravity = Top,
    autocompleteProviders: List<AutocompleteProvider> = emptyList(),
    useComposeTextField: Boolean = false,
    editActionsStart: List<Action> = emptyList(),
    editActionsEnd: List<Action> = emptyList(),
    onUrlEdit: (String) -> Unit = {},
    onUrlEditAborted: () -> Unit = {},
    onUrlCommitted: (String) -> Unit = {},
    onUrlSuggestionAutocompleted: (String) -> Unit = {},
    onInteraction: (BrowserToolbarEvent) -> Unit,
) {
    Box(
        modifier = Modifier
            .background(color = AcornTheme.colors.layer1)
            .fillMaxWidth()
            .semantics { testTagsAsResourceId = true },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(all = 8.dp)
                .height(48.dp)
                .clip(shape = ROUNDED_CORNER_SHAPE)
                .background(color = AcornTheme.colors.layer3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (useComposeTextField) {
                TextField(
                    value = query,
                    onValueChange = { value ->
                        onUrlEdit(value)
                    },
                    placeholder = {
                        Text(
                            text = hint,
                            color = AcornTheme.colors.textSecondary,
                        )
                    },
                    colors = TextFieldDefaults.colors(
                        focusedTextColor = AcornTheme.colors.textPrimary,
                        unfocusedTextColor = AcornTheme.colors.textPrimary,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        disabledIndicatorColor = Color.Transparent,
                        errorIndicatorColor = Color.Transparent,
                        unfocusedContainerColor = AcornTheme.colors.layer3,
                        focusedContainerColor = AcornTheme.colors.layer3,
                        disabledContainerColor = AcornTheme.colors.layer3,
                        errorContainerColor = AcornTheme.colors.layer3,
                    ),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Go,
                    ),
                    keyboardActions = KeyboardActions(
                        onGo = { onUrlCommitted(query) },
                    ),
                    modifier = Modifier.fillMaxWidth(),
                    shape = ROUNDED_CORNER_SHAPE,
                    leadingIcon = {
                        ActionContainer(
                            actions = editActionsStart,
                            onInteraction = onInteraction,
                        )
                    },
                    trailingIcon = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ActionContainer(
                                actions = editActionsEnd,
                                onInteraction = onInteraction,
                            )
                        }
                    },
                )
            } else {
                ActionContainer(
                    actions = editActionsStart,
                    onInteraction = onInteraction,
                )

                InlineAutocompleteTextField(
                    query = query,
                    hint = hint,
                    showQueryAsPreselected = isQueryPrefilled,
                    autocompleteProviders = autocompleteProviders,
                    modifier = Modifier.weight(1f),
                    onUrlEdit = onUrlEdit,
                    onUrlCommitted = onUrlCommitted,
                    onUrlEditAborted = onUrlEditAborted,
                    onUrlSuggestionAutocompleted = onUrlSuggestionAutocompleted,
                )

                ActionContainer(
                    actions = editActionsEnd,
                    onInteraction = onInteraction,
                )
            }
        }

        Divider(
            modifier = Modifier.align(
                when (gravity) {
                    Top -> Alignment.BottomCenter
                    Bottom -> Alignment.TopCenter
                },
            ),
        )
    }
}

@PreviewLightDark
@Composable
private fun BrowserEditToolbarPreview() {
    AcornTheme {
        BrowserEditToolbar(
            query = "http://www.mozilla.org",
            hint = "Search or enter address",
            gravity = Top,
            autocompleteProviders = emptyList(),
            useComposeTextField = true,
            editActionsStart = listOf(
                SearchSelectorAction(
                    icon = DrawableIcon(
                        AppCompatResources.getDrawable(LocalContext.current, iconsR.drawable.mozac_ic_search_24)!!,
                    ),
                    contentDescription = StringResContentDescription(android.R.string.untitled),
                    menu = { emptyList() },
                    onClick = null,
                ),
            ),
            editActionsEnd = listOf(
                ActionButtonRes(
                    drawableResId = iconsR.drawable.mozac_ic_microphone_24,
                    contentDescription = android.R.string.untitled,
                    onClick = object : BrowserToolbarEvent {},
                ),
                ActionButtonRes(
                    drawableResId = iconsR.drawable.mozac_ic_qr_code_24,
                    contentDescription = android.R.string.untitled,
                    onClick = object : BrowserToolbarEvent {},
                ),
            ),
            onInteraction = {},
        )
    }
}
