/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabgroups.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.tabgroups.storage.database.StoredTabGroup
import org.mozilla.fenix.tabgroups.storage.database.TabGroupDatabase
import org.mozilla.fenix.tabgroups.storage.database.TapGroupAssignment
import org.mozilla.fenix.tabgroups.storage.repository.DefaultTabGroupRepository
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class DefaultTabGroupRepositoryTest {

    private lateinit var database: TabGroupDatabase
    private lateinit var repository: DefaultTabGroupRepository

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            context = ApplicationProvider.getApplicationContext(),
            klass = TabGroupDatabase::class.java,
        ).build()
        repository = DefaultTabGroupRepository(
            database = database,
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
    fun `WHEN a user closes an open tab group THEN mark the group as closed in the database`() = runTest {
        val initialTabGroup = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 10L,
            closed = false,
        )
        initializeDatabase(
            initialTabGroups = listOf(initialTabGroup),
        )

        withContext(Dispatchers.IO) {
            repository.closeTabGroup(tabGroupId = initialTabGroup.id)
        }

        advanceUntilIdle()

        assertTrue(repository.fetchTabGroups()[0].closed)
    }

    @Test
    fun `WHEN a user opens a closed tab group THEN mark the group as open in the database`() = runTest {
        val initialTabGroup = StoredTabGroup(
            title = "title",
            theme = "theme",
            lastModified = 10L,
            closed = true,
        )
        initializeDatabase(
            initialTabGroups = listOf(initialTabGroup),
        )

        withContext(Dispatchers.IO) {
            repository.openTabGroup(tabGroupId = initialTabGroup.id)
        }

        advanceUntilIdle()

        assertFalse(repository.fetchTabGroups()[0].closed)
    }

    @Test
    fun `WHEN a user closes all tab groups THEN mark all group as closed in the database`() = runTest {
        val openTabGroups = List(size = 10) {
            StoredTabGroup(
                title = "title",
                theme = "theme",
                lastModified = 10L,
                closed = true,
            )
        }
        val alreadyClosedTabGroups = List(size = 10) {
            StoredTabGroup(
                title = "title",
                theme = "theme",
                lastModified = 10L,
                closed = false,
            )
        }
        initializeDatabase(
            initialTabGroups = openTabGroups + alreadyClosedTabGroups,
        )

        withContext(Dispatchers.IO) {
            repository.closeAllTabGroups()
        }

        advanceUntilIdle()

        assertTrue(repository.fetchTabGroups().all { it.closed })
    }

    @Test
    fun `WHEN a tab group assignment is passed-in THEN add the entry to the database`() = runTest {
        val assignment = TapGroupAssignment(id = "123", tabGroupId = "456")

        repository.addTabGroupAssignment(assignment)

        advanceUntilIdle()
        assertEquals(assignment.tabGroupId, repository.fetchTabGroupAssignments()[assignment.id])
    }

    @Test
    fun `WHEN a tab group assignment is created THEN add the entry to the database`() = runTest {
        val assignment = TapGroupAssignment(id = "123", tabGroupId = "456")

        repository.addTabGroupAssignment(tabId = assignment.id, tabGroupId = assignment.tabGroupId)

        advanceUntilIdle()
        assertEquals(assignment.tabGroupId, repository.fetchTabGroupAssignments()[assignment.id])
    }

    @Test
    fun `WHEN a tab group assignment update is received THEN update the entry in the database`() = runTest {
        val assignment = TapGroupAssignment(id = "123", tabGroupId = "456")
        val newTabGroupID = "789"
        initializeDatabase(initialTabGroupAssignments = listOf(assignment))

        repository.updateTabGroupAssignment(tabId = assignment.id, newTabGroupID)

        advanceUntilIdle()
        assertEquals(newTabGroupID, repository.fetchTabGroupAssignments()[assignment.id])
    }

    @Test
    fun `WHEN tabs are added to an existing group THEN assign those tabs to the group in the database`() = runTest {
        val tabGroupId = "12345"
        val tabIds = List(size = 10) { "$it" }
        val expectedTabGroupAssignments = tabIds.associateWith { tabGroupId }

        repository.addTabsToTabGroup(
            tabGroupId = tabGroupId,
            tabIds = tabIds,
        )

        advanceUntilIdle()
        assertEquals(expectedTabGroupAssignments, repository.fetchTabGroupAssignments())
    }

    @Test
    fun `WHEN multiple tabs are assigned to a group THEN add the assignments to the database`() = runTest {
        val assignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = "456")
        }
        val expectedAssignments = assignments.associate { it.id to it.tabGroupId }

        repository.addTabGroupAssignments(assignments = assignments)

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
    }

    @Test
    fun `WHEN a tab group assignment is deleted THEN remove the entry from the database`() = runTest {
        val assignment1 = TapGroupAssignment(id = "1", tabGroupId = "12345")
        val assignment2 = TapGroupAssignment(id = "2", tabGroupId = "12345")
        val expectedAssignments = mapOf(assignment1.id to assignment1.tabGroupId)
        initializeDatabase(initialTabGroupAssignments = listOf(assignment1, assignment2))

        repository.deleteTabGroupAssignment(assignment2)

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
    }

    @Test
    fun `WHEN a tab group assignment is deleted via ID THEN remove the matching entry from the database`() = runTest {
        val assignment1 = TapGroupAssignment(id = "1", tabGroupId = "12345")
        val assignment2 = TapGroupAssignment(id = "2", tabGroupId = "12345")
        val expectedAssignments = mapOf(assignment1.id to assignment1.tabGroupId)
        initializeDatabase(initialTabGroupAssignments = listOf(assignment1, assignment2))

        repository.deleteTabGroupAssignmentById(tabId = assignment2.id)

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
    }

    @Test
    fun `WHEN multiple tab group assignments are deleted THEN remove the entries from the database`() = runTest {
        val assignment1 = TapGroupAssignment(id = "1", tabGroupId = "12345")
        val assignment2 = TapGroupAssignment(id = "2", tabGroupId = "12345")
        val assignment3 = TapGroupAssignment(id = "3", tabGroupId = "12345")
        val assignment4 = TapGroupAssignment(id = "4", tabGroupId = "12345")
        val expectedAssignments = mapOf(assignment1.id to assignment1.tabGroupId, assignment4.id to assignment4.tabGroupId)
        initializeDatabase(initialTabGroupAssignments = listOf(assignment1, assignment2, assignment3, assignment4))

        repository.deleteTabGroupAssignmentsById(listOf(assignment2.id, assignment3.id))

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
    }

    @Test
    fun `WHEN a tab group's tabs are all unassigned THEN remove the assignments from the database`() = runTest {
        val tabGroupId = "456"
        val tabGroupAssignments = List(size = 10) {
            TapGroupAssignment(id = "$it", tabGroupId = tabGroupId)
        }
        val remainingAssignment = TapGroupAssignment(id = "expected", tabGroupId = "12345")
        val expectedAssignments = mapOf(remainingAssignment.id to remainingAssignment.tabGroupId)
        initializeDatabase(initialTabGroupAssignments = tabGroupAssignments + remainingAssignment)

        repository.deleteAllTabGroupAssignmentsForGroup(tabGroupId = tabGroupId)

        advanceUntilIdle()
        assertEquals(expectedAssignments, repository.fetchTabGroupAssignments())
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

        withContext(Dispatchers.IO) {
            repository.deleteAllTabGroupData()
        }

        advanceUntilIdle()
        assertTrue(repository.fetchTabGroups().isEmpty())
        assertTrue(repository.fetchTabGroupAssignments().isEmpty())
    }

    private suspend fun initializeDatabase(
        initialTabGroups: List<StoredTabGroup> = emptyList(),
        initialTabGroupAssignments: List<TapGroupAssignment> = emptyList(),
    ) {
        database.tabGroupDao.upsertTabGroups(initialTabGroups)
        database.tabGroupAssignmentDao.upsertTabGroupAssignments(initialTabGroupAssignments)
    }
}
