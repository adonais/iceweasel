/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabdata.coordinator.repository

import kotlinx.coroutines.flow.Flow
import mozilla.components.feature.tabdata.coordinator.data.Tab

/** Abstraction for observing browser tab data. */
interface TabRepository {

    /** A [Flow] of transformed tab [Data]. */
    val tabFlow: Flow<Data>

    /**
     * Value class representing the data observed from the browser tab data source.
     *
     * @property selectedTabId The ID of the currently selected tab.
     * @property tabs The list of open tabs in the browser. Implementations are responsible for mapping their backing
     *   tab representation onto [Tab]; group membership is resolved by the coordinator, so [Tab.tabGroupId] is expected
     *   to be null here.
     */
    data class Data(
        val selectedTabId: String? = null,
        val tabs: List<Tab> = emptyList(),
    )
}
