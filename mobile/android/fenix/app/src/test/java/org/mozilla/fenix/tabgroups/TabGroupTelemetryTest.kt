/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package org.mozilla.fenix.tabgroups

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Metrics
import org.mozilla.fenix.GleanMetrics.TabsTray
import org.mozilla.fenix.components.metrics.MetricsUtils
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.tabstray.data.TabGroupTheme
import org.mozilla.fenix.tabstray.data.TabsTrayItem
import org.mozilla.fenix.tabstray.redux.state.TabGroupFormState
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class) // for gleanTestRule
class TabGroupTelemetryTest {
    @get:Rule val gleanTestRule = FenixGleanTestRule(testContext)

    @Test
    fun `GIVEN edit state active AND name not changed WHEN recordSaveClicked is called THEN name change is not recorded`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.TABS_TRAY)
        target.recordSaveClicked(provideContext(editState = true))
        assertNull(TabsTray.tabGroupNameChanged.testGetValue())
        assertNull(TabsTray.tabGroupNamed.testGetValue())
        assertNull(TabsTray.tabGroupCreated.testGetValue())
    }

    @Test
    fun `GIVEN edit state active AND name updated WHEN recordSaveClicked is called THEN name change is recorded`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.TABS_TRAY)
        target.recordSaveClicked(provideContext(editState = true, updateName = true))
        assertNotNull(TabsTray.tabGroupNameChanged.testGetValue())
        assertNull(TabsTray.tabGroupNamed.testGetValue())
        assertNull(TabsTray.tabGroupCreated.testGetValue())
    }

    @Test
    fun `GIVEN edit state not active WHEN recordSaveClicked is called THEN group creation and group naming is recorded`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.TABS_TRAY)
        target.recordSaveClicked(provideContext(editState = false))
        assertNotNull(TabsTray.tabGroupNamed.testGetValue())
        assertNotNull(TabsTray.tabGroupCreated.testGetValue())
        assertNull(TabsTray.tabGroupNameChanged.testGetValue())
    }

    @Test
    fun `GIVEN edit state active WHEN recordThemeChanged is called THEN group color color change is recorded`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.TABS_TRAY)
        target.recordThemeChanged(provideContext(editState = true), theme = TabGroupTheme.Yellow)
        assertNotNull(TabsTray.tabGroupColorChanged.testGetValue())
        val snapshot = TabsTray.tabGroupColorChanged.testGetValue()!!
        assertEquals(expected = 1, actual = snapshot.size)
        assertEquals(expected = TabGroupTheme.Yellow.name, snapshot.single().extra?.getValue("tab_group_color_changed"))
        assertNull(TabsTray.tabGroupColorAssigned.testGetValue())
    }

    @Test
    fun `GIVEN edit state not active WHEN recordThemeChanged is called THEN group color assignment is recorded`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.TABS_TRAY)
        target.recordThemeChanged(provideContext(editState = false), theme = TabGroupTheme.Yellow)
        assertNotNull(TabsTray.tabGroupColorAssigned.testGetValue())
        val snapshot = TabsTray.tabGroupColorAssigned.testGetValue()!!
        assertEquals(expected = 1, actual = snapshot.size)
        assertEquals(expected = TabGroupTheme.Yellow.name, snapshot.single().extra?.getValue("color"))
        assertNull(TabsTray.tabGroupColorChanged.testGetValue())
    }

    @Test
    fun `WHEN recordTabAddedToGroup is called THEN tab add is recorded with correct count`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.TABS_TRAY)
        target.recordTabAddedToGroup(1)
        assertNotNull(TabsTray.tabAddedToGroup.testGetValue())
        val snapshot = TabsTray.tabAddedToGroup.testGetValue()!!
        assertEquals(1, snapshot.size)
        assertEquals("1", snapshot.single().extra?.getValue("tab_count"))
    }

    @Test
    fun `GIVEN TabsTray entry point WHEN recordCreatedFromMenu is called THEN menu creation is recorded`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.TABS_TRAY)
        target.recordCreatedFromMenu()
        assertCreationModeLabel("menu")
    }

    @Test
    fun `GIVEN browser menu entry point WHEN recordCreatedFromMenu is called THEN browser menu creation is recorded`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.BROWSER_MENU)
        target.recordCreatedFromMenu()
        assertCreationModeLabel("browser_menu")
    }

    @Test
    fun `WHEN recordCreatedFromFab is called THEN fab creation is recorded`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.TABS_TRAY)
        target.recordCreatedFromFab()
        assertCreationModeLabel("fab")
    }

    @Test
    fun `WHEN recordCreatedFromDragAndDrop is called THEN drag and drop creation is recorded`() {
        val target = TabGroupTelemetry(tabGroupAccessPoint = MetricsUtils.TabGroupAccessPoint.TABS_TRAY)
        target.recordCreatedFromDragAndDrop()
        assertCreationModeLabel("drag_and_drop")
    }

    private fun provideContext(
        editState: Boolean,
        updateName: Boolean = false,
    ): TabGroupTelemetry.TabGroupTelemetryContext {
        val group =
            TabsTrayItem.TabGroup(
                id = "123",
                title = "Test",
                theme = TabGroupTheme.Blue,
                tabs = emptyList(),
            )
        return object : TabGroupTelemetry.TabGroupTelemetryContext {
            override val groups: List<TabsTrayItem.TabGroup>
                get() = listOf(group)

            override val formState: TabGroupFormState
                get() =
                    TabGroupFormState(
                        tabGroupId =
                            if (editState) {
                                group.id
                            } else {
                                null
                            },
                        name =
                            if (updateName) {
                                "New Name!"
                            } else {
                                group.title
                            },
                    )
        }
    }

    // Assert that only the requested label was reported, and the label doesn't have a typo (fall in the other bucket)
    private fun assertCreationModeLabel(label: String) {
        TabGroupTelemetry.CreationMode.entries.forEach { entry ->
            if (entry.telemetryId == label) {
                assertEquals(1, Metrics.tabGroupCreationMode[entry.telemetryId].testGetValue())
            } else {
                assertNull(Metrics.tabGroupCreationMode[entry.telemetryId].testGetValue())
            }
        }
        assertNull(Metrics.tabGroupCreationMode["__other__"].testGetValue())
    }
}
