/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.toolbar

import android.view.Gravity
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.coordinatorlayout.widget.CoordinatorLayout.LayoutParams
import mozilla.components.browser.state.action.AwesomeBarAction
import mozilla.components.browser.state.state.CustomTabSessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.theme.localAcornColors
import mozilla.components.compose.base.utils.BackInvokedHandler
import mozilla.components.compose.browser.toolbar.BrowserToolbar
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.ToolbarGravityUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Bottom
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Top
import mozilla.components.feature.toolbar.ToolbarBehaviorController
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.browser.store.BrowserScreenStore
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEnded
import org.mozilla.fenix.components.toolbar.ToolbarPosition.BOTTOM
import org.mozilla.fenix.components.toolbar.ToolbarPosition.TOP
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.Settings

/**
 * A wrapper over the [BrowserToolbar] composable to allow for extra customisation and
 * integration in the same framework as the [BrowserToolbarView]
 *
 * @param activity [AppCompatActivity] hosting the toolbar.
 * @param container [ViewGroup] which will serve as parent of this View.
 * @param toolbarStore [BrowserToolbarStore] containing the composable toolbar state.
 * @param browserScreenStore [BrowserScreenStore] used for integration with other browser screen functionalities.
 * @param appStore [AppStore] used for integration with other application features.
 * @param browserStore [BrowserStore] used for observing the browsing details.
 * @param settings [Settings] object to get the toolbar position and other settings.
 * @param customTabSession [CustomTabSessionState] if the toolbar is shown in a custom tab.
 * @param tabStripContent Composable content for the tab strip.
 * @param searchSuggestionsContent [Composable] as the search suggestions content to be displayed
 * together with this toolbar.
 * @param navigationBarContent Composable content for the navigation bar.
 */
@Suppress("LongParameterList")
class BrowserToolbarComposable(
    private val activity: AppCompatActivity,
    container: ViewGroup,
    private val toolbarStore: BrowserToolbarStore,
    private val browserScreenStore: BrowserScreenStore,
    private val appStore: AppStore,
    private val browserStore: BrowserStore,
    private val settings: Settings,
    private val customTabSession: CustomTabSessionState? = null,
    private val tabStripContent: @Composable () -> Unit,
    private val searchSuggestionsContent: @Composable (Modifier) -> Unit,
    private val navigationBarContent: (@Composable () -> Unit)?,
) : FenixBrowserToolbarView(
    context = activity,
    settings = settings,
    customTabSession = customTabSession,
) {
    init {
        // Reset the toolbar position whenever coming back to browsing
        // like after changing the toolbar position in settings.
        toolbarStore.dispatch(
            ToolbarGravityUpdated(
                buildToolbarGravityConfig(),
            ),
        )
    }

    override val layout = ScrollableToolbarComposeView(activity, this) {
        val isSearching = toolbarStore.observeAsComposableState { it.isEditMode() }.value
        val shouldShowTabStrip: Boolean = remember { shouldShowTabStrip() }
        val customColors = browserScreenStore.observeAsComposableState { it.customTabColors }
        val shouldUseBottomToolbar = remember(settings) { settings.shouldUseBottomToolbar }

        DisposableEffect(activity) {
            val toolbarController = ToolbarBehaviorController(
                toolbar = this@BrowserToolbarComposable,
                store = browserStore,
                customTabId = customTabSession?.id,
            )
            toolbarController.start()
            onDispose { toolbarController.stop() }
        }

        BackInvokedHandler(isSearching) {
            appStore.dispatch(SearchEnded)
            browserStore.dispatch(AwesomeBarAction.EngagementFinished(abandoned = true))
        }

        FirefoxTheme {
            val firefoxColors = FirefoxTheme.colors
            val customTheme = remember(customColors, firefoxColors) {
                firefoxColors.copy(
                    // Toolbar background
                    layer1 = customColors.value?.toolbarColor?.let { Color(it) } ?: firefoxColors.layer1,
                    // Page origin background
                    layer3 = when (customTabSession) {
                        null -> firefoxColors.layer3 // show a different background only for normal tabs
                        else -> customColors.value?.toolbarColor?.let { Color(it) } ?: firefoxColors.layer1
                    },
                    // All text but the title
                    textPrimary = customColors.value?.readableColor?.let { Color(it) } ?: firefoxColors.textPrimary,
                    // Title
                    textSecondary = customColors.value?.readableColor?.let { Color(it) } ?: firefoxColors.textSecondary,
                    // All icons tint
                    iconPrimary = customColors.value?.readableColor?.let { Color(it) } ?: firefoxColors.iconPrimary,
                )
            }

            CompositionLocalProvider(localAcornColors provides customTheme) {
                when (shouldShowTabStrip) {
                    true -> Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .wrapContentHeight(),
                    ) {
                        tabStripContent()
                        BrowserToolbar(toolbarStore)
                        searchSuggestionsContent(Modifier.weight(1f))
                    }

                    false -> Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .wrapContentHeight(),
                    ) {
                        if (shouldUseBottomToolbar) {
                            searchSuggestionsContent(Modifier.weight(1f))
                            BrowserToolbar(toolbarStore)
                            navigationBarContent?.invoke()
                        } else {
                            BrowserToolbar(toolbarStore)
                            searchSuggestionsContent(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }.apply {
        if (!shouldShowTabStrip()) {
            val params = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)

            when (settings.toolbarPosition) {
                TOP -> params.gravity = Gravity.TOP
                BOTTOM -> params.gravity = Gravity.BOTTOM
            }

            layoutParams = params
        }
    }

    init {
        container.addView(layout)
        setToolbarBehavior(settings.toolbarPosition)
        updateDividerVisibility(true)
    }

    override fun updateDividerVisibility(isVisible: Boolean) {
        // no-op
        // For the toolbar redesign we will always show the toolbar divider
    }

    private fun buildToolbarGravityConfig(): ToolbarGravity = when (settings.shouldUseBottomToolbar) {
        true -> Bottom
        false -> Top
    }
}
