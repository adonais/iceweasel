/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabdata.coordinator.fakes

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import mozilla.components.feature.tabdata.coordinator.repository.TabRepository

/**
 * A fake, in-memory implementation of [TabRepository] for use in unit tests.
 *
 * @param initialData The [TabRepository.Data] the repository starts off emitting.
 */
class FakeTabRepository(initialData: TabRepository.Data = TabRepository.Data()) : TabRepository {

    override val tabFlow: Flow<TabRepository.Data>
        field = MutableStateFlow(initialData)

    /** Emit [data] to all observers of [tabFlow]. */
    suspend fun emit(data: TabRepository.Data) {
        tabFlow.emit(data)
    }

    /** Emit the result of applying [transform] to the most recently emitted data. */
    suspend fun update(transform: (TabRepository.Data) -> TabRepository.Data) {
        emit(data = transform(tabFlow.value))
    }
}
