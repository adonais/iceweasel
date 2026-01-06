/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.toolbar

import android.content.Context
import android.view.Gravity
import android.view.ViewGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.coordinatorlayout.widget.CoordinatorLayout.LayoutParams
import mozilla.components.browser.state.state.CustomTabSessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.browser.toolbar.NavigationBar
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Bottom
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Top
import mozilla.components.feature.toolbar.ToolbarBehaviorController
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.utils.KeyboardState
import org.mozilla.fenix.compose.utils.keyboardAsState
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.Settings

/**
 * A wrapper over the [NavigationBar] composable that provides enhanced customization and
 * lifecycle-aware integration for use within the [BrowserToolbarView] framework.
 *
 * @param context [Context] used to access resources and other application-level operations.
 * @param container [ViewGroup] which will serve as parent of this View.
 * @param toolbarStore [BrowserToolbarStore] containing the navigation bar state.
 * @param browserStore [BrowserStore] used for observing the browsing details.
 * @param settings [Settings] object to get the toolbar position and other settings.
 * @param hideWhenKeyboardShown If true, navigation bar will be hidden when the keyboard is visible.
 * @param customTabSession [CustomTabSessionState] if the toolbar is shown in a custom tab.
 */
class BrowserNavigationBar(
    private val context: Context,
    container: ViewGroup,
    private val toolbarStore: BrowserToolbarStore,
    private val browserStore: BrowserStore,
    private val settings: Settings,
    private val hideWhenKeyboardShown: Boolean,
    customTabSession: CustomTabSessionState? = null,
) : FenixBrowserToolbarView(
    parent = container,
    settings = settings,
    customTabSession = customTabSession,
) {
    override fun updateDividerVisibility(isVisible: Boolean) {
        // No-op: Divider is not controlled through this.
    }

    override val layout: ScrollableToolbarComposeView =
        ScrollableToolbarComposeView(context, this) {
            DisposableEffect(browserStore, customTabSession) {
                val toolbarController = ToolbarBehaviorController(
                    toolbar = this@BrowserNavigationBar,
                    store = browserStore,
                    customTabId = customTabSession?.id,
                )
                toolbarController.start()
                onDispose { toolbarController.stop() }
            }

            DefaultNavigationBarContent()
        }.apply {
            id = R.id.navigation_bar

            container.addView(
                this,
                LayoutParams(
                    LayoutParams.MATCH_PARENT,
                    LayoutParams.WRAP_CONTENT,
                ).apply {
                    gravity = Gravity.BOTTOM
                },
            )

            post { setToolbarBehavior(ToolbarPosition.BOTTOM) }
        }

    /**
     * Returns a [Composable] function that renders the default navigation bar content and ensures
     * that the associated view-based layout is removed from its parent to prevent UI overlap.
     */
    fun asComposable(): @Composable () -> Unit = {
        val removed = remember { mutableStateOf(false) }

        if (!removed.value) {
            SideEffect {
                (layout.parent as? ViewGroup)?.removeView(layout)
                removed.value = true
            }
        }

        DefaultNavigationBarContent()
    }

    @Composable
    private fun DefaultNavigationBarContent() {
        val uiState by toolbarStore.observeAsState(initialValue = toolbarStore.state) { it }
        val toolbarGravity = remember(settings) {
            when (settings.shouldUseBottomToolbar) {
                true -> Bottom
                false -> Top
            }
        }
        val isKeyboardVisible = if (hideWhenKeyboardShown) {
            val keyboardState by keyboardAsState()
            keyboardState == KeyboardState.Opened
        } else {
            false
        }

        if (uiState.displayState.navigationActions.isNotEmpty() && !isKeyboardVisible) {
            FirefoxTheme {
                NavigationBar(
                    actions = uiState.displayState.navigationActions,
                    toolbarGravity = toolbarGravity,
                    onInteraction = { toolbarStore.dispatch(it) },
                )
            }
        }
    }
}
