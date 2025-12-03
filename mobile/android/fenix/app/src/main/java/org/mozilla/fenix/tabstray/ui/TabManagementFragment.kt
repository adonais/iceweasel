/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.activity.result.ActivityResultLauncher
import androidx.annotation.UiThread
import androidx.annotation.VisibleForTesting
import androidx.biometric.BiometricManager
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.fragment.app.DialogFragment
import androidx.fragment.app.activityViewModels
import androidx.fragment.app.setFragmentResultListener
import androidx.fragment.compose.content
import androidx.lifecycle.lifecycleScope
import androidx.navigation.NavController
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mozilla.appservices.places.BookmarkRoot
import mozilla.components.browser.state.selector.normalTabs
import mozilla.components.browser.state.selector.privateTabs
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.compose.base.snackbar.displaySnackbar
import mozilla.components.concept.base.crash.Breadcrumb
import mozilla.components.feature.accounts.push.CloseTabsUseCases
import mozilla.components.feature.downloads.ui.DownloadCancelDialogFragment
import mozilla.components.feature.tabs.tabstray.TabsFeature
import mozilla.components.lib.state.ext.observeAsState
import mozilla.components.support.base.feature.ViewBoundFeatureWrapper
import mozilla.components.support.ktx.android.view.setSystemBarsBackground
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.Config
import org.mozilla.fenix.GleanMetrics.PrivateBrowsingLocked
import org.mozilla.fenix.GleanMetrics.TabsTray
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.R
import org.mozilla.fenix.components.StoreProvider
import org.mozilla.fenix.ext.actualInactiveTabs
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.ext.getBottomToolbarHeight
import org.mozilla.fenix.ext.getTopToolbarHeight
import org.mozilla.fenix.ext.hideToolbar
import org.mozilla.fenix.ext.pixelSizeFor
import org.mozilla.fenix.ext.registerForActivityResult
import org.mozilla.fenix.ext.requireComponents
import org.mozilla.fenix.ext.runIfFragmentIsAttached
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.home.HomeScreenViewModel
import org.mozilla.fenix.navigation.DefaultNavControllerProvider
import org.mozilla.fenix.navigation.NavControllerProvider
import org.mozilla.fenix.pbmlock.registerForVerification
import org.mozilla.fenix.pbmlock.verifyUser
import org.mozilla.fenix.settings.biometric.DefaultBiometricUtils
import org.mozilla.fenix.settings.biometric.ext.isAuthenticatorAvailable
import org.mozilla.fenix.settings.biometric.ext.isHardwareAvailable
import org.mozilla.fenix.share.ShareFragment
import org.mozilla.fenix.tabstray.InactiveTabsBinding
import org.mozilla.fenix.tabstray.Page
import org.mozilla.fenix.tabstray.TabsTrayAccessPoint
import org.mozilla.fenix.tabstray.TabsTrayAction
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayStore
import org.mozilla.fenix.tabstray.TabsTrayTelemetryMiddleware
import org.mozilla.fenix.tabstray.binding.SecureTabManagerBinding
import org.mozilla.fenix.tabstray.browser.TabSorter
import org.mozilla.fenix.tabstray.controller.DefaultTabManagerController
import org.mozilla.fenix.tabstray.controller.DefaultTabManagerInteractor
import org.mozilla.fenix.tabstray.controller.TabManagerController
import org.mozilla.fenix.tabstray.controller.TabManagerInteractor
import org.mozilla.fenix.tabstray.syncedtabs.SyncedTabsIntegration
import org.mozilla.fenix.tabstray.ui.tabstray.TabsTray
import org.mozilla.fenix.tabstray.ui.theme.getTabManagerTheme
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.theme.ThemeManager
import org.mozilla.fenix.utils.Settings
import org.mozilla.fenix.utils.getSnackbarTimeout
import kotlin.math.abs

/**
 * The fullscreen fragment for displaying the tabs management UI.
 */
@Suppress("TooManyFunctions", "LargeClass")
class TabManagementFragment : DialogFragment() {

    private lateinit var tabManagerInteractor: TabManagerInteractor
    private lateinit var tabManagerController: TabManagerController
    private lateinit var enablePbmPinLauncher: ActivityResultLauncher<Intent>

    @VisibleForTesting
    internal var verificationResultLauncher: ActivityResultLauncher<Intent> =
        registerForVerification(onVerified = ::openPrivateTabsPage)

    @VisibleForTesting internal lateinit var tabsTrayStore: TabsTrayStore

    private val inactiveTabsBinding = ViewBoundFeatureWrapper<InactiveTabsBinding>()
    private val secureTabManagerBinding = ViewBoundFeatureWrapper<SecureTabManagerBinding>()
    private val tabsFeature = ViewBoundFeatureWrapper<TabsFeature>()
    private val syncedTabsIntegration = ViewBoundFeatureWrapper<SyncedTabsIntegration>()
    private lateinit var snackbarHostState: SnackbarHostState

    @Suppress("LongMethod")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        recordBreadcrumb("TabManagementFragment onCreate")

        val args by navArgs<TabManagementFragmentArgs>()
        args.accessPoint.takeIf { it != TabsTrayAccessPoint.None }?.let {
            TabsTray.accessPoint[it.name.lowercase()].add()
        }
        val initialMode = if (args.enterMultiselect) {
            TabsTrayState.Mode.Select(emptySet())
        } else {
            TabsTrayState.Mode.Normal
        }
        val initialPage = args.page
        val activity = activity as HomeActivity
        val initialInactiveExpanded = requireComponents.appStore.state.inactiveTabsExpanded
        val inactiveTabs = requireComponents.core.store.state.actualInactiveTabs(requireContext().settings())
        val normalTabs = requireComponents.core.store.state.normalTabs - inactiveTabs.toSet()

        enablePbmPinLauncher = registerForActivityResult(
            onSuccess = {
                PrivateBrowsingLocked.authSuccess.record()
                PrivateBrowsingLocked.featureEnabled.record()
                requireContext().settings().privateBrowsingModeLocked = true
            },
            onFailure = {
                PrivateBrowsingLocked.authFailure.record()
            },
        )

        tabsTrayStore = StoreProvider.get(this) {
            TabsTrayStore(
                initialState = TabsTrayState(
                    selectedPage = initialPage,
                    mode = initialMode,
                    inactiveTabs = inactiveTabs,
                    inactiveTabsExpanded = initialInactiveExpanded,
                    normalTabs = normalTabs,
                    privateTabs = requireComponents.core.store.state.privateTabs,
                    selectedTabId = requireComponents.core.store.state.selectedTabId,
                ),
                middlewares = listOf(
                    TabsTrayTelemetryMiddleware(requireComponents.nimbus.events),
                ),
            )
        }

        tabManagerController = DefaultTabManagerController(
            accountManager = requireComponents.backgroundServices.accountManager,
            activity = activity,
            appStore = requireComponents.appStore,
            tabsTrayStore = tabsTrayStore,
            browserStore = requireComponents.core.store,
            settings = requireContext().settings(),
            browsingModeManager = activity.browsingModeManager,
            navController = findNavController(),
            navigateToHomeAndDeleteSession = ::navigateToHomeAndDeleteSession,
            profiler = requireComponents.core.engine.profiler,
            tabsUseCases = requireComponents.useCases.tabsUseCases,
            fenixBrowserUseCases = requireComponents.useCases.fenixBrowserUseCases,
            closeSyncedTabsUseCases = requireComponents.useCases.closeSyncedTabsUseCases,
            bookmarksStorage = requireComponents.core.bookmarksStorage,
            ioDispatcher = Dispatchers.IO,
            collectionStorage = requireComponents.core.tabCollectionStorage,
            showUndoSnackbarForTab = ::showUndoSnackbarForTab,
            showUndoSnackbarForInactiveTab = ::showUndoSnackbarForInactiveTab,
            showUndoSnackbarForSyncedTab = ::showUndoSnackbarForSyncedTab,
            showCancelledDownloadWarning = ::showCancelledDownloadWarning,
            showCollectionSnackbar = ::showCollectionSnackbar,
            showBookmarkSnackbar = ::showBookmarkSnackbar,
        )

        tabManagerInteractor = DefaultTabManagerInteractor(
            controller = tabManagerController,
        )

        setStyle(STYLE_NO_TITLE, R.style.TabManagerDialogStyle)
    }

    @Suppress("LongMethod")
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View? {
        // Remove the window dimming so the Toolbar UI from Home/Browser is still visible during the transition
        dialog?.window?.setDimAmount(0f)

        return content {
            val page by tabsTrayStore.observeAsState(tabsTrayStore.state.selectedPage) { it.selectedPage }
            val isPbmLocked by requireComponents.appStore
                .observeAsState(initialValue = requireComponents.appStore.state.isPrivateScreenLocked) {
                    it.isPrivateScreenLocked
                }
            val density = LocalDensity.current
            val tabManagerAnimationHelper = remember {
                DefaultTabManagerAnimationHelper(
                    selectedTab = requireComponents.core.store.state.selectedTab,
                    animationsEnabled = requireContext().settings().tabManagerOpeningAnimationEnabled,
                    initialPage = tabsTrayStore.state.selectedPage,
                    previousDestinationId = findNavController().previousBackStackEntry?.destination?.id,
                    homepageAsANewTabEnabled = requireContext().settings().enableHomepageAsNewTab,
                    topToolbarHeight = with(density) { getTopToolbarHeight().toDp() },
                    bottomToolbarHeight = with(density) { getBottomToolbarHeight().toDp() },
                )
            }

            snackbarHostState = remember { SnackbarHostState() }

            BackHandler {
                when {
                    tabsTrayStore.state.mode is TabsTrayState.Mode.Select -> {
                        tabsTrayStore.dispatch(TabsTrayAction.ExitSelectMode)
                    }
                    tabManagerAnimationHelper.shouldAnimateOnTabManagerOpen -> {
                        // Perform the transition to return to the selected tab when the back button is pressed
                        // and the Tab Manager animated on entry.
                        tabManagerAnimationHelper.leaveTabManager()
                    }
                    else -> {
                        onTabsTrayDismissed()
                    }
                }
            }

            FirefoxTheme(theme = getTabManagerTheme(page = page)) {
                val navBarColor = MaterialTheme.colorScheme.surfaceContainerHigh.toArgb()
                val statusBarColor = MaterialTheme.colorScheme.surface.toArgb()

                LaunchedEffect(page) {
                    dialog?.window?.setSystemBarsBackground(
                        statusBarColor = statusBarColor,
                        navigationBarColor = navBarColor,
                    )
                }

                TabManagerTransitionLayout(
                    tabManagerAnimationHelper = tabManagerAnimationHelper,
                    onExitTransitionCompleted = onExitTransitionCompleted@{
                        // The transition has finished so we initiate the tab selection logic.
                        // Safe check to confirm the state is [ThumbnailToTabManager] and the Tab Manager
                        // wasn't left to open a new tab or navigate to a screen other than browser/home.
                        val safeState =
                            tabManagerAnimationHelper.state as? TabManagerAnimationState.TabManagerToThumbnail
                        safeState ?: return@onExitTransitionCompleted

                        onTabClick(tab = safeState.tab)
                    },
                ) {
                    TabsTray(
                        tabsTrayStore = tabsTrayStore,
                        displayTabsInGrid = requireContext().settings().gridTabView,
                        isInDebugMode = Config.channel.isDebug ||
                                requireComponents.settings.showSecretDebugMenuThisSession,
                        shouldShowTabAutoCloseBanner = requireContext().settings().shouldShowAutoCloseTabsBanner &&
                                requireContext().settings().canShowCfr,
                        shouldShowLockPbmBanner = shouldShowLockPbmBanner(
                            isPrivateMode = (activity as HomeActivity).browsingModeManager.mode.isPrivate,
                            hasPrivateTabs = requireComponents.core.store.state.privateTabs.isNotEmpty(),
                            biometricAvailable = BiometricManager.from(requireContext())
                                .isHardwareAvailable(),
                            privateLockEnabled = requireContext().settings().privateBrowsingModeLocked,
                            shouldShowBanner = shouldShowBanner(requireContext().settings()),
                        ),
                        snackbarHostState = snackbarHostState,
                        isSignedIn = requireContext().settings().signedInFxaAccount,
                        isPbmLocked = isPbmLocked,
                        shouldShowInactiveTabsAutoCloseDialog =
                            requireContext().settings()::shouldShowInactiveTabsAutoCloseDialog,
                        onTabPageClick = { page ->
                            onTabPageClick(
                                tabsTrayInteractor = tabManagerInteractor,
                                page = page,
                            )
                        },
                        onTabClose = { tab ->
                            tabManagerInteractor.onTabClosed(tab, TAB_MANAGER_FEATURE_NAME)
                        },
                        onTabClick = { tab ->
                            if (tabManagerAnimationHelper.animationsEnabled &&
                                tabsTrayStore.state.mode is TabsTrayState.Mode.Normal
                            ) {
                                tabManagerAnimationHelper.transitionToThumbnail(tab = tab)
                            } else {
                                onTabClick(tab = tab)
                            }
                        },
                        onTabLongClick = tabManagerInteractor::onTabLongClicked,
                        onInactiveTabsHeaderClick = tabManagerInteractor::onInactiveTabsHeaderClicked,
                        onDeleteAllInactiveTabsClick = tabManagerInteractor::onDeleteAllInactiveTabsClicked,
                        onInactiveTabsAutoCloseDialogShown = {
                            tabsTrayStore.dispatch(TabsTrayAction.TabAutoCloseDialogShown)
                        },
                        onInactiveTabAutoCloseDialogCloseButtonClick =
                            tabManagerInteractor::onAutoCloseDialogCloseButtonClicked,
                        onEnableInactiveTabAutoCloseClick = {
                            tabManagerInteractor.onEnableAutoCloseClicked()
                            showInactiveTabsAutoCloseConfirmationSnackbar()
                        },
                        onInactiveTabClick = tabManagerInteractor::onInactiveTabClicked,
                        onInactiveTabClose = tabManagerInteractor::onInactiveTabClosed,
                        onSyncedTabClick = tabManagerInteractor::onSyncedTabClicked,
                        onSyncedTabClose = tabManagerInteractor::onSyncedTabClosed,
                        onSignInClick = tabManagerInteractor::onSignInClicked,
                        onSaveToCollectionClick = tabManagerInteractor::onAddSelectedTabsToCollectionClicked,
                        onShareSelectedTabsClick = tabManagerInteractor::onShareSelectedTabs,

                        onTabSettingsClick = tabManagerController::onTabSettingsClicked,
                        onRecentlyClosedClick = tabManagerController::onOpenRecentlyClosedClicked,
                        onAccountSettingsClick = tabManagerController::onAccountSettingsClicked,
                        onDeleteAllTabsClick = {
                            if (tabsTrayStore.state.selectedPage == Page.NormalTabs) {
                                tabsTrayStore.dispatch(TabsTrayAction.CloseAllNormalTabs)
                            } else if (tabsTrayStore.state.selectedPage == Page.PrivateTabs) {
                                tabsTrayStore.dispatch(TabsTrayAction.CloseAllPrivateTabs)
                            }

                            tabManagerController.onCloseAllTabsClicked(
                                private = tabsTrayStore.state.selectedPage == Page.PrivateTabs,
                            )
                        },
                        onDeleteSelectedTabsClick = tabManagerInteractor::onDeleteSelectedTabsClicked,
                        onBookmarkSelectedTabsClick = tabManagerInteractor::onBookmarkSelectedTabsClicked,
                        onForceSelectedTabsAsInactiveClick = tabManagerInteractor::onForceSelectedTabsAsInactiveClicked,

                        onTabsTrayPbmLockedClick = ::onTabsTrayPbmLockedClick,
                        onTabsTrayPbmLockedDismiss = {
                            requireContext().settings().shouldShowLockPbmBanner = false
                            PrivateBrowsingLocked.bannerNegativeClicked.record()
                        },
                        onTabAutoCloseBannerViewOptionsClick = {
                            tabManagerController.onTabSettingsClicked()
                            requireContext().settings().shouldShowAutoCloseTabsBanner =
                                false
                            requireContext().settings().lastCfrShownTimeInMillis =
                                System.currentTimeMillis()
                        },
                        onTabAutoCloseBannerDismiss = {
                            requireContext().settings().shouldShowAutoCloseTabsBanner =
                                false
                            requireContext().settings().lastCfrShownTimeInMillis =
                                System.currentTimeMillis()
                        },
                        onTabAutoCloseBannerShown = {},
                        onMove = tabManagerInteractor::onTabsMove,
                        shouldShowInactiveTabsCFR = {
                            requireContext().settings().shouldShowInactiveTabsOnboardingPopup &&
                                    requireContext().settings().canShowCfr
                        },
                        onInactiveTabsCFRShown = {
                            TabsTray.inactiveTabsCfrVisible.record(NoExtras())
                        },
                        onInactiveTabsCFRClick = {
                            requireContext().settings().shouldShowInactiveTabsOnboardingPopup =
                                false
                            requireContext().settings().lastCfrShownTimeInMillis =
                                System.currentTimeMillis()
                            tabManagerController.onTabSettingsClicked()
                            TabsTray.inactiveTabsCfrSettings.record(NoExtras())
                        },
                        onInactiveTabsCFRDismiss = {
                            requireContext().settings().shouldShowInactiveTabsOnboardingPopup =
                                false
                            requireContext().settings().lastCfrShownTimeInMillis =
                                System.currentTimeMillis()
                            TabsTray.inactiveTabsCfrDismissed.record(NoExtras())
                        },
                        onOpenNewNormalTabClicked = tabManagerInteractor::onNormalTabsFabClicked,
                        onOpenNewPrivateTabClicked = tabManagerInteractor::onPrivateTabsFabClicked,
                        onSyncedTabsFabClicked = tabManagerInteractor::onSyncedTabsFabClicked,
                        onUnlockPbmClick = { verifyUser(fallbackVerification = verificationResultLauncher) },
                    )
                }
            }
        }
    }

    private fun onTabClick(tab: TabSessionState) {
        if (!requireContext().settings().hasShownTabSwipeCFR &&
            !requireContext().settings().isTabStripEnabled &&
            requireContext().settings().isSwipeToolbarToSwitchTabsEnabled
        ) {
            val normalTabs = tabsTrayStore.state.normalTabs
            val currentTabId = tabsTrayStore.state.selectedTabId

            if (normalTabs.size >= 2 && currentTabId != null) {
                val currentTabPosition = getTabPositionFromId(normalTabs, currentTabId)
                val newTabPosition = getTabPositionFromId(normalTabs, tab.id)

                if (abs(currentTabPosition - newTabPosition) == 1) {
                    requireContext().settings().shouldShowTabSwipeCFR =
                        true
                }
            }
        }

        tabManagerInteractor.onTabSelected(
            tab = tab,
            source = TAB_MANAGER_FEATURE_NAME,
        )
    }

    override fun onPause() {
        super.onPause()
        recordBreadcrumb("TabManagementFragment onPause")
    }

    private fun shouldShowBanner(settings: Settings) =
        with(settings) { privateBrowsingLockedFeatureEnabled && shouldShowLockPbmBanner }

    override fun onStart() {
        super.onStart()
        recordBreadcrumb("TabManagementFragment onStart")
        findPreviousDialogFragment()?.let { dialog ->
            dialog.onAcceptClicked = ::onCancelDownloadWarningAccepted
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        recordBreadcrumb("TabManagementFragment onDestroyView")
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        TabsTray.opened.record(NoExtras())

        inactiveTabsBinding.set(
            feature = InactiveTabsBinding(
                tabsTrayStore = tabsTrayStore,
                appStore = requireComponents.appStore,
            ),
            owner = this,
            view = view,
        )

        tabsFeature.set(
            feature = TabsFeature(
                tabsTray = TabSorter(
                    requireContext().settings(),
                    tabsTrayStore,
                ),
                store = requireContext().components.core.store,
            ),
            owner = this,
            view = view,
        )

        secureTabManagerBinding.set(
            feature = SecureTabManagerBinding(
                store = tabsTrayStore,
                settings = requireComponents.settings,
                fragment = this,
            ),
            owner = this,
            view = view,
        )

        syncedTabsIntegration.set(
            feature = SyncedTabsIntegration(
                store = tabsTrayStore,
                context = requireContext(),
                navController = findNavController(),
                storage = requireComponents.backgroundServices.syncedTabsStorage,
                commands = requireComponents.backgroundServices.syncedTabsCommands,
                accountManager = requireComponents.backgroundServices.accountManager,
                lifecycleOwner = this,
            ),
            owner = this,
            view = view,
        )

        setFragmentResultListener(ShareFragment.RESULT_KEY) { _, _ ->
            dismissTabManager()
        }
    }

    override fun onResume() {
        super.onResume()
        hideToolbar()
    }

    private fun onCancelDownloadWarningAccepted(tabId: String?, source: String?) {
        if (tabId != null) {
            tabManagerInteractor.onDeletePrivateTabWarningAccepted(tabId, source)
        } else {
            tabManagerController.onCloseAllPrivateTabsWarningConfirmed(private = true)
        }
    }

    private fun showCancelledDownloadWarning(downloadCount: Int, tabId: String?, source: String?) {
        recordBreadcrumb("DownloadCancelDialogFragment show")

        val dialog = DownloadCancelDialogFragment.newInstance(
            downloadCount = downloadCount,
            tabId = tabId,
            source = source,
            promptStyling = DownloadCancelDialogFragment.PromptStyling(
                gravity = Gravity.BOTTOM,
                shouldWidthMatchParent = true,
                positiveButtonBackgroundColor = ThemeManager.resolveAttribute(
                    R.attr.accent,
                    requireContext(),
                ),
                positiveButtonTextColor = ThemeManager.resolveAttribute(
                    R.attr.textOnColorPrimary,
                    requireContext(),
                ),
                positiveButtonRadius = pixelSizeFor(R.dimen.tab_corner_radius).toFloat(),
            ),

            onPositiveButtonClicked = ::onCancelDownloadWarningAccepted,
        )
        dialog.show(parentFragmentManager, DOWNLOAD_CANCEL_DIALOG_FRAGMENT_TAG)
    }

    @UiThread
    internal fun showUndoSnackbarForSyncedTab(closeOperation: CloseTabsUseCases.UndoableOperation) {
        lifecycleScope.launch {
            snackbarHostState.displaySnackbar(
                message = getString(R.string.snackbar_tab_closed),
                actionLabel = getString(R.string.snackbar_deleted_undo),
                timeout = requireContext().getSnackbarTimeout(hasAction = true),
                onActionPerformed = { closeOperation.undo() },
            )
        }
    }

    private fun showUndoSnackbarForTab(isPrivate: Boolean) {
        val snackbarMessage =
            when (isPrivate) {
                true -> getString(R.string.snackbar_private_tab_closed)
                false -> getString(R.string.snackbar_tab_closed)
            }
        val page = if (isPrivate) Page.PrivateTabs else Page.NormalTabs
        val undoUseCases = requireComponents.useCases.tabsUseCases.undo

        lifecycleScope.launch {
            snackbarHostState.displaySnackbar(
                message = snackbarMessage,
                actionLabel = getString(R.string.snackbar_deleted_undo),
                timeout = requireContext().getSnackbarTimeout(hasAction = true),
                onActionPerformed = {
                    undoUseCases.invoke()
                    runIfFragmentIsAttached {
                        tabsTrayStore.dispatch(TabsTrayAction.PageSelected(page))
                    }
                },
            )
        }
    }

    private fun showUndoSnackbarForInactiveTab(numClosed: Int) {
        val snackbarMessage =
            when (numClosed == 1) {
                true -> getString(R.string.snackbar_tab_closed)
                false -> getString(R.string.snackbar_num_tabs_closed, numClosed.toString())
            }

        lifecycleScope.launch {
            snackbarHostState.displaySnackbar(
                message = snackbarMessage,
                actionLabel = getString(R.string.snackbar_deleted_undo),
                timeout = requireContext().getSnackbarTimeout(hasAction = true),
                onActionPerformed = {
                    requireComponents.useCases.tabsUseCases.undo.invoke()
                    tabsTrayStore.dispatch(TabsTrayAction.PageSelected(Page.NormalTabs))
                },
            )
        }
    }

    internal val homeViewModel: HomeScreenViewModel by activityViewModels()

    @VisibleForTesting
    internal fun navigateToHomeAndDeleteSession(
        sessionId: String,
        navControllerProvider: NavControllerProvider = DefaultNavControllerProvider(),
    ) {
        homeViewModel.sessionToDelete = sessionId
        navControllerProvider
            .getNavController(this)
            .navigate(TabManagementFragmentDirections.actionGlobalHome())
    }

    @VisibleForTesting
    internal fun getTabPositionFromId(tabsList: List<TabSessionState>, tabId: String): Int {
        tabsList.forEachIndexed { index, tab -> if (tab.id == tabId) return index }
        return -1
    }

    /**
     * Dismisses the Tab Manager.
     *
     * @param navController [NavController] used to perform the navigation action.
     */
    @VisibleForTesting
    internal fun dismissTabManager(
        navController: NavController = findNavController(),
    ) {
        // This should always be the last thing we do because nothing (e.g. telemetry)
        // is guaranteed after that.
        recordBreadcrumb("TabManagementFragment dismissTabManager")
        navController.popBackStack()
    }

    /**
     * Records a breadcrumb for crash reporting.
     *
     * @param message The message to record.
     */
    @VisibleForTesting
    internal fun recordBreadcrumb(message: String) {
        context?.components?.analytics?.crashReporter?.recordCrashBreadcrumb(
            Breadcrumb(message = message),
        )
    }

    private fun showCollectionSnackbar(
        tabSize: Int,
        isNewCollection: Boolean = false,
    ) {
        val messageResId = when {
            isNewCollection -> R.string.create_collection_tabs_saved_new_collection_2
            tabSize == 1 -> R.string.create_collection_tab_saved_2
            else -> return // Don't show snackbar for multiple tabs
        }
        lifecycleScope.launch {
            snackbarHostState.displaySnackbar(
                message = getString(messageResId),
                timeout = requireContext().getSnackbarTimeout(hasAction = false),
            )
        }
    }

    private fun showBookmarkSnackbar(
        tabSize: Int,
        parentFolderTitle: String?,
    ) {
        val displayFolderTitle = parentFolderTitle ?: getString(R.string.library_bookmarks)
        val displayResId = when {
            tabSize > 1 -> {
                R.string.snackbar_message_bookmarks_saved_in_2
            }
            else -> {
                R.string.bookmark_saved_in_folder_snackbar
            }
        }
        lifecycleScope.launch {
            snackbarHostState.displaySnackbar(
                message = getString(displayResId, displayFolderTitle),
                actionLabel = getString(R.string.create_collection_view),
                timeout = requireContext().getSnackbarTimeout(hasAction = true),
                onActionPerformed = {
                    findNavController().navigate(
                        TabManagementFragmentDirections.actionGlobalBookmarkFragment(BookmarkRoot.Mobile.id),
                    )
                },
            )
        }
    }

    private fun findPreviousDialogFragment(): DownloadCancelDialogFragment? {
        return parentFragmentManager
            .findFragmentByTag(DOWNLOAD_CANCEL_DIALOG_FRAGMENT_TAG) as? DownloadCancelDialogFragment
    }

    private fun showInactiveTabsAutoCloseConfirmationSnackbar() {
        lifecycleScope.launch {
            snackbarHostState.displaySnackbar(
                message = getString(R.string.inactive_tabs_auto_close_message_snackbar),
                timeout = requireContext().getSnackbarTimeout(hasAction = false),
            )
        }
    }

    /**
     * This can only turn the feature ON and should not handle turning the feature OFF.
     */
    private fun onTabsTrayPbmLockedClick(
        navControllerProvider: NavControllerProvider = DefaultNavControllerProvider(),
    ) {
        val isAuthenticatorAvailable =
            BiometricManager.from(requireContext()).isAuthenticatorAvailable()
        if (!isAuthenticatorAvailable) {
            navControllerProvider.getNavController(this)
                .navigate(TabManagementFragmentDirections.actionGlobalPrivateBrowsingFragment())
        } else {
            DefaultBiometricUtils.bindBiometricsCredentialsPromptOrShowWarning(
                titleRes = R.string.pbm_authentication_enable_lock,
                view = requireView(),
                onShowPinVerification = { intent -> enablePbmPinLauncher.launch(intent) },
                onAuthSuccess = {
                    PrivateBrowsingLocked.bannerPositiveClicked.record()
                    PrivateBrowsingLocked.authSuccess.record()
                    PrivateBrowsingLocked.featureEnabled.record()
                    requireContext().settings().privateBrowsingModeLocked = true
                    requireContext().settings().shouldShowLockPbmBanner = false
                },
                onAuthFailure = {
                    PrivateBrowsingLocked.authFailure.record()
                },
            )
        }
    }

    private fun onTabsTrayDismissed() {
        recordBreadcrumb("TabManagementFragment onTabsTrayDismissed")
        TabsTray.closed.record(NoExtras())
        dismissTabManager()
    }

    @VisibleForTesting
    internal fun onTabPageClick(
        tabsTrayInteractor: TabManagerInteractor,
        page: Page,
    ) {
        tabsTrayInteractor.onTabPageClicked(page)
    }

    private fun openPrivateTabsPage() {
        tabManagerInteractor.onTabPageClicked(Page.PrivateTabs)
    }

    /**
     * Determines whether the Lock Private Browsing Mode banner should be shown.
     *
     * The banner is shown only when all of the following conditions are met:
     * - The app is currently in private browsing mode
     * - There are existing private tabs open
     * - Biometric hardware is available on the device
     * - The user has not already enabled the private browsing lock
     * - The user has not already dismissed or acknowledged the Pbm banner from tabs tray
     *
     * We only want to show the banner when the feature is available,
     * applicable, and relevant to the current user context.
     */
    @VisibleForTesting
    internal fun shouldShowLockPbmBanner(
        isPrivateMode: Boolean,
        hasPrivateTabs: Boolean,
        biometricAvailable: Boolean,
        privateLockEnabled: Boolean,
        shouldShowBanner: Boolean,
    ): Boolean {
        return isPrivateMode && hasPrivateTabs && biometricAvailable && !privateLockEnabled && shouldShowBanner
    }

    private companion object {
        private const val DOWNLOAD_CANCEL_DIALOG_FRAGMENT_TAG = "DOWNLOAD_CANCEL_DIALOG_FRAGMENT_TAG"
        private const val TAB_MANAGER_FEATURE_NAME = "Tab Manager"
    }
}
