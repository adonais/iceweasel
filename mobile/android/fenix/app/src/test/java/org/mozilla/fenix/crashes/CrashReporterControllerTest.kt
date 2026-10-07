/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.crashes

import androidx.navigation.NavController
import io.mockk.Called
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.StandardTestDispatcher
import mozilla.components.lib.crash.Crash.NativeCodeCrash
import mozilla.components.lib.crash.store.CrashReportOption
import mozilla.components.support.test.ext.joinBlocking
import mozilla.components.support.test.robolectric.testContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.browser.BrowserFragmentDirections
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.Components
import org.mozilla.fenix.components.appstate.AppState
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CrashReporterControllerTest {

    private val sessionId = "testId"
    private val components: Components = mockk(relaxed = true)

    private val settings: Settings = Settings(appContext = testContext, isCrashReportEnabledInBuild = true)

    private val navController: NavController = mockk(relaxed = true)
    private val crash: NativeCodeCrash = mockk(relaxed = true)
    private val testScope = CoroutineScope(StandardTestDispatcher())
    private val appStore = AppStore(AppState(nonFatalCrashes = listOf(crash)))
    private var controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

    @Before
    fun setUp() {
        every { components.applicationScope } returns testScope
    }

    @Test
    fun `GIVEN reportCrashes true WHEN user restores tab THEN try submitting non-fatal crashes and recover tabs`() {
        controller = spyk(controller)

        controller.handleCloseAndRestore(true)?.joinBlocking()

        verify { components.useCases.sessionUseCases.crashRecovery.invoke() }
    }

    @Test
    fun `GIVEN reportCrashes false WHEN user restores tab THEN try submitting non-fatal crashes and recover tabs`() {
        controller = spyk(controller)

        controller.handleCloseAndRestore(false)

        verify { controller.submitPendingNonFatalCrashesIfNecessary(false) }
        verify { components.useCases.sessionUseCases.crashRecovery.invoke() }
    }

    @Test
    fun `GIVEN reportCrashes true WHEN user closes the tab THEN try submitting non-fatal crashes, remove the current tab and recover others`() {
        controller = spyk(controller)

        controller.handleCloseAndRemove(true)?.joinBlocking()

        verify { controller.submitPendingNonFatalCrashesIfNecessary(true) }
        verify { components.useCases.tabsUseCases.removeTab(sessionId) }
        verify { components.useCases.sessionUseCases.crashRecovery.invoke() }
    }

    @Test
    fun `GIVEN reportCrashes false WHEN user closes the tab THEN try submitting non-fatal crashes, remove the current tab and recover others`() {
        controller = spyk(controller)

        controller.handleCloseAndRemove(false)

        verify { controller.submitPendingNonFatalCrashesIfNecessary(false) }
        verify { components.useCases.tabsUseCases.removeTab(sessionId) }
        verify { components.useCases.sessionUseCases.crashRecovery.invoke() }
    }

    @Test
    fun `GIVEN reportCrashes false and crash report option set to Auto WHEN trying to submit crashes THEN no crashes should be submitted and all should be disposed off`() {
        settings.crashReportChoice = CrashReportOption.Auto.label
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        controller.submitPendingNonFatalCrashesIfNecessary(false)?.joinBlocking()

        verify(exactly = 0) { components.analytics.crashReporter.submitReport(crash) }
        assertTrue(appStore.state.nonFatalCrashes.isEmpty())
    }

    @Test
    fun `GIVEN reportCrashes false and crash report option set to Ask WHEN trying to submit crashes THEN no crashes should be submitted and all should be disposed off`() {
        settings.crashReportChoice = CrashReportOption.Ask.label
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        controller.submitPendingNonFatalCrashesIfNecessary(false)?.joinBlocking()

        verify(exactly = 0) { components.analytics.crashReporter.submitReport(crash) }
        assertTrue(appStore.state.nonFatalCrashes.isEmpty())
    }

    @Test
    fun `GIVEN reportCrashes false and crash report option set to Never WHEN trying to submit crashes THEN no crashes should be submitted and all should be disposed off`() {
        settings.crashReportChoice = CrashReportOption.Never.label
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        controller.submitPendingNonFatalCrashesIfNecessary(false)?.joinBlocking()

        verify(exactly = 0) { components.analytics.crashReporter.submitReport(crash) }
        assertTrue(appStore.state.nonFatalCrashes.isEmpty())
    }

    @Test
    fun `GIVEN reportCrashes true and crash report option set to Never WHEN trying to submit crashes THEN no crashes should be submitted and all should be disposed off`() {
        settings.crashReportChoice = CrashReportOption.Never.label
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        controller.submitPendingNonFatalCrashesIfNecessary(true)?.joinBlocking()

        verify(exactly = 0) { components.analytics.crashReporter.submitReport(crash) }
        assertTrue(appStore.state.nonFatalCrashes.isEmpty())
    }

    @Test
    fun `GIVEN reportCrashes true, crash reporting enabled, and crash report setting set to Auto WHEN trying to submit crashes THEN all crashes should be submitted and then disposed off`() {
        settings.crashReportChoice = CrashReportOption.Auto.label
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        controller.submitPendingNonFatalCrashesIfNecessary(true)!!.joinBlocking()

        verify { components.analytics.crashReporter.submitReport(crash) }
        assertTrue(appStore.state.nonFatalCrashes.isEmpty())
    }

    @Test
    fun `GIVEN reportCrashes true, crash reporting enabled, and crash report setting set to Ask WHEN trying to submit crashes THEN all crashes should be submitted and then disposed off`() {
        settings.crashReportChoice = CrashReportOption.Ask.label
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        controller.submitPendingNonFatalCrashesIfNecessary(true)!!.joinBlocking()

        verify { components.analytics.crashReporter.submitReport(crash) }
        assertTrue(appStore.state.nonFatalCrashes.isEmpty())
    }

    @Test
    fun `GIVEN only one tab opened WHEN user closes the tab THEN navigate to Home`() {
        controller = CrashReporterController(sessionId, 1, components, settings, navController, appStore)

        controller.handleCloseAndRemove(true)?.joinBlocking()

        verify { navController.navigate(BrowserFragmentDirections.actionGlobalHome()) }
    }

    @Test
    fun `GIVEN multiple tabs opened WHEN user closes one tab THEN don't use navigation`() {
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        controller.handleCloseAndRemove(true)?.joinBlocking()

        verify { navController wasNot Called }
    }

    @Test
    fun `GIVEN crash report option is set to Never, THEN reporting option is both hidden and unchecked`() {
        settings.crashReportChoice = CrashReportOption.Never.label
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        assertFalse(controller.isCrashReportCheckboxVisible())
        assertFalse(controller.isCrashReportCheckboxInitiallyChecked())
    }

    @Test
    fun `GIVEN crash report option is set to Ask, THEN reporting option is shown and initially checked`() {
        settings.crashReportChoice = CrashReportOption.Ask.label
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        assertTrue(controller.isCrashReportCheckboxVisible())
        assertTrue(controller.isCrashReportCheckboxInitiallyChecked())
    }

    @Test
    fun `GIVEN crash report option is set to Auto, THEN reporting option is shown and initially checked`() {
        settings.crashReportChoice = CrashReportOption.Auto.label
        controller = CrashReporterController(sessionId, 2, components, settings, navController, appStore)

        assertTrue(controller.isCrashReportCheckboxVisible())
        assertTrue(controller.isCrashReportCheckboxInitiallyChecked())
    }
}
