/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(manifest = Config.NONE)
class DefaultFenixSettingsIndexerTest {

    private lateinit var indexer: DefaultFenixSettingsIndexer

    @Before
    fun setUp() {
        indexer = DefaultFenixSettingsIndexer(ApplicationProvider.getApplicationContext())
        indexer.indexAllSettings()
    }

    /**
     * Test that a query containing special characters like '%' does not crash
     * and correctly returns an empty list if no matches are found.
     */
    @Test
    fun `GIVEN a query with special characters with getSettingsWithQuery THEN return empty list`() = runBlocking {
        val query = "%"

        val results = indexer.getSettingsWithQuery(query)

        assertTrue(results.isEmpty())
    }
}
