/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.base.theme.acornPrivateColorScheme
import mozilla.components.compose.base.theme.privateColorPalette
import mozilla.components.compose.browser.toolbar.concept.Action
import mozilla.components.compose.browser.toolbar.concept.PageOrigin
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.ProgressBarConfig
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Bottom
import mozilla.components.compose.browser.toolbar.ui.FullDisplayToolbar
import mozilla.components.compose.browser.toolbar.ui.MinimalDisplayToolbar
import mozilla.components.compose.browser.toolbar.utils.DisplayToolbarDataProvider
import mozilla.components.compose.browser.toolbar.utils.DisplayToolbarPreviewModel
import mozilla.components.support.utils.KeyboardState
import mozilla.components.support.utils.keyboardAsState

// The value I've observed in my tests. Can differ based on device or keyboard used.
private const val DEFAULT_KEYBOARD_ANIMATION_TIME_MILLIS = 285

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
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
@Suppress("LongMethod")
fun BrowserDisplayToolbar(
    pageOrigin: PageOrigin,
    gravity: ToolbarGravity,
    progressBarConfig: ProgressBarConfig?,
    browserActionsStart: List<Action> = emptyList(),
    pageActionsStart: List<Action> = emptyList(),
    pageActionsEnd: List<Action> = emptyList(),
    browserActionsEnd: List<Action> = emptyList(),
    onInteraction: (BrowserToolbarEvent) -> Unit,
    useMinimalBottomToolbarWhenEnteringText: Boolean = false,
) {
    val isKeyboardShowing by when (useMinimalBottomToolbarWhenEnteringText) {
        true -> keyboardAsState()
        false -> remember { mutableStateOf(KeyboardState.Closed) }
    }

    val toolbarsTransitionAnimationSpec = remember {
        tween<Float>(
            durationMillis = DEFAULT_KEYBOARD_ANIMATION_TIME_MILLIS,
            easing = LinearEasing,
        )
    }
    val toolbarElementsAnimationSpec = remember {
        tween<Rect>(
            durationMillis = DEFAULT_KEYBOARD_ANIMATION_TIME_MILLIS,
            easing = FastOutSlowInEasing,
        )
    }

    SharedTransitionLayout {
        AnimatedContent(
            targetState = gravity == Bottom && isKeyboardShowing == KeyboardState.Opened,
            transitionSpec = {
                fadeIn(animationSpec = toolbarsTransitionAnimationSpec) togetherWith
                    fadeOut(animationSpec = toolbarsTransitionAnimationSpec)
            },
        ) { isKeyboardShown ->
            val toolbarModifier = Modifier
                .fillMaxWidth()
                .sharedBounds(
                    rememberSharedContentState(key = "toolbar_bounds"),
                    animatedVisibilityScope = this,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    resizeMode = SharedTransitionScope.ResizeMode.ScaleToBounds(),
                )

            val browserActionsStartTrait = Modifier.sharedElement(
                sharedContentState = rememberSharedContentState(key = "browser_actions_start"),
                animatedVisibilityScope = this@AnimatedContent,
                boundsTransform = { _, _ -> toolbarElementsAnimationSpec },
            )

            val pageActionsStartTrait = Modifier.sharedElement(
                sharedContentState = rememberSharedContentState(key = "page_actions_start"),
                animatedVisibilityScope = this@AnimatedContent,
                boundsTransform = { _, _ -> toolbarElementsAnimationSpec },
            )

            val originTrait = Modifier.sharedElement(
                sharedContentState = rememberSharedContentState(key = "url_box"),
                animatedVisibilityScope = this@AnimatedContent,
                boundsTransform = { _, _ -> toolbarElementsAnimationSpec },
            )

            val pageActionsEndTrait = Modifier.sharedElement(
                sharedContentState = rememberSharedContentState(key = "page_actions_end"),
                animatedVisibilityScope = this@AnimatedContent,
                boundsTransform = { _, _ -> toolbarElementsAnimationSpec },
            )

            val browserActionsEndTrait = Modifier.sharedElement(
                sharedContentState = rememberSharedContentState(key = "browser_actions_end"),
                animatedVisibilityScope = this@AnimatedContent,
                boundsTransform = { _, _ -> toolbarElementsAnimationSpec },
            )

            if (isKeyboardShown) {
                MinimalDisplayToolbar(
                    pageOrigin = pageOrigin,
                    pageActionsStart = pageActionsStart,
                    gravity = gravity,
                    modifier = toolbarModifier,
                    pageActionsStartModifier = pageActionsStartTrait,
                    originModifier = originTrait,
                )
            } else {
                FullDisplayToolbar(
                    pageOrigin = pageOrigin,
                    gravity = gravity,
                    progressBarConfig = progressBarConfig,
                    browserActionsStart = browserActionsStart,
                    pageActionsStart = pageActionsStart,
                    pageActionsEnd = pageActionsEnd,
                    browserActionsEnd = browserActionsEnd,
                    onInteraction = onInteraction,
                    modifier = toolbarModifier,
                    browserActionsStartModifier = browserActionsStartTrait,
                    pageActionsStartModifier = pageActionsStartTrait,
                    originModifier = originTrait,
                    pageActionsEndModifier = pageActionsEndTrait,
                    browserActionsEndModifier = browserActionsEndTrait,
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
