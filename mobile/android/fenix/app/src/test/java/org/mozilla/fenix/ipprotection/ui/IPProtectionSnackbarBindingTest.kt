/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ipprotection.ui

import android.content.Context
import android.view.View
import androidx.navigation.NavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.android.material.snackbar.Snackbar.LENGTH_SHORT
import io.mockk.Called
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.BrowserFragmentDirections
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.accounts.FenixFxAEntryPoint
import org.mozilla.fenix.components.appstate.AppAction.IPProtectionSnackbarAction
import org.mozilla.fenix.components.appstate.AppAction.SnackbarAction
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.IPProtectionShowActionSettingsSnackbar
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.IPProtectionShowSnackbar
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.None
import org.mozilla.fenix.components.appstate.snackbar.SnackbarState.ShowSnackbar
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.snackbar.FenixSnackbarDelegate
import org.mozilla.fenix.utils.getSnackbarTimeout

@RunWith(AndroidJUnit4::class)
class IPProtectionSnackbarBindingTest {
    private val testDispatcher = StandardTestDispatcher()
    private val appStore = AppStore()
    private val snackbarDelegate: FenixSnackbarDelegate = mockk(relaxUnitFun = true)
    private val navController: NavController = mockk(relaxUnitFun = true)

    @Test
    fun `WHEN the snackbar state is updated to show an IP Protection snackbar THEN display the snackbar`() =
        runTest(testDispatcher) {
            buildBinding().start()

            appStore.dispatch(IPProtectionSnackbarAction.ShowSnackbar(title = "title"))
            testDispatcher.scheduler.advanceUntilIdle()

            verify {
                snackbarDelegate.show(
                    text = "title",
                    duration = eq(testContext.components.settings.getSnackbarTimeout().value.toInt()),
                )
            }

            assertEquals(None(IPProtectionShowSnackbar("title")), appStore.state.snackbarState)
        }

    @Test
    fun `WHEN the snackbar state is updated to show an IP Protection action settings snackbar THEN display the snackbar with a settings action`() =
        runTest(testDispatcher) {
            val snackbarAction = slot<((v: View) -> Unit)>()
            buildBinding().start()

            appStore.dispatch(IPProtectionSnackbarAction.ShowActionSettingsSnackbar(title = "title"))
            testDispatcher.scheduler.advanceUntilIdle()

            verify {
                snackbarDelegate.show(
                    text = eq("title"),
                    subText = isNull(),
                    subTextOverflow = isNull(),
                    duration = eq(testContext.components.settings.getSnackbarTimeout(hasAction = true).value.toInt()),
                    isError = eq(false),
                    action = eq(testContext.getString(R.string.ip_protection_open_settings_snackbar_action)),
                    withDismissAction = eq(false),
                    listener = capture(snackbarAction),
                )
            }

            assertEquals(None(IPProtectionShowActionSettingsSnackbar("title")), appStore.state.snackbarState)

            snackbarAction.captured.invoke(mockk())

            verify {
                navController.navigate(
                    BrowserFragmentDirections.actionGlobalIpProtectionFragment(
                        entrypoint = FenixFxAEntryPoint.IPProtectionSettings
                    )
                )
            }
        }

    @Test
    fun `WHEN the snackbar state is updated to a state not related to IP Protection THEN do not display the snackbar`() =
        runTest(testDispatcher) {
            val binding = buildBinding()
            binding.start()

            appStore.dispatch(SnackbarAction.ShowSnackbar(title = "title"))
            testDispatcher.scheduler.advanceUntilIdle()

            verify { snackbarDelegate wasNot Called }

            assertEquals(ShowSnackbar("title", LENGTH_SHORT), appStore.state.snackbarState)
        }

    private fun buildBinding(
        context: Context = testContext,
        appStore: AppStore = this.appStore,
        snackbarDelegate: FenixSnackbarDelegate = this.snackbarDelegate,
        navController: NavController = this.navController,
    ) =
        IPProtectionSnackbarBinding(
            appStore = appStore,
            context = context,
            navController = navController,
            snackbarDelegate = snackbarDelegate,
            mainDispatcher = testDispatcher,
        )
}
