/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.tabgroups.storage.repository

import androidx.room.RoomDatabase
import mozilla.components.support.utils.DateTimeProvider
import mozilla.components.support.utils.DefaultDateTimeProvider

/**
 * Creates a [DefaultTabGroupRepository] backed by [database], for use in tests.
 *
 * @param database A test database, e.g. obtained via `getTestTabGroupDatabase`.
 * @param dateTimeProvider The [DateTimeProvider] used to update time-based metadata.
 */
fun createTestTabGroupRepository(
    database: RoomDatabase,
    dateTimeProvider: DateTimeProvider = DefaultDateTimeProvider(),
): DefaultTabGroupRepository = DefaultTabGroupRepository(database, dateTimeProvider)
