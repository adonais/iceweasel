/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

import android.os.Bundle
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.components.components
import org.mozilla.fenix.compose.ComposeFragment
import org.mozilla.fenix.ext.requireComponents
import org.mozilla.fenix.home.topsites.controller.DefaultTopSiteController
import org.mozilla.fenix.home.topsites.controller.TopSiteController
import org.mozilla.fenix.home.topsites.interactor.DefaultTopSiteInteractor
import org.mozilla.fenix.home.topsites.interactor.TopSiteInteractor
import org.mozilla.fenix.home.topsites.store.ShortcutsState
import org.mozilla.fenix.home.topsites.ui.ShortcutsScreen
import org.mozilla.fenix.theme.FirefoxTheme
import java.lang.ref.WeakReference

/**
 * A [ComposeFragment] displaying the shortcuts screen.
 */
class ShortcutsFragment : ComposeFragment() {

    private lateinit var interactor: TopSiteInteractor
    private lateinit var controller: TopSiteController

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        controller = DefaultTopSiteController(
            activityRef = WeakReference(activity as HomeActivity),
            store = requireComponents.core.store,
            navControllerRef = WeakReference(findNavController()),
            settings = requireComponents.settings,
            addTabUseCase = requireComponents.useCases.tabsUseCases.addTab,
            selectTabUseCase = requireComponents.useCases.tabsUseCases.selectTab,
            fenixBrowserUseCases = requireComponents.useCases.fenixBrowserUseCases,
            topSitesUseCases = requireComponents.useCases.topSitesUseCase,
            marsUseCases = requireComponents.useCases.marsUseCases,
            viewLifecycleScope = viewLifecycleOwner.lifecycleScope,
        )

        interactor = DefaultTopSiteInteractor(
            controller = controller,
        )
    }

    @Composable
    override fun UI() {
        FirefoxTheme {
            val appStore = components.appStore
            val topSites by appStore.observeAsState(initialValue = emptyList()) { state ->
                state.topSites
            }

            ShortcutsScreen(
                state = ShortcutsState(topSites = topSites),
                interactor = interactor,
                onNavigationIconClick = {
                    this@ShortcutsFragment.findNavController().popBackStack()
                },
            )
        }
    }
}
