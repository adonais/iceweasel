/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.navigation.NavController
import mozilla.components.browser.state.state.CustomTabSessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.thumbnails.BrowserThumbnails
import mozilla.components.compose.browser.toolbar.concept.PageOrigin
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarState
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.DisplayState
import mozilla.components.compose.browser.toolbar.store.EnvironmentCleared
import mozilla.components.compose.browser.toolbar.store.EnvironmentRehydrated
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.browsingmode.BrowsingModeManager
import org.mozilla.fenix.browser.readermode.ReaderModeController
import org.mozilla.fenix.browser.store.BrowserScreenStore
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.Components
import org.mozilla.fenix.components.StoreProvider
import org.mozilla.fenix.components.toolbar.BrowserToolbarEnvironment
import org.mozilla.fenix.components.toolbar.BrowserToolbarMiddleware
import org.mozilla.fenix.components.toolbar.BrowserToolbarTelemetryMiddleware
import org.mozilla.fenix.components.toolbar.CustomTabBrowserToolbarMiddleware
import org.mozilla.fenix.components.toolbar.CustomTabToolbarEnvironment
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.search.BrowserToolbarSearchMiddleware
import org.mozilla.fenix.search.BrowserToolbarSearchStatusSyncMiddleware
import org.mozilla.fenix.utils.Settings

/**
 * Delegate for building the [BrowserToolbarStore] used in the browser screen.
 */
object BrowserToolbarStoreBuilder {

    /**
     * Build the [BrowserToolbarStore] used in the browser screen.
     *
     * @param activity [AppCompatActivity] hosting the toolbar.
     * @param fragment [Fragment] as a [LifecycleOwner] to used to organize lifecycle dependent operations.
     * @param navController [NavController] to use for navigating to other in-app destinations.
     * @param appStore [AppStore] to sync from.
     * @param browserScreenStore [BrowserScreenStore] used for integration with other browser screen functionalities.
     * @param browserStore [BrowserStore] used for observing the browsing details.
     * @param components [Components] allowing interactions with other application features.
     * @param browsingModeManager [BrowsingModeManager] for querying the current browsing mode.
     * @param browserAnimator Helper for animating the browser content when navigating to other screens.
     * @param thumbnailsFeature [BrowserThumbnails] for requesting screenshots of the current tab.
     * @param readerModeController [ReaderModeController] for managing the reader mode.
     * @param settings [Settings] object to get the toolbar position and other settings.
     * @param customTabSession [CustomTabSessionState] if the toolbar is shown in a custom tab.
     */
    @Suppress("LongParameterList", "LongMethod")
    fun build(
        activity: AppCompatActivity,
        fragment: Fragment,
        navController: NavController,
        appStore: AppStore,
        browserScreenStore: BrowserScreenStore,
        browserStore: BrowserStore,
        components: Components,
        browsingModeManager: BrowsingModeManager,
        browserAnimator: BrowserAnimator,
        thumbnailsFeature: () -> BrowserThumbnails?,
        readerModeController: ReaderModeController,
        settings: Settings,
        customTabSession: CustomTabSessionState? = null,
    ) = StoreProvider.get(fragment) {
        BrowserToolbarStore(
            initialState = BrowserToolbarState(
                displayState = DisplayState(
                    pageOrigin = PageOrigin(
                        hint = R.string.search_hint,
                        title = null,
                        url = null,
                        onClick = object : BrowserToolbarEvent {},
                    ),
                ),
            ),
            middleware = when (customTabSession) {
                null -> listOf(
                    BrowserToolbarMiddleware(
                        appStore = appStore,
                        browserScreenStore = browserScreenStore,
                        browserStore = browserStore,
                        permissionsStorage = components.core.geckoSitePermissionsStorage,
                        cookieBannersStorage = components.core.cookieBannersStorage,
                        trackingProtectionUseCases = components.useCases.trackingProtectionUseCases,
                        useCases = components.useCases,
                        nimbusComponents = components.nimbus,
                        clipboard = activity.components.clipboardHandler,
                        publicSuffixList = components.publicSuffixList,
                        settings = settings,
                        bookmarksStorage = activity.components.core.bookmarksStorage,
                    ),
                    BrowserToolbarSearchStatusSyncMiddleware(appStore),
                    BrowserToolbarSearchMiddleware(
                        appStore = appStore,
                        browserStore = browserStore,
                        components = components,
                        settings = settings,
                    ),
                    BrowserToolbarTelemetryMiddleware(),
                )

                else -> listOf(
                    CustomTabBrowserToolbarMiddleware(
                        requireNotNull(customTabSession).id,
                        browserStore = browserStore,
                        appStore = appStore,
                        permissionsStorage = components.core.geckoSitePermissionsStorage,
                        cookieBannersStorage = components.core.cookieBannersStorage,
                        useCases = components.useCases.customTabsUseCases,
                        trackingProtectionUseCases = components.useCases.trackingProtectionUseCases,
                        publicSuffixList = components.publicSuffixList,
                        clipboard = activity.components.clipboardHandler,
                        settings = settings,
                    ),
                )
            },
        )
    }.also {
        it.dispatch(
            EnvironmentRehydrated(
                when (customTabSession) {
                    null -> BrowserToolbarEnvironment(
                        context = activity,
                        fragment = fragment,
                        navController = navController,
                        browsingModeManager = browsingModeManager,
                        browserAnimator = browserAnimator,
                        thumbnailsFeature = thumbnailsFeature,
                        readerModeController = readerModeController,
                    )
                    else -> CustomTabToolbarEnvironment(
                        context = activity,
                        viewLifecycleOwner = fragment.viewLifecycleOwner,
                        navController = navController,
                        closeTabDelegate = { activity.finishAndRemoveTask() },
                    )
                },
            ),
        )

        fragment.viewLifecycleOwner.lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onDestroy(owner: LifecycleOwner) {
                    it.dispatch(EnvironmentCleared)
                }
            },
        )
    }
}
