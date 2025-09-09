/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.toolbar

import android.content.Context
import androidx.annotation.VisibleForTesting
import androidx.lifecycle.Lifecycle.State.RESUMED
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.launch
import mozilla.components.browser.state.search.SearchEngine
import mozilla.components.browser.state.selector.getNormalOrPrivateTabs
import mozilla.components.browser.state.state.selectedOrDefaultSearchEngine
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.browser.toolbar.concept.Action
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButton
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButtonRes
import mozilla.components.compose.browser.toolbar.concept.Action.TabCounterAction
import mozilla.components.compose.browser.toolbar.concept.PageOrigin
import mozilla.components.compose.browser.toolbar.concept.PageOrigin.Companion.ContextualMenuOption.LoadFromClipboard
import mozilla.components.compose.browser.toolbar.concept.PageOrigin.Companion.ContextualMenuOption.PasteFromClipboard
import mozilla.components.compose.browser.toolbar.concept.PageOrigin.Companion.PageOriginContextualMenuInteractions.LoadFromClipboardClicked
import mozilla.components.compose.browser.toolbar.concept.PageOrigin.Companion.PageOriginContextualMenuInteractions.PasteFromClipboardClicked
import mozilla.components.compose.browser.toolbar.store.BrowserDisplayToolbarAction.BrowserActionsEndUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserDisplayToolbarAction.NavigationActionsUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserDisplayToolbarAction.PageActionsStartUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserDisplayToolbarAction.PageOriginUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchQueryUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.Init
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.ToggleEditMode
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent.Source
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.CombinedEventAndMenu
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton.ContentDescription.StringResContentDescription
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton.Icon.DrawableResIcon
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton.Text.StringResText
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarState
import mozilla.components.compose.browser.toolbar.store.EnvironmentCleared
import mozilla.components.compose.browser.toolbar.store.EnvironmentRehydrated
import mozilla.components.compose.browser.toolbar.store.Mode
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext
import mozilla.components.lib.state.State
import mozilla.components.lib.state.Store
import mozilla.components.lib.state.ext.flow
import mozilla.components.support.base.log.logger.Logger
import mozilla.components.support.utils.ClipboardHandler
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.browser.browsingmode.BrowsingMode.Normal
import org.mozilla.fenix.browser.browsingmode.BrowsingMode.Private
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.UseCases
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchStarted
import org.mozilla.fenix.components.menu.MenuAccessPoint
import org.mozilla.fenix.components.toolbar.BrowserToolbarEnvironment
import org.mozilla.fenix.ext.nav
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.home.HomeFragmentDirections
import org.mozilla.fenix.home.toolbar.DisplayActions.FakeClicked
import org.mozilla.fenix.home.toolbar.DisplayActions.MenuClicked
import org.mozilla.fenix.home.toolbar.PageOriginInteractions.OriginClicked
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.AddNewPrivateTab
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.AddNewTab
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.TabCounterClicked
import org.mozilla.fenix.home.toolbar.TabCounterInteractions.TabCounterLongClicked
import org.mozilla.fenix.search.BrowserToolbarSearchMiddleware
import org.mozilla.fenix.search.ext.searchEngineShortcuts
import org.mozilla.fenix.tabstray.Page
import mozilla.components.lib.state.Action as MVIAction
import mozilla.components.ui.icons.R as iconsR

private const val TALL_SCREEN_HEIGHT_DP = 480

@VisibleForTesting
internal sealed class DisplayActions : BrowserToolbarEvent {
    data class MenuClicked(override val source: Source) : DisplayActions()
    data object FakeClicked : DisplayActions()
}

internal sealed class TabCounterInteractions : BrowserToolbarEvent {
    data class TabCounterClicked(override val source: Source) : TabCounterInteractions()
    data class TabCounterLongClicked(override val source: Source) : TabCounterInteractions()
    data class AddNewTab(override val source: Source) : TabCounterInteractions()
    data class AddNewPrivateTab(override val source: Source) : TabCounterInteractions()
}

internal sealed class PageOriginInteractions : BrowserToolbarEvent {
    data object OriginClicked : PageOriginInteractions()
}

/**
 * Helper function to determine whether the app's current window height
 * is at least more than [TALL_SCREEN_HEIGHT_DP].
 *
 * This is useful when navigation bar should only be enabled on
 * taller screens (e.g., to avoid crowding content vertically).
 *
 * @return true if the window height size is more than [TALL_SCREEN_HEIGHT_DP].
 */
@VisibleForTesting
internal fun Context.isTallWindow(): Boolean {
    return resources.configuration.screenHeightDp > TALL_SCREEN_HEIGHT_DP
}

/**
 * [Middleware] responsible for configuring and handling interactions with the composable toolbar.
 *
 * @param appStore [AppStore] to sync from.
 * @param browserStore [BrowserStore] to sync from.
 * @param clipboard [ClipboardHandler] to use for reading from device's clipboard.
 * @param useCases [UseCases] helping this integrate with other features of the applications.
 */
class BrowserToolbarMiddleware(
    private val appStore: AppStore,
    private val browserStore: BrowserStore,
    private val clipboard: ClipboardHandler,
    private val useCases: UseCases,
) : Middleware<BrowserToolbarState, BrowserToolbarAction> {
    @VisibleForTesting
    internal var environment: BrowserToolbarEnvironment? = null
    private var syncCurrentSearchEngineJob: Job? = null
    private var observeBrowserSearchStateJob: Job? = null

    @Suppress("LongMethod", "CyclomaticComplexMethod")
    override fun invoke(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        next: (BrowserToolbarAction) -> Unit,
        action: BrowserToolbarAction,
    ) {
        when (action) {
            is Init -> {
                next(action)

                updatePageOrigin(context)
            }

            is EnvironmentRehydrated -> {
                next(action)

                environment = action.environment as? BrowserToolbarEnvironment

                if (context.state.mode == Mode.DISPLAY) {
                    observeSearchStateUpdates(context)
                }
                updateEndBrowserActions(context)
                updateNavigationActions(context)
                updateToolbarActionsBasedOnOrientation(context)
                updateTabsCount(context)
            }

            is EnvironmentCleared -> {
                next(action)

                environment = null
            }

            is ToggleEditMode -> {
                next(action)

                when (action.editMode) {
                    true -> stopSearchStateUpdates()
                    false -> observeSearchStateUpdates(context)
                }
            }

            is MenuClicked -> {
                runWithinEnvironment {
                    navController.nav(
                        R.id.homeFragment,
                        HomeFragmentDirections.actionGlobalMenuDialogFragment(
                            accesspoint = MenuAccessPoint.Home,
                        ),
                    )
                }
                next(action)
            }

            is TabCounterClicked -> {
                runWithinEnvironment {
                    if (this.context.settings().tabManagerEnhancementsEnabled) {
                        navController.nav(
                            R.id.homeFragment,
                            NavGraphDirections.actionGlobalTabManagementFragment(
                                page = when (browsingModeManager.mode) {
                                    Normal -> Page.NormalTabs
                                    Private -> Page.PrivateTabs
                                },
                            ),
                        )
                    } else {
                        navController.nav(
                            R.id.homeFragment,
                            NavGraphDirections.actionGlobalTabsTrayFragment(
                                page = when (browsingModeManager.mode) {
                                    Normal -> Page.NormalTabs
                                    Private -> Page.PrivateTabs
                                },
                            ),
                        )
                    }
                }
                next(action)
            }
            is AddNewTab -> {
                openNewTab(context, Normal)
                next(action)
            }
            is AddNewPrivateTab -> {
                openNewTab(context, Private)
                next(action)
            }

            is OriginClicked -> {
                appStore.dispatch(SearchStarted())
            }
            is PasteFromClipboardClicked -> {
                openNewTab(context, searchTerms = clipboard.text)
            }
            is LoadFromClipboardClicked -> {
                runWithinEnvironment {
                    clipboard.extractURL()?.let {
                        useCases.fenixBrowserUseCases.loadUrlOrSearch(
                            searchTermOrURL = it,
                            newTab = true,
                            private = browsingModeManager.mode == Private,
                            searchEngine = reconcileSelectedEngine(),
                        )
                        navController.navigate(R.id.browserFragment)
                    } ?: run {
                        Logger("HomeOriginContextMenu").error("Clipboard contains URL but unable to read text")
                    }
                }
            }

            else -> next(action)
        }
    }

    private fun openNewTab(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        browsingMode: BrowsingMode? = null,
        searchTerms: String? = null,
    ) {
        runWithinEnvironment {
            browsingMode?.let { browsingModeManager.mode = it }
            context.dispatch(SearchQueryUpdated(searchTerms ?: ""))
            appStore.dispatch(SearchStarted())
        }
    }

    private fun observeSearchStateUpdates(context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>) {
        syncCurrentSearchEngineJob?.cancel()
        syncCurrentSearchEngineJob = appStore.observeWhileActive {
            distinctUntilChangedBy { it.searchState.selectedSearchEngine?.searchEngine }
                .collect {
                    it.searchState.selectedSearchEngine?.let {
                        updateStartPageActions(context, it.searchEngine)
                    }
                }
        }

        observeBrowserSearchStateJob?.cancel()
        observeBrowserSearchStateJob = browserStore.observeWhileActive {
            distinctUntilChangedBy { it.search.searchEngineShortcuts }
                .collect {
                    updateStartPageActions(
                        context = context,
                        selectedSearchEngine = reconcileSelectedEngine(),
                    )
                }
        }
    }

    private fun stopSearchStateUpdates() {
        syncCurrentSearchEngineJob?.cancel()
        observeBrowserSearchStateJob?.cancel()
    }

    private fun updateStartPageActions(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        selectedSearchEngine: SearchEngine?,
    ) = context.dispatch(
        PageActionsStartUpdated(
            buildStartPageActions(selectedSearchEngine),
        ),
    )

    private fun updatePageOrigin(context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>) =
        context.dispatch(
            PageOriginUpdated(
                PageOrigin(
                    hint = R.string.search_hint,
                    title = null,
                    url = null,
                    contextualMenuOptions = listOf(PasteFromClipboard, LoadFromClipboard),
                    onClick = OriginClicked,
                ),
            ),
        )

    private fun updateEndBrowserActions(context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>) {
        context.dispatch(
            BrowserActionsEndUpdated(
                buildEndBrowserActions(),
            ),
        )
    }

    private fun buildStartPageActions(selectedSearchEngine: SearchEngine?): List<Action> {
        val environment = environment ?: return emptyList()

        return listOfNotNull(
            BrowserToolbarSearchMiddleware.buildSearchSelector(
                selectedSearchEngine = selectedSearchEngine,
                searchEngineShortcuts = browserStore.state.search.searchEngineShortcuts,
                resources = environment.context.resources,
            ),
        )
    }

    private fun buildEndBrowserActions(): List<Action> {
        val environment = environment ?: return emptyList()
        val isExpandedAndTallScreen = environment.context.settings().shouldUseExpandedToolbar &&
                environment.context.isTallWindow()

        return listOf(
            HomeToolbarActionConfig(HomeToolbarAction.TabCounter) {
                !environment.context.settings().isTabStripEnabled && !isExpandedAndTallScreen
            },
            HomeToolbarActionConfig(HomeToolbarAction.Menu) { !isExpandedAndTallScreen },
        ).filter { config ->
            config.isVisible()
        }.map { config ->
            buildHomeAction(config.action, Source.AddressBar)
        }
    }

    private fun updateNavigationActions(context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>) {
        context.dispatch(
            NavigationActionsUpdated(
                buildNavigationActions(),
            ),
        )
    }

    private fun buildNavigationActions(): List<Action> {
        val environment = environment ?: return emptyList()
        val isExpandedAndTallScreen = environment.context.settings().shouldUseExpandedToolbar &&
                environment.context.isTallWindow()

        return listOf(
            HomeToolbarActionConfig(HomeToolbarAction.FakeBookmark) { isExpandedAndTallScreen },
            HomeToolbarActionConfig(HomeToolbarAction.FakeShare) { isExpandedAndTallScreen },
            HomeToolbarActionConfig(HomeToolbarAction.NewTab) { isExpandedAndTallScreen },
            HomeToolbarActionConfig(HomeToolbarAction.TabCounter) { isExpandedAndTallScreen },
            HomeToolbarActionConfig(HomeToolbarAction.Menu) { isExpandedAndTallScreen },
        ).filter { config ->
            config.isVisible()
        }.map { config ->
            buildHomeAction(config.action, Source.NavigationBar)
        }
    }

    private fun buildTabCounterMenu(source: Source): CombinedEventAndMenu? {
        return CombinedEventAndMenu(TabCounterLongClicked(source)) {
            when (environment?.browsingModeManager?.mode) {
                Private -> listOf(
                    BrowserToolbarMenuButton(
                        icon = DrawableResIcon(iconsR.drawable.mozac_ic_plus_24),
                        text = StringResText(R.string.mozac_browser_menu_new_tab),
                        contentDescription = StringResContentDescription(R.string.mozac_browser_menu_new_tab),
                        onClick = AddNewTab(source),
                    ),
                )

                else -> listOf(
                    BrowserToolbarMenuButton(
                        icon = DrawableResIcon(iconsR.drawable.mozac_ic_private_mode_24),
                        text = StringResText(R.string.mozac_browser_menu_new_private_tab),
                        contentDescription = StringResContentDescription(R.string.mozac_browser_menu_new_private_tab),
                        onClick = AddNewPrivateTab(source),
                    ),
                )
            }
        }
    }

    private fun updateToolbarActionsBasedOnOrientation(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
    ) {
        appStore.observeWhileActive {
            distinctUntilChangedBy { it.orientation }
                .collect {
                    updateEndBrowserActions(context)
                    updateNavigationActions(context)
                }
        }
    }

    private fun updateTabsCount(context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>) {
        browserStore.observeWhileActive {
            distinctUntilChangedBy { it.tabs.size }
                .collect {
                    updateEndBrowserActions(context)
                    updateNavigationActions(context)
                }
        }
    }

    private inline fun <S : State, A : MVIAction> Store<S, A>.observeWhileActive(
        crossinline observe: suspend (Flow<S>.() -> Unit),
    ): Job? = environment?.viewLifecycleOwner?.run {
        lifecycleScope.launch {
            repeatOnLifecycle(RESUMED) {
                flow().observe()
            }
        }
    }

    private inline fun runWithinEnvironment(
        block: BrowserToolbarEnvironment.() -> Unit,
    ) = environment?.let { block(it) }

    private fun reconcileSelectedEngine(): SearchEngine? =
        appStore.state.searchState.selectedSearchEngine?.searchEngine
            ?: browserStore.state.search.selectedOrDefaultSearchEngine

    @VisibleForTesting
    internal enum class HomeToolbarAction {
        TabCounter,
        Menu,
        FakeBookmark,
        FakeShare,
        NewTab,
    }

    private data class HomeToolbarActionConfig(
        val action: HomeToolbarAction,
        val isVisible: () -> Boolean = { true },
    )

    @VisibleForTesting
    internal fun buildHomeAction(
        action: HomeToolbarAction,
        source: Source = Source.AddressBar,
    ): Action = when (action) {
        HomeToolbarAction.TabCounter -> {
            val environment = requireNotNull(environment)
            val isInPrivateMode = environment.browsingModeManager.mode.isPrivate
            val tabsCount = browserStore.state.getNormalOrPrivateTabs(isInPrivateMode).size

            val tabCounterDescription = if (isInPrivateMode) {
                environment.context.getString(
                    R.string.mozac_tab_counter_private,
                    tabsCount.toString(),
                )
            } else {
                environment.context.getString(
                    R.string.mozac_tab_counter_open_tab_tray,
                    tabsCount.toString(),
                )
            }

            TabCounterAction(
                count = tabsCount,
                contentDescription = tabCounterDescription,
                showPrivacyMask = isInPrivateMode,
                onClick = TabCounterClicked(source),
                onLongClick = buildTabCounterMenu(source),
            )
        }

        HomeToolbarAction.Menu -> ActionButtonRes(
            drawableResId = R.drawable.mozac_ic_ellipsis_vertical_24,
            contentDescription = R.string.content_description_menu,
            onClick = MenuClicked(source),
        )

        HomeToolbarAction.FakeBookmark -> ActionButtonRes(
            drawableResId = R.drawable.mozac_ic_bookmark_24,
            contentDescription = R.string.browser_menu_bookmark_this_page_2,
            state = ActionButton.State.DISABLED,
            onClick = FakeClicked,
        )

        HomeToolbarAction.FakeShare -> ActionButtonRes(
            drawableResId = R.drawable.mozac_ic_share_android_24,
            contentDescription = R.string.browser_menu_share,
            state = ActionButton.State.DISABLED,
            onClick = FakeClicked,
        )

        HomeToolbarAction.NewTab -> ActionButtonRes(
            drawableResId = R.drawable.mozac_ic_plus_24,
            contentDescription = if (environment?.browsingModeManager?.mode == Private) {
                R.string.home_screen_shortcut_open_new_private_tab_2
            } else {
                R.string.home_screen_shortcut_open_new_tab_2
            },
            onClick = if (environment?.browsingModeManager?.mode == Private) {
                AddNewPrivateTab(source)
            } else {
                AddNewTab(source)
            },
        )
    }
}
