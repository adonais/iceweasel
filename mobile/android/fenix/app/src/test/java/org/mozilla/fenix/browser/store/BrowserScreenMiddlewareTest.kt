/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.store

import android.content.Context
import androidx.fragment.app.FragmentManager
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import mozilla.components.feature.downloads.ui.DownloadCancelDialogFragment
import mozilla.components.lib.crash.CrashReporter
import mozilla.components.lib.state.Middleware
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.browser.store.BrowserScreenAction.CancelPrivateDownloadsOnPrivateTabsClosedAccepted
import org.mozilla.fenix.browser.store.BrowserScreenAction.EnvironmentCleared
import org.mozilla.fenix.browser.store.BrowserScreenAction.EnvironmentRehydrated
import org.mozilla.fenix.browser.store.BrowserScreenMiddleware.Companion.CANCEL_PRIVATE_DOWNLOADS_DIALOG_FRAGMENT_TAG
import org.mozilla.fenix.browser.store.BrowserScreenStore.Environment
import org.mozilla.fenix.helpers.lifecycle.TestLifecycleOwner

@RunWith(AndroidJUnit4::class)
class BrowserScreenMiddlewareTest {

    private val lifecycleOwner = TestLifecycleOwner(Lifecycle.State.RESUMED)
    private val fragmentManager: FragmentManager = mockk(relaxed = true)
    private val crashReporter: CrashReporter = mockk(relaxed = true)

    @Test
    fun `WHEN the last private tab is closing THEN record a breadcrumb and show a warning dialog`() {
        val middleware = spyk(BrowserScreenMiddleware(crashReporter))
        val store = buildStore(listOf(middleware))
        val warningDialog: DownloadCancelDialogFragment = mockk(relaxed = true)

        every { middleware.createDownloadCancelDialog(any(), any(), any(), any()) } returns warningDialog

        store.dispatch(BrowserScreenAction.ClosingLastPrivateTab(tabId = "tabId", inProgressPrivateDownloads = 3))

        verify { crashReporter.recordCrashBreadcrumb(any()) }
        verify {
            middleware.createDownloadCancelDialog(
                context = testContext,
                store = store,
                downloadCount = 3,
                tabId = "tabId",
            )
        }
        verify { warningDialog.show(fragmentManager, CANCEL_PRIVATE_DOWNLOADS_DIALOG_FRAGMENT_TAG) }
    }

    @Test
    fun `GIVEN a warning dialog for closing private tabs is shown WHEN the warning is accepted THEN inform about this`() {
        val middleware = spyk(BrowserScreenMiddleware(crashReporter))
        val captureActionsMiddleware = CaptureActionsMiddleware<BrowserScreenState, BrowserScreenAction>()
        val store = buildStore(listOf(middleware, captureActionsMiddleware))
        val warningDialog: DownloadCancelDialogFragment = mockk(relaxed = true)

        every { middleware.createDownloadCancelDialog(any(), any(), any(), any()) } returns warningDialog

        store.dispatch(BrowserScreenAction.ClosingLastPrivateTab("tabId", 3))

        store.dispatch(CancelPrivateDownloadsOnPrivateTabsClosedAccepted)

        captureActionsMiddleware.assertLastAction(CancelPrivateDownloadsOnPrivateTabsClosedAccepted::class) {}
    }

    @Test
    fun `GIVEN an environment was already set WHEN it is cleared THEN reset it to null`() {
        val middleware = BrowserScreenMiddleware(crashReporter)
        val store = buildStore(listOf(middleware))

        assertNotNull(middleware.environment)

        store.dispatch(EnvironmentCleared)

        assertNull(middleware.environment)
    }

    private fun buildStore(
        middlewares: List<Middleware<BrowserScreenState, BrowserScreenAction>> = emptyList(),
        context: Context = testContext,
        viewLifecycleOwner: LifecycleOwner = lifecycleOwner,
        fragmentManager: FragmentManager = this.fragmentManager,
    ) = BrowserScreenStore(
        middleware = middlewares,
    ).also {
        it.dispatch(
            EnvironmentRehydrated(Environment(context, viewLifecycleOwner, fragmentManager)),
        )
    }
}
