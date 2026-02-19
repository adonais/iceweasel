/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.trustpanel

import androidx.navigation.NavController
import androidx.navigation.NavDirections
import androidx.navigation.NavOptions
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.mozilla.fenix.R
import org.mozilla.fenix.settings.PhoneFeature
import org.mozilla.fenix.settings.trustpanel.middleware.TrustPanelNavigationMiddleware
import org.mozilla.fenix.settings.trustpanel.store.TrustPanelAction
import org.mozilla.fenix.settings.trustpanel.store.TrustPanelState
import org.mozilla.fenix.settings.trustpanel.store.TrustPanelStore

class TrustPanelNavigationMiddlewareTest {

    private val navController: NavController = mockk(relaxed = true) {
        every { navigate(any<NavDirections>(), any<NavOptions>()) } just runs
        every { currentDestination?.id } returns R.id.trustPanelFragment
    }

    @Test
    fun `WHEN navigate to privacy security settings action is dispatched THEN navigate to privacy and security settings`() = runTest {
        val privacySecurityPrefKey = "pref_key_privacy_security_category"
        val store = createStore(privacySecurityPrefKey = privacySecurityPrefKey, scope = this)
        store.dispatch(TrustPanelAction.Navigate.PrivacySecuritySettings)
        testScheduler.advanceUntilIdle()

        verify {
            navController.navigate(
                TrustPanelFragmentDirections.actionGlobalTrackingProtectionFragment(
                    preferenceToScrollTo = privacySecurityPrefKey,
                ),
                null,
            )
        }
    }

    @Test
    fun `WHEN navigate to manage phone feature is dispatched THEN navigate to manage phone feature`() = runTest {
        val store = createStore(scope = this)
        store.dispatch(TrustPanelAction.Navigate.ManagePhoneFeature(PhoneFeature.CAMERA))
        testScheduler.advanceUntilIdle()

        verify {
            navController.navigate(
                TrustPanelFragmentDirections.actionGlobalSitePermissionsManagePhoneFeature(PhoneFeature.CAMERA),
                null,
            )
        }
    }

    private fun createStore(
        trustPanelState: TrustPanelState = TrustPanelState(),
        privacySecurityPrefKey: String = "",
        scope: CoroutineScope,
    ) = TrustPanelStore(
        initialState = trustPanelState,
        middleware = listOf(
            TrustPanelNavigationMiddleware(
                navController = navController,
                privacySecurityPrefKey = privacySecurityPrefKey,
                scope = scope,
            ),
        ),
    )
}
