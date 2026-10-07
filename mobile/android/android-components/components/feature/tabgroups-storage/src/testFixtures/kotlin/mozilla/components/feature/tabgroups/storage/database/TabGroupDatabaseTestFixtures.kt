/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabgroups.storage.database

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Helper function for obtaining a database in a test environment.
 *
 * This intentionally returns a generic [RoomDatabase] so the [TabGroupDatabase] type stays internal to this module.
 */
fun getTestTabGroupDatabase(context: Context): RoomDatabase =
    Room.inMemoryDatabaseBuilder(
            context = context,
            klass = TabGroupDatabase::class.java,
        )
        .build()
