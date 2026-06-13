/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.fragment.app.Fragment
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.feature.ipprotection.store.IPProtectionAction
import mozilla.components.lib.state.ext.observeAsComposableState
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.Vpn
import org.mozilla.fenix.R
import org.mozilla.fenix.components.components
import org.mozilla.fenix.e2e.SystemInsetsPaddedFragment
import org.mozilla.fenix.ext.requireComponents
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.ext.showToolbar
import org.mozilla.fenix.theme.FirefoxTheme

/** Fragment hosting the IP Protection settings screen. */
class IPProtectionFragment : Fragment(), SystemInsetsPaddedFragment {

    @OptIn(ExperimentalAndroidComponentsApi::class)
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = ComposeView(requireContext()).apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        setContent {
            FirefoxTheme {
                val state = components.ipProtection.store.observeAsComposableState { it }
                IPProtectionScreen(
                    state = state.value,
                    onVpnToggle = { enabled ->
                        if (enabled) {
                            requireContext().settings().hasAlreadyUsedVpn = true
                        }
                        requireComponents.ipProtection.store.dispatch(IPProtectionAction.Toggle)
                    },
                    onLearnMoreClick = {
                        Vpn.settingsLearnMoreTapped.record(NoExtras())
                        SupportUtils.launchSandboxCustomTab(
                            requireActivity(),
                            SupportUtils.getSumoURLForTopic(
                                requireActivity(),
                                SupportUtils.SumoTopic.VPN,
                                useMobilePage = false,
                            ),
                        )
                    },
                    onGetStartedClick = {
                        requireComponents.ipProtection.store.dispatch(IPProtectionAction.Toggle)
                    },
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        showToolbar(getString(R.string.ip_protection_title))
    }
}
