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
import mozilla.components.concept.engine.ipprotection.IPProtectionHandler
import org.mozilla.fenix.R
import org.mozilla.fenix.e2e.SystemInsetsPaddedFragment
import org.mozilla.fenix.ext.showToolbar
import org.mozilla.fenix.theme.FirefoxTheme

/** Fragment hosting the IP Protection settings screen. */
class IPProtectionFragment : Fragment(), SystemInsetsPaddedFragment {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = ComposeView(requireContext()).apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        setContent {
            FirefoxTheme {
                IPProtectionScreen(
                    state = IPProtectionHandler.StateInfo(),
                    onVpnToggle = {
                        // will be implemented in https://bugzilla.mozilla.org/show_bug.cgi?id=2030143
                    },
                    onLearnMoreClick = {
                        // will be implemented in https://bugzilla.mozilla.org/show_bug.cgi?id=2030144
                    },
                    onGetStartedClick = {
                        // will be implemented in https://bugzilla.mozilla.org/show_bug.cgi?id=2030528
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
