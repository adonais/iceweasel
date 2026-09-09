/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.ai

import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import kotlin.test.assertEquals
import mozilla.components.concept.ai.controls.AIControllableFeature
import mozilla.components.concept.ai.controls.AIFeatureMetadata
import mozilla.components.support.test.robolectric.testContext
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.components

@RunWith(AndroidJUnit4::class)
class AIControlsSearchProviderTest {

    @Test
    fun `GIVEN no controllable features WHEN getting search items THEN only the block AI enhancements item is returned`() {
        every { testContext.components.aiFeatureRegistry.getFeatures() } returns emptyList()

        val keys = AIControlsSearchProvider.getSearchItems(testContext).map { it.preferenceKey }

        assertEquals(
            expected = listOf(AIControlsSearchProvider.BLOCK_AI_ENHANCEMENTS_KEY),
            actual = keys,
            message = "Expected only the block AI enhancements item when there are no controllable features",
        )
    }

    @Test
    fun `GIVEN controllable features WHEN getting search items THEN an item per feature is returned after the block AI enhancements item`() {
        val feature =
            AIControllableFeature.inMemory(
                id = AIFeatureMetadata.FeatureId("test.feature"),
                description =
                    AIFeatureMetadata.Description(
                        titleRes = R.string.firefox_labs_title,
                        descriptionRes = R.string.firefox_labs_title,
                        iconRes = 0,
                    ),
            )
        every { testContext.components.aiFeatureRegistry.getFeatures() } returns listOf(feature)

        val keys = AIControlsSearchProvider.getSearchItems(testContext).map { it.preferenceKey }

        assertEquals(
            expected = listOf(AIControlsSearchProvider.BLOCK_AI_ENHANCEMENTS_KEY, "test.feature"),
            actual = keys,
            message = "Expected a search item for each controllable feature after the block AI enhancements item",
        )
    }
}
