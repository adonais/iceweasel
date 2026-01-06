/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfo
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import androidx.window.core.layout.WindowSizeClass
import mozilla.components.compose.base.progressbar.AnimatedProgressBar
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.base.theme.acornPrivateColorScheme
import mozilla.components.compose.base.theme.privateColorPalette
import mozilla.components.compose.browser.toolbar.concept.Action
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButtonRes
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction.ContentDescription.StringResContentDescription
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction.Icon.DrawableResIcon
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_URL_BOX
import mozilla.components.compose.browser.toolbar.concept.PageOrigin
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.ProgressBarConfig
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Bottom
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Top
import mozilla.components.compose.browser.toolbar.ui.Origin
import mozilla.components.ui.icons.R as iconsR

private const val NO_TOOLBAR_PADDING_DP = 0
private const val TOOLBAR_PADDING_DP = 8
private const val LARGE_TOOLBAR_PADDING_DP = 24

/**
 * Sub-component of the [BrowserToolbar] responsible for displaying the URL and related
 * controls ("display mode").
 *
 * @param pageOrigin Details about the website origin.
 * @param gravity [ToolbarGravity] for where the toolbar is being placed on the screen.
 * @param progressBarConfig [ProgressBarConfig] configuration for the progress bar.
 * If `null` a progress bar will not be displayed.
 * @param browserActionsStart List of browser [Action]s to be displayed at the start of the
 * toolbar, outside of the URL bounding box.
 * These should be actions relevant to the browser as a whole.
 * See [MDN docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserAction).
 * @param pageActionsStart List of navigation [Action]s to be displayed between [browserActionsStart]
 * and [pageOrigin], inside of the URL bounding box.
 * These should be actions relevant to specific webpages as opposed to [browserActionsStart].
 * See [MDN docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/pageAction).
 * @param pageActionsEnd List of page [Action]s to be displayed between [pageOrigin] and [browserActionsEnd],
 * inside of the URL bounding box.
 * These should be actions relevant to specific webpages as opposed to [browserActionsStart].
 * See [MDN docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/pageAction).
 * @param browserActionsEnd List of browser [Action]s to be displayed at the end of the toolbar,
 * outside of the URL bounding box.
 * These should be actions relevant to the browser as a whole.
 * See [MDN docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserAction).
 * @param onInteraction Callback for handling [BrowserToolbarEvent]s on user interactions.
 */
@Composable
@Suppress("LongMethod", "CyclomaticComplexMethod", "CognitiveComplexMethod")
fun BrowserDisplayToolbar(
    pageOrigin: PageOrigin,
    gravity: ToolbarGravity,
    progressBarConfig: ProgressBarConfig?,
    browserActionsStart: List<Action> = emptyList(),
    pageActionsStart: List<Action> = emptyList(),
    pageActionsEnd: List<Action> = emptyList(),
    browserActionsEnd: List<Action> = emptyList(),
    onInteraction: (BrowserToolbarEvent) -> Unit,
) {
    val windowSizeClass = currentWindowAdaptiveInfo().windowSizeClass
    val isSmallWidthScreen = remember(windowSizeClass) {
        windowSizeClass.minWidthDp < WindowSizeClass.WIDTH_DP_MEDIUM_LOWER_BOUND
    }

    Surface {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = when (isSmallWidthScreen) {
                        true -> NO_TOOLBAR_PADDING_DP.dp
                        else -> LARGE_TOOLBAR_PADDING_DP.dp
                    },
                )
                .semantics { testTagsAsResourceId = true },
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (browserActionsStart.isNotEmpty()) {
                    ActionContainer(
                        actions = browserActionsStart,
                        onInteraction = onInteraction,
                    )
                }

                Row(
                    modifier = Modifier
                        .padding(
                            start = when (browserActionsStart.isEmpty()) {
                                true -> TOOLBAR_PADDING_DP.dp
                                false -> NO_TOOLBAR_PADDING_DP.dp
                            },
                            top = TOOLBAR_PADDING_DP.dp,
                            end = when (browserActionsEnd.isEmpty()) {
                                true -> TOOLBAR_PADDING_DP.dp
                                false -> NO_TOOLBAR_PADDING_DP.dp
                            },
                            bottom = when (gravity) {
                                Top -> TOOLBAR_PADDING_DP
                                Bottom -> if (browserActionsEnd.isEmpty()) NO_TOOLBAR_PADDING_DP else TOOLBAR_PADDING_DP
                            }.dp,
                        )
                        .height(48.dp)
                        .background(
                            color = MaterialTheme.colorScheme.surfaceDim,
                            shape = RoundedCornerShape(90.dp),
                        )
                        .padding(
                            start = when (pageActionsStart.isEmpty()) {
                                true -> TOOLBAR_PADDING_DP.dp
                                false -> NO_TOOLBAR_PADDING_DP.dp
                            },
                            top = NO_TOOLBAR_PADDING_DP.dp,
                            end = when (pageActionsEnd.isEmpty()) {
                                true -> TOOLBAR_PADDING_DP.dp
                                false -> NO_TOOLBAR_PADDING_DP.dp
                            },
                            bottom = NO_TOOLBAR_PADDING_DP.dp,
                        )
                        .weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (pageActionsStart.isNotEmpty()) {
                        ActionContainer(
                            actions = pageActionsStart,
                            onInteraction = onInteraction,
                        )
                    }

                    Origin(
                        hint = pageOrigin.hint,
                        modifier = Modifier
                            .height(56.dp)
                            .weight(1f)
                            .testTag(ADDRESSBAR_URL_BOX),
                        url = pageOrigin.url,
                        title = pageOrigin.title,
                        textGravity = pageOrigin.textGravity,
                        contextualMenuOptions = pageOrigin.contextualMenuOptions,
                        onClick = pageOrigin.onClick,
                        onLongClick = pageOrigin.onLongClick,
                        onInteraction = onInteraction,
                    )

                    if (pageActionsEnd.isNotEmpty()) {
                        ActionContainer(
                            actions = pageActionsEnd,
                            onInteraction = onInteraction,
                        )
                    }
                }

                if (browserActionsEnd.isNotEmpty()) {
                    ActionContainer(
                        actions = browserActionsEnd,
                        onInteraction = onInteraction,
                    )
                }
            }

            HorizontalDivider(
                modifier = Modifier.align(
                    when (gravity) {
                        Top -> Alignment.BottomCenter
                        Bottom -> Alignment.TopCenter
                    },
                ),
            )

            if (progressBarConfig != null) {
                AnimatedProgressBar(
                    progress = progressBarConfig.progress,
                    color = progressBarConfig.color,
                    trackColor = Color.Transparent,
                    modifier = Modifier.align(
                        when (gravity) {
                            Top -> Alignment.BottomCenter
                            Bottom -> Alignment.TopCenter
                        },
                    ),
                )
            }
        }
    }
}

@PreviewLightDark
@Composable
private fun BrowserDisplayToolbarPreview(
    @PreviewParameter(DisplayToolbarDataProvider::class) config: DisplayToolbarPreviewModel,
) {
    AcornTheme {
        BrowserDisplayToolbar(
            gravity = config.gravity,
            progressBarConfig = ProgressBarConfig(progress = 66),
            browserActionsStart = config.browserStartActions,
            pageActionsStart = config.pageActionsStart,
            pageOrigin = PageOrigin(
                hint = R.string.mozac_browser_toolbar_search_hint,
                title = config.title,
                url = config.url,
                onClick = object : BrowserToolbarEvent {},
            ),
            pageActionsEnd = config.pageActionsEnd,
            browserActionsEnd = config.browserEndActions,
            onInteraction = {},
        )
    }
}

@Preview
@Composable
private fun BrowserDisplayToolbarPrivatePreview(
    @PreviewParameter(DisplayToolbarDataProvider::class) config: DisplayToolbarPreviewModel,
) {
    AcornTheme(
        colors = privateColorPalette,
        colorScheme = acornPrivateColorScheme(),
    ) {
        BrowserDisplayToolbar(
            gravity = config.gravity,
            progressBarConfig = ProgressBarConfig(progress = 66),
            browserActionsStart = config.browserStartActions,
            pageActionsStart = config.pageActionsStart,
            pageOrigin = PageOrigin(
                hint = R.string.mozac_browser_toolbar_search_hint,
                title = config.title,
                url = config.url,
                onClick = object : BrowserToolbarEvent {},
            ),
            pageActionsEnd = config.pageActionsEnd,
            browserActionsEnd = config.browserEndActions,
            onInteraction = {},
        )
    }
}

private data class DisplayToolbarPreviewModel(
    val browserStartActions: List<Action>,
    val pageActionsStart: List<Action>,
    val title: String?,
    val url: String?,
    val gravity: ToolbarGravity,
    val pageActionsEnd: List<Action>,
    val browserEndActions: List<Action>,
)
private class DisplayToolbarDataProvider : PreviewParameterProvider<DisplayToolbarPreviewModel> {
    val browserStartActions = listOf(
        ActionButtonRes(
            drawableResId = iconsR.drawable.mozac_ic_home_24,
            contentDescription = android.R.string.untitled,
            onClick = object : BrowserToolbarEvent {},
        ),
    )
    val pageActionsStart = listOf(
        SearchSelectorAction(
            icon = DrawableResIcon(iconsR.drawable.mozac_ic_search_24),
            contentDescription = StringResContentDescription(resourceId = android.R.string.untitled),
            menu = { emptyList() },
            onClick = null,
        ),
    )
    val pageActionsEnd = listOf(
        ActionButtonRes(
            drawableResId = iconsR.drawable.mozac_ic_arrow_clockwise_24,
            contentDescription = android.R.string.untitled,
            onClick = object : BrowserToolbarEvent {},
        ),
    )
    val browserActionsEnd = listOf(
        ActionButtonRes(
            drawableResId = iconsR.drawable.mozac_ic_ellipsis_vertical_24,
            contentDescription = android.R.string.untitled,
            onClick = object : BrowserToolbarEvent {},
        ),
    )
    val title = "Firefox"
    val url = "mozilla.com/firefox"

    override val values = sequenceOf(
        DisplayToolbarPreviewModel(
            browserStartActions = browserStartActions,
            pageActionsStart = pageActionsStart,
            title = title,
            url = url,
            gravity = Top,
            pageActionsEnd = pageActionsEnd,
            browserEndActions = browserActionsEnd,
        ),
        DisplayToolbarPreviewModel(
            browserStartActions = emptyList(),
            pageActionsStart = pageActionsStart,
            title = null,
            url = url,
            gravity = Bottom,
            pageActionsEnd = pageActionsEnd,
            browserEndActions = emptyList(),
        ),
        DisplayToolbarPreviewModel(
            browserStartActions = browserStartActions,
            pageActionsStart = emptyList(),
            title = title,
            url = url,
            gravity = Top,
            pageActionsEnd = emptyList(),
            browserEndActions = browserActionsEnd,
        ),
        DisplayToolbarPreviewModel(
            browserStartActions = emptyList(),
            pageActionsStart = emptyList(),
            title = null,
            url = null,
            gravity = Bottom,
            pageActionsEnd = emptyList(),
            browserEndActions = emptyList(),
        ),
    )
}
