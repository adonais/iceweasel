/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.toolbar

import android.content.Intent
import android.os.Build
import androidx.annotation.VisibleForTesting
import androidx.appcompat.content.res.AppCompatResources
import androidx.core.graphics.drawable.toDrawable
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle.State.RESUMED
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import mozilla.components.browser.state.selector.findCustomTab
import mozilla.components.browser.state.state.CustomTabSessionState
import mozilla.components.browser.state.state.SecurityInfo
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.browser.toolbar.concept.Action
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButton
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButtonRes
import mozilla.components.compose.browser.toolbar.concept.PageOrigin
import mozilla.components.compose.browser.toolbar.concept.PageOrigin.Companion.ContextualMenuOption
import mozilla.components.compose.browser.toolbar.concept.PageOrigin.Companion.PageOriginContextualMenuInteractions.CopyToClipboardClicked
import mozilla.components.compose.browser.toolbar.store.BrowserDisplayToolbarAction
import mozilla.components.compose.browser.toolbar.store.BrowserDisplayToolbarAction.BrowserActionsEndUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserDisplayToolbarAction.BrowserActionsStartUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserDisplayToolbarAction.PageActionsStartUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserDisplayToolbarAction.UpdateProgressBarConfig
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.Init
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarState
import mozilla.components.compose.browser.toolbar.store.EnvironmentCleared
import mozilla.components.compose.browser.toolbar.store.EnvironmentRehydrated
import mozilla.components.compose.browser.toolbar.store.ProgressBarConfig
import mozilla.components.concept.engine.cookiehandling.CookieBannersStorage
import mozilla.components.concept.engine.permission.SitePermissions
import mozilla.components.concept.engine.permission.SitePermissionsStorage
import mozilla.components.concept.engine.prompt.ShareData
import mozilla.components.feature.session.TrackingProtectionUseCases
import mozilla.components.feature.tabs.CustomTabsUseCases
import mozilla.components.lib.publicsuffixlist.PublicSuffixList
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext
import mozilla.components.lib.state.State
import mozilla.components.lib.state.Store
import mozilla.components.lib.state.ext.flow
import mozilla.components.support.ktx.kotlin.applyRegistrableDomainSpan
import mozilla.components.support.ktx.kotlin.getOrigin
import mozilla.components.support.ktx.kotlin.isContentUrl
import mozilla.components.support.ktx.kotlin.isIpv4OrIpv6
import mozilla.components.support.ktx.kotlin.trimmed
import mozilla.components.support.ktx.kotlinx.coroutines.flow.ifAnyChanged
import mozilla.components.support.utils.ClipboardHandler
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.GleanMetrics.Toolbar
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.BrowserFragmentDirections
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.URLCopiedToClipboard
import org.mozilla.fenix.components.menu.MenuAccessPoint
import org.mozilla.fenix.components.toolbar.CustomTabBrowserToolbarMiddleware.Companion.DisplayActions.MenuClicked
import org.mozilla.fenix.components.toolbar.CustomTabBrowserToolbarMiddleware.Companion.DisplayActions.ShareClicked
import org.mozilla.fenix.components.toolbar.CustomTabBrowserToolbarMiddleware.Companion.EndPageActions.CustomButtonClicked
import org.mozilla.fenix.components.toolbar.CustomTabBrowserToolbarMiddleware.Companion.StartBrowserActions.CloseClicked
import org.mozilla.fenix.components.toolbar.CustomTabBrowserToolbarMiddleware.Companion.StartPageActions.SiteInfoClicked
import org.mozilla.fenix.customtabs.ExternalAppBrowserFragmentDirections
import org.mozilla.fenix.ext.nav
import org.mozilla.fenix.settings.quicksettings.protections.cookiebanners.getCookieBannerUIMode
import org.mozilla.fenix.telemetry.ACTION_CLOSE_CLICKED
import org.mozilla.fenix.telemetry.ACTION_MENU_CLICKED
import org.mozilla.fenix.telemetry.ACTION_SECURITY_INDICATOR_CLICKED
import org.mozilla.fenix.telemetry.ACTION_SHARE_CLICKED
import org.mozilla.fenix.telemetry.ACTION_SITE_CUSTOM_CLICKED
import org.mozilla.fenix.telemetry.SOURCE_CUSTOM_BAR
import org.mozilla.fenix.utils.Settings
import mozilla.components.browser.toolbar.R as toolbarR
import mozilla.components.feature.customtabs.R as customtabsR
import mozilla.components.lib.state.Action as MVIAction
import mozilla.components.ui.icons.R as iconsR

private const val CUSTOM_BUTTON_CLICK_RETURN_CODE = 0

/**
 * [Middleware] responsible for configuring and handling interactions with the composable toolbar
 * when shown in a custom tab.
 *
 * This is also a [ViewModel] allowing to be easily persisted between activity restarts.
 *
 * @param customTabId [String] of the custom tab in which the toolbar is shown.
 * @param browserStore [BrowserStore] to sync from.
 * @param appStore [AppStore] allowing to integrate with other features of the applications.
 * @param permissionsStorage [SitePermissionsStorage] to sync from.
 * @param cookieBannersStorage [CookieBannersStorage] to sync from.
 * @param useCases [CustomTabsUseCases] used for cleanup when closing the custom tab.
 * @param trackingProtectionUseCases [TrackingProtectionUseCases] allowing to query
 * tracking protection data of the current tab.
 * @param publicSuffixList [PublicSuffixList] used to obtain the base domain of the current site.
 * @param clipboard [ClipboardHandler] to use for reading from device's clipboard.
 * @param settings [Settings] for accessing user preferences.
 */
@Suppress("LongParameterList")
class CustomTabBrowserToolbarMiddleware(
    private val customTabId: String,
    private val browserStore: BrowserStore,
    private val appStore: AppStore,
    private val permissionsStorage: SitePermissionsStorage,
    private val cookieBannersStorage: CookieBannersStorage,
    private val useCases: CustomTabsUseCases,
    private val trackingProtectionUseCases: TrackingProtectionUseCases,
    private val publicSuffixList: PublicSuffixList,
    private val clipboard: ClipboardHandler,
    private val settings: Settings,
) : Middleware<BrowserToolbarState, BrowserToolbarAction>, ViewModel() {
    @VisibleForTesting
    internal var environment: CustomTabToolbarEnvironment? = null
    private val customTab
        get() = browserStore.state.findCustomTab(customTabId)
    private var wasTitleShown = false

    @Suppress("LongMethod")
    override fun invoke(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        next: (BrowserToolbarAction) -> Unit,
        action: BrowserToolbarAction,
    ) {
        when (action) {
            is Init -> {
                next(action)

                val customTab = customTab
                updateStartPageActions(context, customTab)
                updateEndBrowserActions(context, customTab)
            }

            is EnvironmentRehydrated -> {
                next(action)

                environment = action.environment as? CustomTabToolbarEnvironment

                updateStartBrowserActions(context, customTab)
                updateCurrentPageOrigin(context, customTab)
                updateEndPageActions(context, customTab)

                observePageLoadUpdates(context)
                observePageOriginUpdates(context)
                observePageSecurityUpdates(context)
                observePageTrackingProtectionUpdates(context)
            }

            is EnvironmentCleared -> {
                next(action)

                environment = null
            }

            is CloseClicked -> {
                Toolbar.buttonTapped.record(
                    Toolbar.ButtonTappedExtra(source = SOURCE_CUSTOM_BAR, item = ACTION_CLOSE_CLICKED),
                )

                useCases.remove(customTabId)
                environment?.closeTabDelegate()
            }

            is SiteInfoClicked -> {
                Toolbar.buttonTapped.record(
                    Toolbar.ButtonTappedExtra(source = SOURCE_CUSTOM_BAR, item = ACTION_SECURITY_INDICATOR_CLICKED),
                )

                val environment = environment ?: return
                val customTab = requireNotNull(customTab)
                environment.viewLifecycleOwner.lifecycleScope.launch(Dispatchers.IO) {
                    val sitePermissions: SitePermissions? = customTab.content.url.getOrigin()?.let { origin ->
                        permissionsStorage.findSitePermissionsBy(origin, private = customTab.content.private)
                    }

                    environment.viewLifecycleOwner.lifecycleScope.launch(Dispatchers.Main) {
                        trackingProtectionUseCases.containsException(customTabId) { isExcepted ->
                            environment.viewLifecycleOwner.lifecycleScope.launch {
                                val cookieBannerUIMode = cookieBannersStorage.getCookieBannerUIMode(
                                    tab = customTab,
                                    isFeatureEnabledInPrivateMode = settings.shouldUseCookieBannerPrivateMode,
                                    publicSuffixList = publicSuffixList,
                                )

                                val directions = if (settings.enableUnifiedTrustPanel) {
                                    ExternalAppBrowserFragmentDirections.actionGlobalTrustPanelFragment(
                                        sessionId = customTab.id,
                                        url = customTab.content.url,
                                        title = customTab.content.title,
                                        isLocalPdf = customTab.content.url.isContentUrl(),
                                        isSecured = customTab.content.securityInfo.isSecure,
                                        sitePermissions = sitePermissions,
                                        certificateName = customTab.content.securityInfo.issuer,
                                        permissionHighlights = customTab.content.permissionHighlights,
                                        isTrackingProtectionEnabled =
                                            customTab.trackingProtection.enabled && !isExcepted,
                                        cookieBannerUIMode = cookieBannerUIMode,
                                    )
                                } else {
                                    ExternalAppBrowserFragmentDirections
                                        .actionGlobalQuickSettingsSheetDialogFragment(
                                            sessionId = customTabId,
                                            url = customTab.content.url,
                                            title = customTab.content.title,
                                            isLocalPdf = customTab.content.url.isContentUrl(),
                                            isSecured = customTab.content.securityInfo.isSecure,
                                            sitePermissions = sitePermissions,
                                            gravity = settings.toolbarPosition.androidGravity,
                                            certificateName = customTab.content.securityInfo.issuer,
                                            permissionHighlights = customTab.content.permissionHighlights,
                                            isTrackingProtectionEnabled =
                                                customTab.trackingProtection.enabled && !isExcepted,
                                            cookieBannerUIMode = cookieBannerUIMode,
                                        )
                                }
                                environment.navController.nav(
                                    R.id.externalAppBrowserFragment,
                                    directions,
                                )
                            }
                        }
                    }
                }
            }

            is CustomButtonClicked -> {
                Toolbar.buttonTapped.record(
                    Toolbar.ButtonTappedExtra(source = SOURCE_CUSTOM_BAR, item = ACTION_SITE_CUSTOM_CLICKED),
                )
                val environment = environment ?: return
                val customTab = customTab
                customTab?.config?.actionButtonConfig?.pendingIntent?.send(
                    environment.context,
                    CUSTOM_BUTTON_CLICK_RETURN_CODE,
                    Intent(null, customTab.content.url.toUri()),
                )
            }

            is ShareClicked -> {
                Toolbar.buttonTapped.record(
                    Toolbar.ButtonTappedExtra(source = SOURCE_CUSTOM_BAR, item = ACTION_SHARE_CLICKED),
                )
                val customTab = customTab
                environment?.navController?.navigate(
                    NavGraphDirections.actionGlobalShareFragment(
                        sessionId = customTabId,
                        data = arrayOf(
                            ShareData(
                                url = customTab?.content?.url,
                                title = customTab?.content?.title,
                            ),
                        ),
                        showPage = true,
                    ),
                )
            }

            is MenuClicked -> {
                Toolbar.buttonTapped.record(
                    Toolbar.ButtonTappedExtra(source = SOURCE_CUSTOM_BAR, item = ACTION_MENU_CLICKED),
                )
                runWithinEnvironment {
                    navController.nav(
                        R.id.externalAppBrowserFragment,
                        BrowserFragmentDirections.actionGlobalMenuDialogFragment(
                            accesspoint = MenuAccessPoint.External,
                            customTabSessionId = customTabId,
                        ),
                    )
                }
            }

            is CopyToClipboardClicked -> {
                Events.copyUrlTapped.record(NoExtras())

                clipboard.text = customTab?.content?.url?.also {
                    // Android 13+ shows by default a popup for copied text.
                    // Avoid overlapping popups informing the user when the URL is copied to the clipboard.
                    // and only show our snackbar when Android will not show an indication by default.
                    // See https://developer.android.com/develop/ui/views/touch-and-input/copy-paste#duplicate-notifications).
                    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {
                        appStore.dispatch(URLCopiedToClipboard)
                    }
                }
            }

            else -> next(action)
        }
    }

    private fun observePageOriginUpdates(context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>) {
        browserStore.observeWhileActive {
            mapNotNull { state -> state.findCustomTab(customTabId) }
                .ifAnyChanged { tab -> arrayOf(tab.content.title, tab.content.url) }
                .collect {
                    updateCurrentPageOrigin(context, it)
                }
        }
    }

    private fun observePageLoadUpdates(context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>) {
        browserStore.observeWhileActive {
            mapNotNull { state -> state.findCustomTab(customTabId) }
                .distinctUntilChangedBy { it.content.progress }
                .collect {
                    context.dispatch(
                        UpdateProgressBarConfig(
                            buildProgressBar(it.content.progress),
                        ),
                    )
                }
        }
    }

    private fun observePageSecurityUpdates(context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>) {
        browserStore.observeWhileActive {
            mapNotNull { state -> state.findCustomTab(customTabId) }
                .distinctUntilChangedBy { tab -> tab.content.securityInfo }
                .collect {
                    updateStartPageActions(context, it)
                }
        }
    }

    private fun observePageTrackingProtectionUpdates(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
    ) {
        browserStore.observeWhileActive {
            mapNotNull { state -> state.findCustomTab(customTabId) }
                .distinctUntilChangedBy { tab -> tab.trackingProtection }
                .collect { updateStartPageActions(context, it) }
        }
    }

    private fun updateStartBrowserActions(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        customTab: CustomTabSessionState?,
    ) = context.dispatch(
        BrowserActionsStartUpdated(
            buildStartBrowserActions(customTab),
        ),
    )

    private fun updateStartPageActions(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        customTab: CustomTabSessionState?,
    ) = context.dispatch(
        PageActionsStartUpdated(
            buildStartPageActions(customTab),
        ),
    )

    private fun updateCurrentPageOrigin(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        customTab: CustomTabSessionState?,
    ) {
        environment?.viewLifecycleOwner?.lifecycleScope?.launch {
            context.dispatch(
                BrowserDisplayToolbarAction.PageOriginUpdated(
                    PageOrigin(
                        hint = R.string.search_hint,
                        title = getTitleToShown(customTab),
                        url = getHostFromUrl()?.trimmed(),
                        contextualMenuOptions = listOf(ContextualMenuOption.CopyURLToClipboard),
                        onClick = null,
                    ),
                ),
            )
        }
    }

    private fun updateEndPageActions(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        customTab: CustomTabSessionState?,
    ) = context.dispatch(
        BrowserDisplayToolbarAction.PageActionsEndUpdated(
            buildEndPageActions(customTab),
        ),
    )

    private fun updateEndBrowserActions(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        customTab: CustomTabSessionState?,
    ) = context.dispatch(
        BrowserActionsEndUpdated(
            buildEndBrowserActions(customTab),
        ),
    )

    private fun buildStartBrowserActions(customTab: CustomTabSessionState?): List<Action> {
        val environment = environment ?: return emptyList()
        val customTabConfig = customTab?.config
        val customIconBitmap = customTabConfig?.closeButtonIcon

        return when (customTabConfig?.showCloseButton) {
            true -> listOf(
                ActionButton(
                    drawable = when (customIconBitmap) {
                        null -> AppCompatResources.getDrawable(
                            environment.context, iconsR.drawable.mozac_ic_cross_24,
                        )

                        else -> customIconBitmap.toDrawable(environment.context.resources)
                    },
                    contentDescription = environment.context.getString(
                        customtabsR.string.mozac_feature_customtabs_exit_button,
                    ),
                    onClick = CloseClicked,
                ),
            )

            else -> emptyList()
        }
    }

    private fun buildStartPageActions(customTab: CustomTabSessionState?) = buildList {
        if (customTab?.content?.url?.isContentUrl() == true) {
            add(
                ActionButtonRes(
                    drawableResId = iconsR.drawable.mozac_ic_page_portrait_24,
                    contentDescription = toolbarR.string.mozac_browser_toolbar_content_description_site_info,
                    onClick = SiteInfoClicked,
                ),
            )
        } else if (customTab?.content?.securityInfo == null ||
            customTab.content.securityInfo == SecurityInfo.Unknown
        ) {
            add(
                ActionButtonRes(
                    drawableResId = iconsR.drawable.mozac_ic_globe_24,
                    contentDescription = toolbarR.string.mozac_browser_toolbar_content_description_site_info,
                    onClick = object : BrowserToolbarEvent {},
                ),
            )
        } else if (
                customTab.content.securityInfo.isSecure &&
                customTab.trackingProtection.enabled &&
                !customTab.trackingProtection.ignoredOnTrackingProtection
            ) {
            add(
                ActionButtonRes(
                    drawableResId = iconsR.drawable.mozac_ic_shield_checkmark_24,
                    contentDescription = toolbarR.string.mozac_browser_toolbar_content_description_site_info,
                    onClick = SiteInfoClicked,
                ),
            )
        } else {
            add(
                ActionButtonRes(
                    drawableResId = iconsR.drawable.mozac_ic_shield_slash_24,
                    contentDescription = toolbarR.string.mozac_browser_toolbar_content_description_site_info,
                    onClick = SiteInfoClicked,
                ),
            )
        }
    }

    private fun buildEndPageActions(customTab: CustomTabSessionState?): List<ActionButton> {
        val environment = environment ?: return emptyList()
        val customButtonConfig = customTab?.config?.actionButtonConfig
        val customButtonIcon = customButtonConfig?.icon

        return when (customButtonIcon) {
            null -> emptyList()
            else -> listOf(
                ActionButton(
                    drawable = customButtonIcon.toDrawable(environment.context.resources),
                    shouldTint = customTab.content.private || customButtonConfig.tint,
                    contentDescription = customButtonConfig.description,
                    onClick = CustomButtonClicked,
                ),
            )
        }
    }

    private fun buildEndBrowserActions(customTab: CustomTabSessionState?) = buildList {
        if (customTab?.config?.showShareMenuItem == true) {
            add(
                ActionButtonRes(
                    drawableResId = iconsR.drawable.mozac_ic_share_android_24,
                    contentDescription = customtabsR.string.mozac_feature_customtabs_share_link,
                    onClick = ShareClicked,
                ),
            )
        }

        add(
            ActionButtonRes(
                drawableResId = iconsR.drawable.mozac_ic_ellipsis_vertical_24,
                contentDescription = R.string.content_description_menu,
                onClick = MenuClicked,
            ),
        )
    }

    private fun buildProgressBar(progress: Int = 0) = ProgressBarConfig(progress)

    /**
     * Get the host of the current URL with the registrable domain span applied.
     * If this cannot be done, the original URL is returned.
     */
    private suspend fun getHostFromUrl(): CharSequence? {
        val url = customTab?.content?.url
        val host = url?.toUri()?.host
        return when {
            host.isNullOrEmpty() -> url
            host.isIpv4OrIpv6() -> host
            else -> {
                val hostStart = url.indexOf(host)
                try {
                    url.applyRegistrableDomainSpan(publicSuffixList)
                        .subSequence(
                            startIndex = hostStart,
                            endIndex = hostStart + host.length,
                        )
                } catch (_: IndexOutOfBoundsException) {
                    host
                }
            }
        }
    }

    private fun getTitleToShown(customTab: CustomTabSessionState?): String? {
        val title = customTab?.content?.title
        // If we showed a title once in a custom tab then we are going to continue displaying
        // a title (to avoid the layout bouncing around).
        // However if no title is available then we just use the URL.
        return when {
            wasTitleShown && title.isNullOrBlank() -> customTab?.content?.url
            !title.isNullOrBlank() -> {
                wasTitleShown = true
                title
            }
            else -> null // title was not shown previously and is currently blank
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
        block: CustomTabToolbarEnvironment.() -> Unit,
    ) = environment?.let { block(it) }

    /**
     * Static functionalities of the [BrowserToolbarMiddleware].
     */
    companion object {
        @VisibleForTesting
        internal sealed class StartBrowserActions : BrowserToolbarEvent {
            data object CloseClicked : StartBrowserActions()
        }

        @VisibleForTesting
        internal sealed class StartPageActions : BrowserToolbarEvent {
            data object SiteInfoClicked : StartPageActions()
        }

        @VisibleForTesting
        internal sealed class EndPageActions : BrowserToolbarEvent {
            data object CustomButtonClicked : EndPageActions()
        }

        @VisibleForTesting
        internal sealed class DisplayActions : BrowserToolbarEvent {
            data object ShareClicked : DisplayActions()
            data object MenuClicked : DisplayActions()
        }
    }
}
