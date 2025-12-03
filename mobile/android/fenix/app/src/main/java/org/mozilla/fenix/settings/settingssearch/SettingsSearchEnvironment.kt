/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import android.content.Context
import androidx.fragment.app.Fragment
import androidx.navigation.NavController

/**
 * Environment for the [SettingsSearchStore].
 *
 * @property navController [NavController] used for navigation.
 * @property fragment [Fragment] used for lifecycle owner and context for UI operations.
 * @property context [Context] used for various system interactions
 * @property recentSettingsSearchesRepository [RecentSettingsSearchesRepository] used for storing recent searches.
 */
data class SettingsSearchEnvironment(
    val navController: NavController,
    val fragment: Fragment,
    val context: Context,
    val recentSettingsSearchesRepository: RecentSettingsSearchesRepository,
)
