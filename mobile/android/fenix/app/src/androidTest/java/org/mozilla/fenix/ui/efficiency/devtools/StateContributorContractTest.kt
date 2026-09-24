/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.devtools

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import mozilla.components.browser.state.action.SearchAction
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.helpers.TestHelper.appContext
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.helpers.HarnessPreferenceState
import org.mozilla.fenix.ui.efficiency.helpers.HarnessSearchState
import org.mozilla.fenix.ui.efficiency.helpers.StateProbe
import org.mozilla.fenix.ui.efficiency.helpers.StateResourcePolicy

@RunWith(AndroidJUnit4::class)
class StateContributorContractTest : BaseTest() {
    @Test
    fun contributorIdentityAndFieldOwnershipAreUnambiguous() {
        val descriptors = StateProbe.descriptors()
        val fields = descriptors.flatMap { it.fields }

        assertEquals(descriptors.size, descriptors.map { it.name }.toSet().size)
        assertEquals(fields.size, fields.toSet().size)
        assertTrue(descriptors.all { it.schemaVersion > 0 && it.fields.isNotEmpty() })
        assertTrue(descriptors.all { it.boundaryBaseline.keys.all(it.fields::contains) })
        assertTrue(
            descriptors
                .filter { it.policy == StateResourcePolicy.RESTORE }
                .all { it.boundaryBaseline.isNotEmpty() && it.controlDrivers.isNotEmpty() }
        )
        assertTrue(
            descriptors
                .filter { it.policy == StateResourcePolicy.OBSERVE }
                .all { it.boundaryBaseline.isEmpty() && it.controlDrivers.isEmpty() }
        )
        assertTrue(descriptors.flatMap { it.controlDrivers }.all(String::isNotBlank))
    }

    @Test
    fun snapshotMatchesTheDeclaredContributorContract() {
        val descriptors = StateProbe.descriptors()
        val snapshot = StateProbe.snapshot()

        assertEquals(descriptors.map { it.name }, snapshot.contributions.map { it.name })
        assertEquals(
            descriptors.filter { it.includeInCompatibilityState }.flatMap { it.fields }.toSet(),
            snapshot.values.keys,
        )
        snapshot.contributions.forEach { contribution ->
            val descriptor = descriptors.single { it.name == contribution.name }
            assertEquals(descriptor.fields, contribution.values.keys)
            assertEquals(descriptor.captureCost, contribution.captureCost)
            assertEquals(descriptor.sensitivity, contribution.sensitivity)
            assertEquals(descriptor.policy, contribution.policy)
            assertEquals(descriptor.includeInCompatibilityState, contribution.includeInCompatibilityState)
            assertEquals(descriptor.boundaryBaseline, contribution.boundaryBaseline)
            assertEquals(descriptor.controlDrivers, contribution.controlDrivers)
        }
    }

    @Test
    fun harnessOwnedPreferencesHaveUnambiguousIdentityAndStorageKeys() {
        val descriptors = HarnessPreferenceState.descriptors()

        assertEquals(descriptors.size, descriptors.map { it.id }.toSet().size)
        assertEquals(descriptors.size, descriptors.map { it.key }.toSet().size)
        assertTrue(descriptors.all { it.id.isNotBlank() && it.key.isNotBlank() })
    }

    @Test
    fun searchConfigurationCleanupRestoresTheDeclaredBoundary() {
        val store = appContext.components.core.store
        val initial = store.state.search
        val regionDefault = checkNotNull(initial.regionDefaultSearchEngineId)
        val selected =
            initial.regionSearchEngines.firstOrNull { it.id != regionDefault } ?: initial.regionSearchEngines.first()

        store.dispatch(
            SearchAction.SetSearchEnginesAction(
                regionSearchEngines = initial.regionSearchEngines.filterNot { it.id == selected.id },
                customSearchEngines = initial.customSearchEngines,
                hiddenSearchEngines = initial.hiddenSearchEngines + selected,
                disabledSearchEngineIds = emptyList(),
                additionalSearchEngines = initial.additionalSearchEngines,
                additionalAvailableSearchEngines = initial.additionalAvailableSearchEngines,
                userSelectedSearchEngineId = selected.id,
                userSelectedSearchEngineName = selected.name,
                userSelectedPrivateSearchEngineId = selected.id,
                userSelectedPrivateSearchEngineName = selected.name,
                regionDefaultSearchEngineId = regionDefault,
                regionSearchEnginesOrder = initial.regionSearchEnginesOrder,
                searchEnginesConfigurationId = initial.searchEnvironmentId,
            )
        )
        HarnessSearchState.seedPersistentOverrideForContractTest()

        assertFalse(HarnessSearchState.isAtHarnessBoundary(store.state.search))
        assertTrue(HarnessSearchState.persistentMetadataOverrideCount() > 0)
        assertTrue(HarnessSearchState.persistentCustomEngineCount() > 0)

        runBlocking { HarnessSearchState.clear() }

        assertTrue(HarnessSearchState.isAtHarnessBoundary(store.state.search))
        assertEquals(0, HarnessSearchState.persistentMetadataOverrideCount())
        assertEquals(0, HarnessSearchState.persistentCustomEngineCount())
    }
}
