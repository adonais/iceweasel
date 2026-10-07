/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.listentopage

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.testTag
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.listentopage.ListenState
import mozilla.components.feature.listentopage.ListenStore
import mozilla.components.feature.listentopage.ui.ListenSheet
import mozilla.components.lib.state.ext.observeAsComposableState
import mozilla.components.support.base.feature.LifecycleAwareFeature
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

private val ListenState.isArticleReady: Boolean
    get() = tabId != null && languageTag != null

internal const val LISTEN_SHEET_TEST_TAG = "listenSheet"

/**
 * This integration is responsible for adding or removing the reader mode panel and the Listen to page media player, and
 * properly anchoring them to the browser.
 *
 * @param container The [CoordinatorLayout] the panel and the player are added to.
 * @param browserStore Used to tell whether reader mode is showing.
 * @param listenStore Used to tell whether there is an article to play.
 * @param isAddressBarAtBottom Whether the address bar is at the bottom of the screen.
 * @param onListenClicked Invoked when the user asks to listen to the article.
 * @param onCustomizeReaderViewClicked Invoked when the user asks for the reader view appearance controls.
 */
class ListenSheetIntegration(
    private val container: CoordinatorLayout,
    private val browserStore: BrowserStore,
    private val listenStore: ListenStore,
    private val isAddressBarAtBottom: Boolean,
    private val onListenClicked: () -> Unit,
    private val onCustomizeReaderViewClicked: () -> Unit,
) : LifecycleAwareFeature {

    private var listenFeature: ComposeView? = null

    override fun start() {
        if (listenFeature != null) return
        val view =
            ComposeView(container.context).apply {
                id = R.id.listenSheet
                layoutParams =
                    CoordinatorLayout.LayoutParams(
                            CoordinatorLayout.LayoutParams.MATCH_PARENT,
                            CoordinatorLayout.LayoutParams.WRAP_CONTENT,
                        )
                        .apply { behavior = ListenSheetBehavior(isAddressBarAtBottom = isAddressBarAtBottom) }
                setContent { ListenFeatureHost() }
            }
        listenFeature = view

        container.post {
            if (listenFeature === view) {
                container.addView(view)
            }
        }
    }

    override fun stop() {
        container.removeView(listenFeature)
        listenFeature = null
    }

    @Composable
    private fun ListenFeatureHost() {
        val isReaderModeActive by browserStore.observeAsComposableState { it.selectedTab?.readerState?.active == true }

        if (!isReaderModeActive) {
            return
        }

        val selectedTabId by browserStore.observeAsComposableState { it.selectedTabId }
        val listenState by listenStore.stateFlow.collectAsStateWithLifecycle()

        FirefoxTheme {
            ListenFeatureContent(
                shouldDisplayPlayer = listenState.isArticleReady && listenState.tabId == selectedTabId,
                onListenClicked = onListenClicked,
                onCustomizeReaderViewClicked = onCustomizeReaderViewClicked,
            )
        }
    }
}

/**
 * Shows the reader mode panel over an article, and replaces the panel with the ListenSheet media player controls once
 * the article audio is ready for playback.
 *
 * @param shouldDisplayPlayer Whether the audio of the article in the selected tab is ready for playback.
 * @param onListenClicked Invoked when the user asks to listen to the article.
 * @param onCustomizeReaderViewClicked Invoked when the user asks for the reader view appearance controls.
 */
@Composable
fun ListenFeatureContent(
    shouldDisplayPlayer: Boolean,
    onListenClicked: () -> Unit,
    onCustomizeReaderViewClicked: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxWidth().padding(all = FirefoxTheme.layout.space.static200),
        contentAlignment = Alignment.BottomEnd,
    ) {
        if (shouldDisplayPlayer) {
            ListenSheet(modifier = Modifier.fillMaxWidth().testTag(LISTEN_SHEET_TEST_TAG))
        } else {
            ReaderModePanel(
                onListenClicked = onListenClicked,
                onCustomizeReaderViewClicked = onCustomizeReaderViewClicked,
            )
        }
    }
}
