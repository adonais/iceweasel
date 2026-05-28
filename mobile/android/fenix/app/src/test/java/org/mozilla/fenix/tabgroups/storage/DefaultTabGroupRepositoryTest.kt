/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import mozilla.components.support.utils.DateTimeProvider
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.tabgroups.storage.database.StoredTabGroup
import org.mozilla.fenix.tabgroups.storage.database.TabGroupDatabase
import org.mozilla.fenix.tabgroups.storage.database.TapGroupAssignment
import org.mozilla.fenix.tabgroups.storage.repository.DefaultTabGroupRepository
import java.io.IOException
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class DefaultTabGroupRepositoryTest {

    private lateinit var database: TabGroupDatabase
    private lateinit var repository: DefaultTabGroupRepository
    private val dateTimeProvider: DateTimeProvider = object : DateTimeProvider {
        override fun currentLocalDate(): LocalDate = LocalDate.of(1998, 3, 31)

        override fun currentZoneId(): ZoneId = ZoneOffset.UTC

        override fun currentTimeMillis(): Long = timeStamp
    }

    private var timeStamp: Long = 0L

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            context = ApplicationProvider.getApplicationContext(),
            klass = TabGroupDatabase::class.java,
        ).build()
        repository = DefaultTabGroupRepository(
            database = database,
            dateTimeProvider = dateTimeProvider,
        )
    }

    @After
    @Throws(IOException::class)
    fun teardown() {
        database.close()
    }

    @Test
    fun `WHEN a tab group is created with tabs THEN add the group and group assignments to the database`() = runTest {
        val expectedTabGroup = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 10L,
        )
        val tabIds = List(size = 10) { "$it" }
        val expectedTabGroupAssignments = tabIds.associateWith { expectedTabGroup.id }

        repository.createTabGroupWithTabs(
            tabGroup = expectedTabGroup,
            tabIds = tabIds,
        )

        advanceUntilIdle()

        assertEquals(listOf(expectedTabGroup), repository.fetchTabGroups())
        assertEquals(expectedTabGroupAssignments, repository.fetchTabGroupAssignments())
    }

    @Test
    fun `WHEN a tab group is created THEN add the entry to the database`() = runTest {
        val expectedTabGroup = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 10L,
        )
        repository.addNewTabGroup(expectedTabGroup)

        advanceUntilIdle()

        assertEquals(listOf(expectedTabGroup), repository.fetchTabGroups())
        assertEquals(expectedTabGroup, repository.fetchTabGroupById(expectedTabGroup.id))
    }

    @Test
    fun `WHEN a tab group update is received THEN update its entry in the database`() = runTest {
        val initialTabGroup = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 10L,
        )
        initializeDatabase(
            initialTabGroups = listOf(initialTabGroup),
        )
        val expectedTitle = "new title"
        val expectedTheme = "new theme"
        val expectedModified = 20L
        val updatedTabGroup = initialTabGroup.copy(
            title = expectedTitle,
            theme = expectedTheme,
            lastModified = expectedModified,
        )
        repository.addNewTabGroup(updatedTabGroup)

        advanceUntilIdle()

        val actualTabGroup = repository.fetchTabGroups()[0]
        assertEquals(updatedTabGroup, actualTabGroup)
    }

    @Test
    fun `WHEN a user closes an open tab group THEN mark the group as closed in the database and update its timestamp`() = runTest {
        val initialTabGroup = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = false,
        )
        val expectedTimestamp = 7L
        timeStamp = expectedTimestamp
        val expectedTabGroup = initialTabGroup.copy(
            lastModified = expectedTimestamp,
            closed = true,
        )
        timeStamp = expectedTimestamp
        initializeDatabase(
            initialTabGroups = listOf(initialTabGroup),
        )

        repository.closeTabGroup(tabGroupId = initialTabGroup.id)

        advanceUntilIdle()

        val tabGroup = repository.fetchTabGroups()[0]
        assertEquals(expectedTabGroup, tabGroup)
    }

    @Test
    fun `WHEN a user opens a closed tab group THEN mark the group as open in the database and update its timestamp`() = runTest {
        val initialTabGroup = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val expectedTimestamp = 7L
        timeStamp = expectedTimestamp
        val expectedTabGroup = initialTabGroup.copy(
            lastModified = expectedTimestamp,
            closed = false,
        )
        initializeDatabase(
            initialTabGroups = listOf(initialTabGroup),
        )

        repository.openTabGroup(tabGroupId = initialTabGroup.id)

        advanceUntilIdle()

        val tabGroup = repository.fetchTabGroups()[0]
        assertEquals(expectedTabGroup, tabGroup)
    }

    @Test
    fun `WHEN a user closes all tab groups THEN mark all group as closed in the database and updated the affected groups' timestamps`() = runTest {
        val openTabGroups = List(size = 10) {
            StoredTabGroup(
                title = "title",
                theme = "theme",
                lastModified = 0L,
                closed = false,
            )
        }
        val alreadyClosedTabGroups = List(size = 10) {
            StoredTabGroup(
                title = "title",
                theme = "theme",
                lastModified = 10L,
                closed = true,
            )
        }
        val expectedTimestamp = 7L
        timeStamp = expectedTimestamp
        val expectedTabGroups = openTabGroups.map { it.copy(closed = true, lastModified = expectedTimestamp) } + alreadyClosedTabGroups
        initializeDatabase(
            initialTabGroups = openTabGroups + alreadyClosedTabGroups,
        )

        repository.closeAllTabGroups()

        advanceUntilIdle()

        assertEquals(expectedTabGroups, repository.fetchTabGroups())
    }

    @Test
    fun `WHEN a tab group assignment is passed-in THEN add the entry to the database and update the group's timestamp`() = runTest {
        val group = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val assignment = TapGroupAssignment(id = "123", tabGroupId = group.id)

        timeStamp = 7L
        initializeDatabase(
            initialTabGroups = listOf(group),
        )

        repository.addTabGroupAssignment(assignment)

        advanceUntilIdle()
        assertEquals(assignment.tabGroupId, repository.fetchTabGroupAssignments()[assignment.id])
        assertEquals(timeStamp, repository.fetchTabGroups()[0].lastModified)
    }

    @Test
    fun `WHEN a tab group assignment is created THEN add the entry to the database and update the group's timestamp`() = runTest {
        val group = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val assignment = TapGroupAssignment(id = "123", tabGroupId = group.id)

        timeStamp = 7L
        initializeDatabase(
            initialTabGroups = listOf(group),
        )

        repository.addTabGroupAssignment(tabId = assignment.id, tabGroupId = assignment.tabGroupId)

        advanceUntilIdle()
        assertEquals(assignment.tabGroupId, repository.fetchTabGroupAssignments()[assignment.id])
        assertEquals(timeStamp, repository.fetchTabGroups()[0].lastModified)
    }

    @Test
    fun `WHEN a tab group assignment update is received THEN update the entry in the database and update the group's timestamp`() = runTest {
        val group = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val assignment = TapGroupAssignment(id = "123", tabGroupId = "456")

        timeStamp = 7L
        initializeDatabase(
            initialTabGroups = listOf(group),
            initialTabGroupAssignments = listOf(assignment),
        )

        repository.updateTabGroupAssignment(tabId = assignment.id, group.id)

        advanceUntilIdle()
        assertEquals(group.id, repository.fetchTabGroupAssignments()[assignment.id])
        assertEquals(timeStamp, repository.fetchTabGroups()[0].lastModified)
    }

    @Test
    fun `WHEN tabs are added to an existing group THEN assign those tabs to the group in the database`() = runTest {
        val group = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val tabIds = List(size = 10) { "$it" }
        val expectedTabGroupAssignments = tabIds.associateWith { group.id }

        timeStamp = 7L
        initializeDatabase(
            initialTabGroups = listOf(group),
        )

        repository.addTabsToTabGroup(
            tabGroupId = group.id,
            tabIds = tabIds,
        )

        advanceUntilIdle()
        assertEquals(expectedTabGroupAssignments, repository.fetchTabGroupAssignments())
        assertEquals(timeStamp, repository.fetchTabGroups()[0].lastModified)
    }

    @Test
    fun `WHEN multiple tabs are assigned to a group THEN add the assignments to the database and update the group's timestamp`() = runTest {
        val group = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val assignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = group.id)
        }
        val expectedAssignments = assignments.associate { it.id to it.tabGroupId }
        timeStamp = 7L
        initializeDatabase(
            initialTabGroups = listOf(group),
        )

        repository.addTabGroupAssignments(assignments = assignments)

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
        assertEquals(timeStamp, repository.fetchTabGroups()[0].lastModified)
    }

    @Test
    fun `WHEN a tab group assignment is deleted THEN remove the entry from the database and update the group's timestamp`() = runTest {
        val group = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val assignment1 = TapGroupAssignment(id = "1", tabGroupId = group.id)
        val assignment2 = TapGroupAssignment(id = "2", tabGroupId = group.id)
        val expectedAssignments = mapOf(assignment1.id to assignment1.tabGroupId)

        timeStamp = 7L
        initializeDatabase(
            initialTabGroups = listOf(group),
            initialTabGroupAssignments = listOf(assignment1, assignment2),
        )

        repository.deleteTabGroupAssignment(assignment2)

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
        assertEquals(timeStamp, repository.fetchTabGroups()[0].lastModified)
    }

    @Test
    fun `WHEN a tab group assignment is deleted via ID THEN remove the matching entry from the database and update the group's timestamp`() = runTest {
        val group = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val assignment1 = TapGroupAssignment(id = "1", tabGroupId = group.id)
        val assignment2 = TapGroupAssignment(id = "2", tabGroupId = group.id)
        val expectedAssignments = mapOf(assignment1.id to assignment1.tabGroupId)

        timeStamp = 7L
        initializeDatabase(
            initialTabGroups = listOf(group),
            initialTabGroupAssignments = listOf(assignment1, assignment2),
        )

        repository.deleteTabGroupAssignmentById(tabId = assignment2.id)

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
        assertEquals(timeStamp, repository.fetchTabGroups()[0].lastModified)
    }

    @Test
    fun `WHEN multiple tab group assignments are deleted THEN remove the entries from the database and update the groups' timestamps`() = runTest {
        val group1 = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val group2 = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
            closed = true,
        )
        val assignment1 = TapGroupAssignment(id = "1", tabGroupId = group1.id)
        val assignment2 = TapGroupAssignment(id = "2", tabGroupId = group1.id)
        val assignment3 = TapGroupAssignment(id = "3", tabGroupId = group2.id)
        val assignment4 = TapGroupAssignment(id = "4", tabGroupId = group2.id)
        val expectedAssignments = mapOf(assignment1.id to assignment1.tabGroupId, assignment4.id to assignment4.tabGroupId)

        timeStamp = 7L
        initializeDatabase(
            initialTabGroups = listOf(group1, group2),
            initialTabGroupAssignments = listOf(assignment1, assignment2, assignment3, assignment4),
        )

        repository.deleteTabGroupAssignmentsById(listOf(assignment2.id, assignment3.id))

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
        assertEquals(timeStamp, repository.fetchTabGroups()[0].lastModified)
    }

    @Test
    fun `WHEN a tab group's tabs are all unassigned THEN remove the assignments from the database and update the group's timestamp`() = runTest {
        val group = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 0L,
        )
        val tabGroupAssignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = group.id)
        }
        val remainingAssignment = TapGroupAssignment(id = "expected", tabGroupId = "12345")
        val expectedAssignments = mapOf(remainingAssignment.id to remainingAssignment.tabGroupId)

        timeStamp = 7L
        initializeDatabase(
            initialTabGroups = listOf(group),
            initialTabGroupAssignments = tabGroupAssignments + remainingAssignment,
        )

        repository.deleteAllTabGroupAssignmentsForGroup(tabGroupId = group.id)

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
        assertEquals(timeStamp, repository.fetchTabGroups()[0].lastModified)
    }

    @Test
    fun `WHEN a tab group is deleted THEN the group and the associated assignments are removed from the database`() = runTest {
        val tabGroupId = "1"
        val tabGroup1 = StoredTabGroup(
            id = tabGroupId,
            title = "tabGroup1",
            theme = "theme",
            lastModified = 10L,
        )
        val tabGroup2 = StoredTabGroup(
            id = "2",
            title = "tabGroup2",
            theme = "theme",
            lastModified = 10L,
        )
        val tabGroupAssignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = tabGroupId)
        }
        val remainingTabGroupAssignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = "2")
        }
        val expectedTabGroupAssignments = remainingTabGroupAssignments.associate { it.id to it.tabGroupId }
        initializeDatabase(
            initialTabGroups = listOf(tabGroup1, tabGroup2),
            initialTabGroupAssignments = tabGroupAssignments + remainingTabGroupAssignments,
        )

        repository.deleteTabGroup(tabGroup1)

        advanceUntilIdle()
        assertEquals(listOf(tabGroup2), repository.fetchTabGroups())
        assertEquals(expectedTabGroupAssignments, repository.fetchTabGroupAssignments())
    }

    @Test
    fun `WHEN a tab group is deleted via ID THEN the matching entry and its associated assignments are removed from the database`() = runTest {
        val tabGroupId = "1"
        val tabGroup1 = StoredTabGroup(
            id = tabGroupId,
            title = "tabGroup1",
            theme = "theme",
            lastModified = 10L,
        )
        val tabGroup2 = StoredTabGroup(
            id = "2",
            title = "tabGroup2",
            theme = "theme",
            lastModified = 10L,
        )
        val tabGroupAssignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = tabGroupId)
        }
        val remainingTabGroupAssignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = "2")
        }
        val expectedTabGroupAssignments = remainingTabGroupAssignments.associate { it.id to it.tabGroupId }
        initializeDatabase(
            initialTabGroups = listOf(tabGroup1, tabGroup2),
            initialTabGroupAssignments = tabGroupAssignments + remainingTabGroupAssignments,
        )

        repository.deleteTabGroupById(tabGroupId = tabGroup1.id)

        advanceUntilIdle()
        assertEquals(listOf(tabGroup2), repository.fetchTabGroups())
        assertEquals(expectedTabGroupAssignments, repository.fetchTabGroupAssignments())
    }

    @Test
    fun `WHEN a subset of tab groups are deleted via ID THEN all of the matching entries and their associated assignments are removed from the database`() = runTest {
        val tabGroup1 = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 10L,
        )
        val tabGroup2 = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 10L,
        )
        val tabGroup3 = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 10L,
        )
        val tabGroupAssignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = tabGroup1.id)
        }
        val remainingTabGroupAssignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = "2")
        }
        val expectedTabGroups = listOf(tabGroup1)
        val expectedTabGroupAssignments = remainingTabGroupAssignments.associate { it.id to it.tabGroupId }
        initializeDatabase(
            initialTabGroups = listOf(tabGroup1, tabGroup2, tabGroup3),
            initialTabGroupAssignments = tabGroupAssignments + remainingTabGroupAssignments,
        )

        repository.deleteTabGroupsById(listOf(tabGroup2.id, tabGroup3.id))

        advanceUntilIdle()
        assertEquals(expectedTabGroups, repository.fetchTabGroups())
        assertEquals(expectedTabGroupAssignments, repository.fetchTabGroupAssignments())
    }

    @Test
    fun `WHEN all tab group data is deleted THEN the database is reset`() = runTest {
        initializeDatabase(
            initialTabGroups = List(size = 20) {
                StoredTabGroup(
                    title = "title $it",
                    theme = "theme",
                    lastModified = 10L,
                )
            },
            initialTabGroupAssignments = List(size = 20) {
                TapGroupAssignment(
                    id = "$it",
                    tabGroupId = "Group_1",
                )
            },
        )

        repository.deleteAllTabGroupData()

        advanceUntilIdle()
        assertTrue(repository.fetchTabGroups().isEmpty())
        assertTrue(repository.fetchTabGroupAssignments().isEmpty())
    }

    private suspend fun initializeDatabase(
        initialTabGroups: List<StoredTabGroup> = emptyList(),
        initialTabGroupAssignments: List<TapGroupAssignment> = emptyList(),
    ) {
        database.tabGroupOperationsDao.upsertTabGroups(initialTabGroups)
        database.tabGroupOperationsDao.upsertTabGroupAssignments(initialTabGroupAssignments)
    }
}
