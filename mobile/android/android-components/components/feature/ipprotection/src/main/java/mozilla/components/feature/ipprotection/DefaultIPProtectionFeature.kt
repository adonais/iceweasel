/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.components.browser.state.selector.findTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.ipprotection.IPProtectionDelegate
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler
import mozilla.components.concept.sync.AccountObserver
import mozilla.components.concept.sync.AuthType
import mozilla.components.concept.sync.OAuthAccount
import mozilla.components.feature.tabs.TabsUseCases
import mozilla.components.lib.state.ext.flow
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.support.base.feature.LifecycleAwareFeature
import mozilla.components.support.base.log.logger.Logger

private val logger = Logger("DefaultIPProtectionFeature")
private const val TOKEN_SCOPE = "https://identity.mozilla.com/apps/vpn"

/**
  * AC feature that brings IP protection proxy functionality to Android.
 *
 * @param engine [Engine] used to register the IP protection delegate and obtain the handler.
 * @param accountManager [FxaAccountManager] used to supply FxA tokens to the proxy Guardian.
 * @param store [IPProtectionStore] holds the feature state.
 * @param browserStore [BrowserStore] to observe enrollment tab URL changes.
 * @param tabsUseCases [TabsUseCases] to open/remove the enrollment tab.
 */
class DefaultIPProtectionFeature(
    private val engine: Engine,
    private val accountManager: FxaAccountManager,
    private val store: IPProtectionStore,
    private val browserStore: BrowserStore,
    private val tabsUseCases: TabsUseCases,
) : LifecycleAwareFeature, IPProtectionFeature {
    private val scope = CoroutineScope(Dispatchers.Main)
    private var handler: IPProtectionHandler? = null
    private var enrollmentTabId: String? = null
    private var enrollmentObservationJob: Job? = null

    private val accountObserver = object : AccountObserver {
        override fun onAuthenticated(account: OAuthAccount, authType: AuthType) {
            scope.launch { setTokenProvider(account) }
        }

        override fun onLoggedOut() {
            scope.launch { handler?.setTokenProvider(null) }
        }

        override fun onAuthenticationProblems() {
            scope.launch { handler?.setTokenProvider(null) }
        }
    }

    override fun start() {
        handler = engine.registerIPProtectionDelegate(object : IPProtectionDelegate {
            override fun onStateChanged(info: IPProtectionHandler.StateInfo) {
                val state = info.toState()
                logger.debug(
                    "onStateChanged: proxyState=${info.proxyState}" +
                    " serviceState=${info.serviceState}" +
                    " remaining=${info.remaining} max=${info.max}" +
                    " → status=${state.status} isEnrollmentNeeded=${state.isEnrollmentNeeded}",
                )
                store.dispatch(IPProtectionAction.UpdateState(state))
            }
        })

        accountManager.register(accountObserver)

        val account = accountManager.authenticatedAccount()
        if (account != null) {
            setTokenProvider(account)
        } else {
            handler?.setTokenProvider(null)
        }
    }

    override fun stop() {
        accountManager.unregister(accountObserver)
        engine.unregisterIPProtectionDelegate()
        handler?.setTokenProvider(null)
        handler = null
        cancelEnrollment()
    }

    override fun activate() { handler?.activate() }

    override fun deactivate() { handler?.deactivate() }

    override fun beginEnrollment() {
        cancelEnrollment()
        logger.debug("beginEnrollment: opening background tab → $GUARDIAN_ENROLLMENT_URL")
        val tabId = tabsUseCases.addTab(url = GUARDIAN_ENROLLMENT_URL, selectTab = false)
        enrollmentTabId = tabId
        observeEnrollmentTab(tabId)
    }

    private fun cancelEnrollment() {
        val tabId = enrollmentTabId ?: return
        enrollmentObservationJob?.cancel()
        enrollmentObservationJob = null
        tabsUseCases.removeTab(tabId)
        enrollmentTabId = null
    }

    private fun observeEnrollmentTab(tabId: String) {
        enrollmentObservationJob = scope.launch {
            browserStore.flow()
                .mapNotNull { state -> state.findTab(tabId)?.content?.url }
                .distinctUntilChanged()
                .collect { url ->
                    logger.debug("enrollment tab navigated → $url")
                    when {
                        url.startsWith(GUARDIAN_SUCCESS_URL) -> onEnrollmentSuccess(tabId)
                        url.startsWith(GUARDIAN_ERROR_URL) -> onEnrollmentError(tabId)
                    }
                }
        }
    }

    private fun onEnrollmentSuccess(tabId: String) {
        logger.debug("onEnrollmentSuccess: closing tab and triggering entitlement check")
        enrollmentObservationJob?.cancel()
        enrollmentObservationJob = null
        enrollmentTabId = null
        tabsUseCases.removeTab(tabId)
        retriggerEnrollment()

        scope.launch {
            val currentStatus = store.state.status
            if (currentStatus == IPProtectionStatus.Ready) {
                logger.debug("onEnrollmentSuccess: already Ready — activating")
                activate()
                return@launch
            }
            store.flow()
                .map { it.status }
                .filter { it == IPProtectionStatus.Ready }
                .first()
            logger.debug("onEnrollmentSuccess: proxy reached Ready — activating")
            activate()
        }
    }

    private fun onEnrollmentError(tabId: String) {
        logger.warn("onEnrollmentError: Guardian enrollment failed")
        enrollmentObservationJob?.cancel()
        enrollmentObservationJob = null
        enrollmentTabId = null
        tabsUseCases.removeTab(tabId)
    }

    override fun retriggerEnrollment() {
        val account = accountManager.authenticatedAccount() ?: return
        logger.debug("retriggerEnrollment: re-firing token provider")
        setTokenProvider(account)
    }

    private fun setTokenProvider(account: OAuthAccount) {
        handler?.setTokenProvider(
            provider = object : IPProtectionHandler.TokenProvider {
                override fun getToken(onComplete: (String?) -> Unit) {
                    scope.launch {
                        val tokenInfo = withContext(Dispatchers.IO) {
                            runCatching { account.getAccessToken(TOKEN_SCOPE) }.getOrNull()
                        }
                        onComplete(tokenInfo?.token)
                    }
                }
            },
            onInitialState = { info ->
                val state = info.toState()
                logger.debug(
                    "setTokenProvider result: proxyState=${info.proxyState} serviceState=${info.serviceState}" +
                    " remaining=${info.remaining} max=${info.max} → status=${state.status}" +
                    " isEnrollmentNeeded=${state.isEnrollmentNeeded}",
                )
                store.dispatch(IPProtectionAction.UpdateState(state))
            },
        )
    }

    private fun IPProtectionHandler.StateInfo.toState() = IPProtectionState(
        status = proxyStateToStatus(proxyState),
        dataRemainingBytes = remaining,
        dataMaxBytes = max,
        resetDate = resetTime,
        isEnrollmentNeeded = proxyState == IPProtectionHandler.StateInfo.PROXY_STATE_NOT_READY &&
            serviceState == IPProtectionHandler.StateInfo.SERVICE_STATE_UNAUTHENTICATED &&
            accountManager.authenticatedAccount() != null,
    )

    private fun proxyStateToStatus(proxyState: Int): IPProtectionStatus = when (proxyState) {
        IPProtectionHandler.StateInfo.PROXY_STATE_ACTIVE -> IPProtectionStatus.Active
        IPProtectionHandler.StateInfo.PROXY_STATE_ACTIVATING -> IPProtectionStatus.Activating
        IPProtectionHandler.StateInfo.PROXY_STATE_READY -> IPProtectionStatus.Ready
        IPProtectionHandler.StateInfo.PROXY_STATE_PAUSED -> IPProtectionStatus.Paused
        IPProtectionHandler.StateInfo.PROXY_STATE_ERROR -> IPProtectionStatus.Error
        else -> IPProtectionStatus.NotAvailable
    }

    companion object {
        const val GUARDIAN_ENROLLMENT_URL = "https://vpn.mozilla.org/api/v1/fpn/auth?experiment=alpha"
        const val GUARDIAN_SUCCESS_URL = "https://vpn.mozilla.org/oauth/success"
        const val GUARDIAN_ERROR_URL = "https://vpn.mozilla.org/api/v1/fpn/error"
    }
}
