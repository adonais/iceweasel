/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.collections.migration.fake

import org.mozilla.fenix.home.collections.migration.CollectionsMigrationRepository

/** An in-memory [CollectionsMigrationRepository] for testing. */
class FakeCollectionsMigrationRepository(
    var migrationEnabled: Boolean = true,
    var tabGroupsEnabled: Boolean = true,
    var migrationCompleted: Boolean = false,
    var migratedIds: Set<String> = emptySet(),
    var cardVisible: Boolean = false,
) : CollectionsMigrationRepository {

    override fun shouldMigrate(): Boolean = !migrationCompleted && migrationEnabled && tabGroupsEnabled

    override fun hasMigratedCollections(): Boolean = migrationCompleted

    override fun updateHasMigratedCollections(migrated: Boolean) {
        migrationCompleted = migrated
    }

    override fun getMigratedCollectionIds(): Set<String> = migratedIds

    override fun addMigratedCollectionId(collectionId: String) {
        migratedIds += collectionId
    }

    override fun clearMigratedCollectionIds() {
        migratedIds = emptySet()
    }

    override fun shouldShowCollectionsMigrationCard(): Boolean = cardVisible

    override fun updateCollectionsMigrationCardVisibility(visible: Boolean) {
        cardVisible = visible
    }
}
