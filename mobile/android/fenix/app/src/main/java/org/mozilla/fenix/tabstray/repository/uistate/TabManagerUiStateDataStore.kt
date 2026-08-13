/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.repository.uistate

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore

/**
 * [DataStore] for managing UI state for the Tab Manager.
 */
internal val Context.uiStateDataStore: DataStore<Preferences> by preferencesDataStore(name = "tab_manager_ui_state")

/**
 * Datastore key for reading/writing whether the user has dismissed the tab group onboarding.
 */
internal val hasUserDismissedTabGroupOnboardingKey = booleanPreferencesKey("hasUserDismissedTabGroupOnboardingKey")

/**
 * Datastore key for reading/writing the tab group onboarding impression count.
 */
internal val tabGroupOnboardingImpressionCountKey = intPreferencesKey("tabGroupOnboardingImpressionCountKey")

/**
 * Datastore key for reading/writing whether the user has ever had at least one tab group.
 */
internal val hasUserEverHadOneTabGroupKey = booleanPreferencesKey("hasUserEverHadOneTabGroupKey")

/**
 * Datastore key for reading/writing whether the user has viewed the Tab Groups page.
 */
internal val hasViewedTabGroupsPageKey = booleanPreferencesKey("hasViewedTabGroupsPageKey")
