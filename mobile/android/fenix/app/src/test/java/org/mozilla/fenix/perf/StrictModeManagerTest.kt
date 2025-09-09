/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import android.os.StrictMode
import androidx.fragment.app.FragmentManager
import io.mockk.MockKAnnotations
import io.mockk.confirmVerified
import io.mockk.impl.annotations.MockK
import io.mockk.mockk
import io.mockk.slot
import io.mockk.spyk
import io.mockk.verify
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.Components
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class StrictModeManagerTest {

    private lateinit var debugManager: StrictModeManager
    private lateinit var releaseManager: StrictModeManager

    @MockK(relaxUnitFun = true)
    private lateinit var fragmentManager: FragmentManager

    @MockK(relaxed = true)
    private lateinit var components: Components

    @Before
    fun setup() {
        MockKAnnotations.init(this)

        debugManager = spyk(
            StrictModeManager(true, components, mockk()),
        )

        releaseManager = spyk(
            StrictModeManager(false, components, mockk()),
        )
    }

    @Test
    fun `GIVEN we're in a release build WHEN we enable strict mode THEN we don't set policies`() {
        releaseManager.enableStrictMode(false)
        verify(exactly = 0) { releaseManager.applyThreadPolicy(any()) }
        verify(exactly = 0) { releaseManager.applyVmPolicy(any()) }
    }

    @Test
    fun `GIVEN we're in a debug build WHEN we enable strict mode THEN we set policies`() {
        debugManager.enableStrictMode(false)
        verify { debugManager.applyThreadPolicy(any()) }
        verify { debugManager.applyVmPolicy(any()) }
    }

    @Test
    fun `GIVEN we're in a debug build WHEN we attach a listener THEN we attach to the fragment lifecycle and detach when onFragmentResumed is called`() {
        val callbacks = slot<FragmentManager.FragmentLifecycleCallbacks>()

        debugManager.attachListenerToDisablePenaltyDeath(fragmentManager)
        verify { fragmentManager.registerFragmentLifecycleCallbacks(capture(callbacks), false) }
        confirmVerified(fragmentManager)

        callbacks.captured.onFragmentResumed(fragmentManager, mockk())
        verify { fragmentManager.unregisterFragmentLifecycleCallbacks(callbacks.captured) }
    }

    @Test
    fun `GIVEN we're in a release build WHEN resetAfter is called THEN we return the value from the function block`() {
        val expected = "Hello world"
        val actual = releaseManager.resetAfter(StrictMode.allowThreadDiskReads()) { expected }
        assertEquals(expected, actual)
    }

    @Test
    fun `GIVEN we're in a debug build WHEN resetAfter is called THEN we return the value from the function block`() {
        val expected = "Hello world"
        val actual = debugManager.resetAfter(StrictMode.allowThreadDiskReads()) { expected }
        assertEquals(expected, actual)
    }

    @Test
    fun `GIVEN we're in a release build WHEN resetAfter is called THEN the old policy is not set`() {
        releaseManager.resetAfter(StrictMode.allowThreadDiskReads()) { "" }
        verify(exactly = 0) { releaseManager.applyThreadPolicy(any()) }
    }

    @Test
    fun `GIVEN we're in a debug build WHEN resetAfter is called THEN the old policy is set`() {
        val expectedPolicy = StrictMode.allowThreadDiskReads()
        debugManager.resetAfter(expectedPolicy) { "" }
        verify { debugManager.applyThreadPolicy(expectedPolicy) }
    }

    @Test
    fun `GIVEN we're in a debug build WHEN resetAfter is called and an exception is thrown from the function THEN the old policy is set`() {
        val expectedPolicy = StrictMode.allowThreadDiskReads()
        try {
            debugManager.resetAfter(expectedPolicy) {
                throw IllegalStateException()
            }

            @Suppress("UNREACHABLE_CODE")
            fail("Expected previous method to throw.")
        } catch (e: IllegalStateException) {
            // Expected
        }

        verify { debugManager.applyThreadPolicy(expectedPolicy) }
    }

    @Test
    fun `GIVEN we're in debug mode WHEN we suppress StrictMode THEN the suppressed count increases`() {
        assertEquals(0, debugManager.suppressionCount.get())
        debugManager.resetAfter(StrictMode.allowThreadDiskReads()) { "" }
        assertEquals(1, debugManager.suppressionCount.get())
    }
}
