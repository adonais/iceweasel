/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.collections.migration

import androidx.test.ext.junit.runners.AndroidJUnit4
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import mozilla.components.support.test.robolectric.testContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class CollectionsMigrationRepositoryTest {

    private lateinit var settings: Settings
    private lateinit var repository: DefaultCollectionsMigrationRepository

    @Before
    fun setup() {
        settings = Settings(testContext)
        repository = DefaultCollectionsMigrationRepository(settings)
    }

    @Test
    fun `GIVEN the migration is enabled and incomplete WHEN the migration is attempted THEN it should migrate`() {
        settings.migrateCollectionsToTabGroupsEnabled = true
        settings.tabGroupsEnabled = true
        settings.hasMigratedCollectionsToTabGroups = false

        assertTrue(repository.shouldMigrate())
    }

    @Test
    fun `GIVEN the migration is disabled WHEN the migration is attempted THEN it should not migrate`() {
        settings.migrateCollectionsToTabGroupsEnabled = false
        settings.tabGroupsEnabled = true
        settings.hasMigratedCollectionsToTabGroups = false

        assertFalse(repository.shouldMigrate())
    }

    @Test
    fun `GIVEN tab groups are disabled WHEN the migration is attempted THEN it should not migrate`() {
        settings.migrateCollectionsToTabGroupsEnabled = true
        settings.tabGroupsEnabled = false
        settings.hasMigratedCollectionsToTabGroups = false

        assertFalse(repository.shouldMigrate())
    }

    @Test
    fun `GIVEN the migration is complete WHEN the migration is attempted THEN it should not migrate`() {
        settings.migrateCollectionsToTabGroupsEnabled = true
        settings.tabGroupsEnabled = true
        settings.hasMigratedCollectionsToTabGroups = true

        assertFalse(repository.shouldMigrate())
    }

    @Test
    fun `WHEN the migration is completed THEN the preference is updated`() {
        assertFalse(repository.hasMigratedCollections())

        repository.updateHasMigratedCollections(migrated = true)

        assertTrue(settings.hasMigratedCollectionsToTabGroups)
        assertTrue(repository.hasMigratedCollections())
    }

    @Test
    fun `WHEN a collection is migrated THEN its id is added to the migrated collection ids`() {
        assertTrue(repository.getMigratedCollectionIds().isEmpty())

        repository.addMigratedCollectionId(collectionId = "1")
        repository.addMigratedCollectionId(collectionId = "2")

        assertEquals(setOf("1", "2"), settings.migratedCollectionIds)
        assertEquals(setOf("1", "2"), repository.getMigratedCollectionIds())
    }

    @Test
    fun `GIVEN collections were migrated WHEN the migrated collection ids are cleared THEN the preference is emptied`() {
        repository.addMigratedCollectionId(collectionId = "1")
        repository.addMigratedCollectionId(collectionId = "2")

        repository.clearMigratedCollectionIds()

        assertTrue(settings.migratedCollectionIds.isEmpty())
        assertTrue(repository.getMigratedCollectionIds().isEmpty())
    }

    @Test
    fun `WHEN the migration has not occurred THEN the card should not be visible`() {
        settings.shouldShowCollectionsMigrationCard = false

        assertFalse(repository.shouldShowCollectionsMigrationCard())
    }

    @Test
    fun `WHEN the migration has occurred THEN the card should be visible`() {
        settings.shouldShowCollectionsMigrationCard = true

        assertTrue(repository.shouldShowCollectionsMigrationCard())
    }

    @Test
    fun `WHEN the card is dismissed THEN the preference is updated and the card should not visible`() {
        settings.shouldShowCollectionsMigrationCard = true

        repository.updateCollectionsMigrationCardVisibility(visible = false)

        assertFalse(settings.shouldShowCollectionsMigrationCard)
        assertFalse(repository.shouldShowCollectionsMigrationCard())
    }
}
