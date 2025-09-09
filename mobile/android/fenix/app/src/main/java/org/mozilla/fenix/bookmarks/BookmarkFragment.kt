/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.core.content.getSystemService
import androidx.fragment.app.Fragment
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.navigation.NavDirections
import androidx.navigation.NavHostController
import androidx.navigation.fragment.findNavController
import mozilla.components.browser.state.state.searchEngines
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarState
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.EnvironmentCleared
import mozilla.components.compose.browser.toolbar.store.EnvironmentRehydrated
import mozilla.components.compose.browser.toolbar.store.Mode
import mozilla.components.concept.engine.EngineSession
import mozilla.components.support.base.feature.ViewBoundFeatureWrapper
import org.mozilla.fenix.BrowserDirection
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R
import org.mozilla.fenix.components.StoreProvider
import org.mozilla.fenix.components.VoiceSearchFeature
import org.mozilla.fenix.components.accounts.FenixFxAEntryPoint
import org.mozilla.fenix.components.appstate.qrScanner.QrScannerBinding
import org.mozilla.fenix.components.metrics.MetricsUtils
import org.mozilla.fenix.components.search.BOOKMARKS_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.toolbar.BrowserToolbarEnvironment
import org.mozilla.fenix.ext.bookmarkStorage
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.ext.hideToolbar
import org.mozilla.fenix.ext.nav
import org.mozilla.fenix.ext.requireComponents
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.pbmlock.registerForVerification
import org.mozilla.fenix.pbmlock.verifyUser
import org.mozilla.fenix.search.BrowserStoreToFenixSearchMapperMiddleware
import org.mozilla.fenix.search.BrowserToolbarSearchMiddleware
import org.mozilla.fenix.search.BrowserToolbarSearchStatusSyncMiddleware
import org.mozilla.fenix.search.BrowserToolbarToFenixSearchMapperMiddleware
import org.mozilla.fenix.search.FenixSearchMiddleware
import org.mozilla.fenix.search.SearchFragmentAction
import org.mozilla.fenix.search.SearchFragmentState
import org.mozilla.fenix.search.SearchFragmentStore
import org.mozilla.fenix.search.createInitialSearchFragmentState
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.lastSavedFolderCache
import kotlin.getValue

/**
 * The screen that displays the user's bookmark list in their Library.
 */
@Suppress("TooManyFunctions", "LargeClass")
class BookmarkFragment : Fragment() {

    private val verificationResultLauncher = registerForVerification()

    private val voiceSearchFeature by lazy(LazyThreadSafetyMode.NONE) {
        ViewBoundFeatureWrapper<VoiceSearchFeature>()
    }
    private val voiceSearchLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            voiceSearchFeature.get()?.handleVoiceSearchResult(result.resultCode, result.data)
        }

    @Suppress("LongMethod")
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View {
        return ComposeView(requireContext()).apply {
                setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
                val toolbarStore = buildToolbarStore()
                val searchStore = buildSearchStore(toolbarStore)
                val buildStore = { navController: NavHostController ->
                    val store = StoreProvider.get(this@BookmarkFragment) {
                        val lifecycleHolder = LifecycleHolder(
                            context = requireContext(),
                            navController = this@BookmarkFragment.findNavController(),
                            composeNavController = navController,
                            homeActivity = (requireActivity() as HomeActivity),
                        )

                        BookmarksStore(
                            initialState = BookmarksState.default.copy(
                                sortOrder = BookmarksListSortOrder.fromString(
                                    value = requireContext().settings().bookmarkListSortOrder,
                                    default = BookmarksListSortOrder.Alphabetical(true),
                                ),
                            ),
                            middleware = listOf(
                                // NB: Order matters — this middleware must be first to intercept actions
                                // related to private mode and trigger verification before any other middleware runs.
                                PrivateBrowsingLockMiddleware(
                                    appStore = requireComponents.appStore,
                                    requireAuth = {
                                        verifyUser(fallbackVerification = verificationResultLauncher)
                                    },
                                ),
                                BookmarksTelemetryMiddleware(),
                                BookmarksSyncMiddleware(requireComponents.backgroundServices.syncStore, lifecycleScope),
                                BrowserToolbarSyncToBookmarksMiddleware(toolbarStore, lifecycleScope),
                                BookmarksMiddleware(
                                    bookmarksStorage = requireContext().bookmarkStorage,
                                    clipboardManager = requireActivity().getSystemService(),
                                    addNewTabUseCase = requireComponents.useCases.tabsUseCases.addTab,
                                    navigateToSignIntoSync = {
                                        lifecycleHolder.navController
                                            .navigate(
                                                BookmarkFragmentDirections.actionGlobalTurnOnSync(
                                                    entrypoint = FenixFxAEntryPoint.BookmarkView,
                                                ),
                                            )
                                    },
                                    getNavController = { lifecycleHolder.composeNavController },
                                    exitBookmarks = { lifecycleHolder.navController.popBackStack() },
                                    wasPreviousAppDestinationHome = {
                                        lifecycleHolder.navController
                                            .previousBackStackEntry?.destination?.id == R.id.homeFragment
                                    },
                                    useNewSearchUX = settings().shouldUseComposableToolbar,
                                    navigateToSearch = {
                                        lifecycleHolder.navController.navigate(
                                            NavGraphDirections.actionGlobalSearchDialog(sessionId = null),
                                        )
                                    },
                                    shareBookmarks = { bookmarks ->
                                        lifecycleHolder.navController.nav(
                                            R.id.bookmarkFragment,
                                            BookmarkFragmentDirections.actionGlobalShareFragment(
                                                data = bookmarks.asShareDataArray(),
                                            ),
                                        )
                                    },
                                    showTabsTray = ::showTabTray,
                                    resolveFolderTitle = {
                                        friendlyRootTitle(
                                            context = lifecycleHolder.context,
                                            node = it,
                                            rootTitles = composeRootTitles(lifecycleHolder.context),
                                        ) ?: ""
                                    },
                                    getBrowsingMode = {
                                        lifecycleHolder.homeActivity.browsingModeManager.mode
                                    },
                                    openTab = { url, openInNewTab ->
                                        lifecycleHolder.homeActivity.openToBrowserAndLoad(
                                            searchTermOrURL = url,
                                            newTab = openInNewTab,
                                            from = BrowserDirection.FromBookmarks,
                                            flags = EngineSession.LoadUrlFlags.select(
                                                EngineSession.LoadUrlFlags.ALLOW_JAVASCRIPT_URL,
                                            ),
                                        )
                                    },
                                    saveBookmarkSortOrder = {
                                        lifecycleHolder.context.settings().bookmarkListSortOrder = it.asString
                                    },
                                    lastSavedFolderCache = context.settings().lastSavedFolderCache,
                                ),
                            ),
                            lifecycleHolder = lifecycleHolder,
                        )
                    }

                    store.lifecycleHolder?.apply {
                        this.navController = this@BookmarkFragment.findNavController()
                        this.composeNavController = navController
                        this.homeActivity = (requireActivity() as HomeActivity)
                        this.context = requireContext()
                    }

                    store
                }
                setContent {
                    FirefoxTheme {
                        BookmarksScreen(
                            buildStore = buildStore,
                            appStore = requireComponents.appStore,
                            toolbarStore = toolbarStore,
                            searchStore = searchStore,
                            bookmarksSearchEngine = requireComponents.core.store.state.search.searchEngines
                                .firstOrNull { it.id == BOOKMARKS_SEARCH_ENGINE_ID },
                            useNewSearchUX = settings().shouldUseComposableToolbar,
                        )
                    }
                }
            }
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        if (requireContext().settings().shouldUseComposableToolbar) {
            QrScannerBinding.register(this)
            voiceSearchFeature.set(
                feature = VoiceSearchFeature(
                    context = requireContext(),
                    appStore = requireContext().components.appStore,
                    voiceSearchLauncher = voiceSearchLauncher,
                ),
                owner = viewLifecycleOwner,
                view = view,
            )
        }
    }

    private fun buildToolbarStore() = when (requireComponents.settings.shouldUseComposableToolbar) {
        false -> {
            // Default empty store. This is not used without the composable toolbar.
            BrowserToolbarStore(BrowserToolbarState(mode = Mode.EDIT))
        }
        else -> StoreProvider.get(this) {
            BrowserToolbarStore(
                initialState = BrowserToolbarState(mode = Mode.EDIT),
                middleware = listOf(
                    BrowserToolbarSearchStatusSyncMiddleware(requireComponents.appStore),
                    BrowserToolbarSearchMiddleware(
                        appStore = requireComponents.appStore,
                        browserStore = requireComponents.core.store,
                        components = requireComponents,
                        settings = requireComponents.settings,
                    ),
                ),
            )
        }.also {
            it.dispatch(
                EnvironmentRehydrated(
                    BrowserToolbarEnvironment(
                        context = requireContext(),
                        viewLifecycleOwner = viewLifecycleOwner,
                        navController = findNavController(),
                        browsingModeManager = (requireActivity() as HomeActivity).browsingModeManager,
                    ),
                ),
            )

            viewLifecycleOwner.lifecycle.addObserver(
                object : DefaultLifecycleObserver {
                    override fun onDestroy(owner: LifecycleOwner) {
                        it.dispatch(EnvironmentCleared)
                    }
                },
            )
        }
    }

    private fun buildSearchStore(
        toolbarStore: BrowserToolbarStore,
    ) = when (requireComponents.settings.shouldUseComposableToolbar) {
        false -> {
            // Default empty store. This is not used without the composable toolbar.
            SearchFragmentStore(SearchFragmentState.EMPTY)
        }
        else -> StoreProvider.get(this) {
            SearchFragmentStore(
                initialState = createInitialSearchFragmentState(
                    activity = requireActivity() as HomeActivity,
                    components = requireComponents,
                    tabId = null,
                    pastedText = null,
                    searchAccessPoint = MetricsUtils.Source.NONE,
                ),
                middleware = listOf(
                    BrowserToolbarToFenixSearchMapperMiddleware(toolbarStore),
                    BrowserStoreToFenixSearchMapperMiddleware(requireComponents.core.store),
                    FenixSearchMiddleware(
                        engine = requireComponents.core.engine,
                        useCases = requireComponents.useCases,
                        nimbusComponents = requireComponents.nimbus,
                        settings = requireComponents.settings,
                        appStore = requireComponents.appStore,
                        browserStore = requireComponents.core.store,
                        toolbarStore = toolbarStore,
                    ),
                ),
            )
        }.also {
            it.dispatch(
                SearchFragmentAction.EnvironmentRehydrated(
                    SearchFragmentStore.Environment(
                        context = requireContext(),
                        viewLifecycleOwner = viewLifecycleOwner,
                        browsingModeManager = (requireActivity() as HomeActivity).browsingModeManager,
                        navController = findNavController(),
                    ),
                ),
            )

            viewLifecycleOwner.lifecycle.addObserver(
                object : DefaultLifecycleObserver {
                    override fun onDestroy(owner: LifecycleOwner) {
                        it.dispatch(SearchFragmentAction.EnvironmentCleared)
                    }
                },
            )
        }
    }

    override fun onResume() {
        super.onResume()
        hideToolbar()
    }

    private fun showTabTray(openInPrivate: Boolean = false) {
        val directions = if (requireContext().settings().tabManagerEnhancementsEnabled) {
            BookmarkFragmentDirections.actionGlobalTabManagementFragment(
                page = if (openInPrivate) {
                    Page.PrivateTabs
                } else {
                    Page.NormalTabs
                },
            )
        } else {
            BookmarkFragmentDirections.actionGlobalTabsTrayFragment(
                page = if (openInPrivate) {
                    Page.PrivateTabs
                } else {
                    Page.NormalTabs
                },
            )
        }
        navigateToBookmarkFragment(directions = directions)
    }

    private fun navigateToBookmarkFragment(directions: NavDirections) {
        findNavController().nav(
            R.id.bookmarkFragment,
            directions,
        )
    }
}
