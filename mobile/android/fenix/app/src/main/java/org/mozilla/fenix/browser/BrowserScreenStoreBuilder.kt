/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

import android.content.Context
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import org.mozilla.fenix.browser.store.BrowserScreenAction.EnvironmentCleared
import org.mozilla.fenix.browser.store.BrowserScreenAction.EnvironmentRehydrated
import org.mozilla.fenix.browser.store.BrowserScreenMiddleware
import org.mozilla.fenix.browser.store.BrowserScreenStore
import org.mozilla.fenix.browser.store.BrowserScreenStore.Environment
import org.mozilla.fenix.components.StoreProvider
import org.mozilla.fenix.ext.components

/**
 * Delegate for building the [BrowserScreenStore].
 */
object BrowserScreenStoreBuilder {

    /**
     * Builds the [BrowserScreenStore].
     *
     * @param context [Context] needed for various Android interactions.
     * @param lifecycleOwner [Fragment] which will have it's lifecycle observed for configuring
     * lifecycle related operation.
     * @param fragmentManager [FragmentManager] used for managing child fragments.
     */
    fun build(
        context: Context,
        lifecycleOwner: Fragment,
        fragmentManager: FragmentManager,
    ) = StoreProvider.get(lifecycleOwner) {
        BrowserScreenStore(
            middleware = listOf(
                BrowserScreenMiddleware(context.components.analytics.crashReporter),
            ),
        )
    }.also {
        it.dispatch(
            EnvironmentRehydrated(
                Environment(
                    context = context,
                    viewLifecycleOwner = lifecycleOwner,
                    fragmentManager = fragmentManager,
                ),
            ),
        )
        lifecycleOwner.lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onDestroy(owner: LifecycleOwner) {
                    it.dispatch(EnvironmentCleared)
                }
            },
        )
    }
}
