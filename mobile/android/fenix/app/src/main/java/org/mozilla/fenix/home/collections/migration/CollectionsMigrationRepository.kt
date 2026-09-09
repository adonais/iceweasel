/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.collections.migration

import org.mozilla.fenix.utils.Settings

/** Repository for the preferences backing the Collections to Tab Groups migration. */
interface CollectionsMigrationRepository {
    /**
     * Returns whether the migration should be attempted. The migration is skipped once every Collection has been
     * migrated, when it has been disabled, and when the Tab Groups feature is disabled.
     */
    fun shouldMigrate(): Boolean

    /** Returns whether every stored Collection has been migrated to a Tab Group. */
    fun hasMigratedCollections(): Boolean

    /**
     * Updates the preference that tracks whether every stored Collection has been migrated.
     *
     * @param migrated Whether every stored Collection has been migrated.
     */
    fun updateHasMigratedCollections(migrated: Boolean)

    /** Returns the ids of the Collections that have already been migrated. */
    fun getMigratedCollectionIds(): Set<String>

    /**
     * Records the Collection with the given [collectionId] as migrated so that it is not migrated again.
     *
     * @param collectionId The id of the migrated Collection.
     */
    fun addMigratedCollectionId(collectionId: String)

    /**
     * Clears the ids of the Collections that have been migrated. They are only needed to resume an incomplete
     * migration.
     */
    fun clearMigratedCollectionIds()

    /** Returns whether the Collections migration card should be shown. */
    fun shouldShowCollectionsMigrationCard(): Boolean

    /**
     * Updates the preference that tracks whether the Collections migration card should be shown.
     *
     * @param visible Whether the card should be shown.
     */
    fun updateCollectionsMigrationCardVisibility(visible: Boolean)
}

/**
 * The default implementation of the [CollectionsMigrationRepository].
 *
 * @param settings [Settings] used to read and write the migration preferences.
 */
class DefaultCollectionsMigrationRepository(private val settings: Settings) : CollectionsMigrationRepository {
    override fun shouldMigrate(): Boolean =
        !settings.hasMigratedCollectionsToTabGroups &&
            settings.migrateCollectionsToTabGroupsEnabled &&
            settings.tabGroupsEnabled

    override fun hasMigratedCollections(): Boolean = settings.hasMigratedCollectionsToTabGroups

    override fun updateHasMigratedCollections(migrated: Boolean) {
        settings.hasMigratedCollectionsToTabGroups = migrated
    }

    override fun getMigratedCollectionIds(): Set<String> = settings.migratedCollectionIds

    override fun addMigratedCollectionId(collectionId: String) {
        settings.migratedCollectionIds += collectionId
    }

    override fun clearMigratedCollectionIds() {
        settings.migratedCollectionIds = emptySet()
    }

    override fun shouldShowCollectionsMigrationCard(): Boolean = settings.shouldShowCollectionsMigrationCard

    override fun updateCollectionsMigrationCardVisibility(visible: Boolean) {
        settings.shouldShowCollectionsMigrationCard = visible
    }
}
