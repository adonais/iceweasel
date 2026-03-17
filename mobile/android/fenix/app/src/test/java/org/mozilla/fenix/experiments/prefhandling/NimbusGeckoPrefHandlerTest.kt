/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.experiments.prefhandling

import android.os.Looper
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.slot
import io.mockk.verify
import junit.framework.TestCase.assertEquals
import junit.framework.TestCase.assertTrue
import kotlinx.coroutines.runBlocking
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.preferences.BrowserPrefType
import mozilla.components.concept.engine.preferences.BrowserPreference
import mozilla.components.service.nimbus.NimbusApi
import org.junit.Assert
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.experiments.nimbus.internal.GeckoPref
import org.mozilla.experiments.nimbus.internal.GeckoPrefState
import org.mozilla.experiments.nimbus.internal.OriginalGeckoPref
import org.mozilla.experiments.nimbus.internal.PrefBranch
import org.mozilla.experiments.nimbus.internal.PrefEnrollmentData
import org.mozilla.experiments.nimbus.internal.PrefUnenrollReason
import org.mozilla.fenix.nimbus.FxNimbus
import org.robolectric.Shadows.shadowOf

const val TEST_PREF = "gecko.nimbus.test"

@OptIn(ExperimentalAndroidComponentsApi::class)
@RunWith(AndroidJUnit4::class)
class NimbusGeckoPrefHandlerTest {

    private val mockNimbusApi = mockk<NimbusApi>(relaxed = true)
    private val mockEngine = mockk<Engine>(relaxed = true)

    // Bug 2020769: This is temporary until we update the Nimbus FML in Bug 2020683 to avoid
    // difficulty when landing an Application Services change.
    @Suppress("NoObjectMocking")
    @Before
    fun setUp() {
        mockkObject(FxNimbus)
        every { FxNimbus.geckoPrefsMap() } returns mapOf(
            "gecko-nimbus-validation" to mapOf(
                "test-preference" to GeckoPref(pref = TEST_PREF, branch = PrefBranch.DEFAULT),
            ),
        )
    }

    private fun makeHandler(
        engine: Engine = mockEngine,
        nimbusApi: NimbusApi = mockNimbusApi,
    ) = NimbusGeckoPrefHandler(lazy { engine }, lazy { nimbusApi })

    @Test
    fun `WHEN getPreferenceStateFromGecko is successful THEN getBrowserPrefs is called AND it returns true`() {
        val mockPrefResult =
            listOf(
                BrowserPreference(
                pref = TEST_PREF,
                defaultValue = "testValue",
                hasUserChangedValue = false,
                prefType = BrowserPrefType.STRING,
            ),
            )
        mockEngine.apply {
            every { getBrowserPrefs(any(), any(), any()) } answers {
                val onSuccess = secondArg<(List<BrowserPreference<*>>) -> Unit>()
                onSuccess(mockPrefResult)
            }
        }
        val handler = makeHandler()
        assertEquals(null, handler.getPreferenceState(TEST_PREF)?.geckoValue)

        val result = handler.getPreferenceStateFromGecko()
        shadowOf(Looper.getMainLooper()).idle()
        verify { mockEngine.getBrowserPrefs(any(), any(), any()) }
        assertTrue(runBlocking { result.await() })

        assertEquals(mockPrefResult[0].defaultValue, handler.getPreferenceState(TEST_PREF)?.geckoValue)
        assertEquals(mockPrefResult[0].prefType, handler.preferenceTypes[TEST_PREF])
    }

    @Test
    fun `WHEN getPreferenceStateFromGecko is fails THEN getBrowserPrefs is called AND it returns false`() {
        every { mockEngine.getBrowserPrefs(any(), any(), any()) } answers {
            val onError = thirdArg<(Throwable) -> Unit>()
            onError(Throwable("error"))
        }

        val handler = makeHandler(engine = mockEngine)
        val result = handler.getPreferenceStateFromGecko()
        shadowOf(Looper.getMainLooper()).idle()

        Assert.assertFalse(runBlocking { result.await() })
        verify { mockEngine.getBrowserPrefs(any(), any(), any()) }
        assertEquals(null, handler.getPreferenceState(TEST_PREF)?.geckoValue)
    }

    @Test
    fun `WHEN setGeckoPrefsState is successful THEN setBrowserPrefs is called`() {
        val handler = makeHandler(engine = mockEngine)
        handler.start()
        handler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING

        val prefState = GeckoPrefState(
            geckoPref = GeckoPref(pref = TEST_PREF, branch = PrefBranch.USER),
            geckoValue = null,
            enrollmentValue = PrefEnrollmentData(
                experimentSlug = "test-experiment",
                prefValue = "test-value",
                featureId = "gecko-nimbus-validation",
                variable = "test-preference",
            ),
            isUserSet = false,
        )
        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            onSuccess(mapOf(TEST_PREF to true))
        }

        handler.setGeckoPrefsState(listOf(prefState))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockEngine.setBrowserPrefs(any(), any(), any()) }
    }

    @Test
    fun `WHEN setGeckoPrefsState fails THEN the item is unenrolled`() {
        val handler = makeHandler(engine = mockEngine)
        handler.start()
        handler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING

        val prefState = GeckoPrefState(
            geckoPref = GeckoPref(pref = TEST_PREF, branch = PrefBranch.USER),
            geckoValue = null,
            enrollmentValue = PrefEnrollmentData(
                experimentSlug = "test-experiment",
                prefValue = "test-value",
                featureId = "gecko-nimbus-validation",
                variable = "test-preference",
            ),
            isUserSet = false,
        )
        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            // Failed to set
            onSuccess(mapOf(TEST_PREF to false))
        }

        val capturedPrefState = slot<GeckoPrefState>()
        val capturedReason = slot<PrefUnenrollReason>()
        every { mockNimbusApi.unenrollForGeckoPref(capture(capturedPrefState), capture(capturedReason)) } returns emptyList()

        handler.setGeckoPrefsState(listOf(prefState))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockNimbusApi.unenrollForGeckoPref(any(), any()) }
        assertEquals(TEST_PREF, capturedPrefState.captured.prefString())
        assertEquals(PrefUnenrollReason.FAILED_TO_SET, capturedReason.captured)
    }

    @Test
    fun `WHEN setGeckoPrefsState cannot make a setter THEN the item is unenrolled`() {
        val handler = makeHandler(engine = mockEngine)
        handler.start()
        handler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING
        // Cannot make a setter when there is no enrollmentValue
        val prefState = GeckoPrefState(
            geckoPref = GeckoPref(pref = TEST_PREF, branch = PrefBranch.USER),
            geckoValue = null,
            enrollmentValue = null,
            isUserSet = false,
        )

        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            // No other valid items to set
            onSuccess(emptyMap())
        }

        val capturedPrefState = slot<GeckoPrefState>()
        val capturedReason = slot<PrefUnenrollReason>()
        every { mockNimbusApi.unenrollForGeckoPref(capture(capturedPrefState), capture(capturedReason)) } returns emptyList()

        handler.setGeckoPrefsState(listOf(prefState))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockNimbusApi.unenrollForGeckoPref(any(), any()) }
        assertEquals(TEST_PREF, capturedPrefState.captured.prefString())
        assertEquals(PrefUnenrollReason.FAILED_TO_SET, capturedReason.captured)
    }

    @Test
    fun `WHEN setGeckoPrefsOriginalValues is successful on a known value THEN setBrowserPrefs is called`() {
        val handler = makeHandler(engine = mockEngine)
        handler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING
        val originalPref = OriginalGeckoPref(
            pref = TEST_PREF,
            branch = PrefBranch.USER,
            value = "original-value",
        )
        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            onSuccess(mapOf(TEST_PREF to true))
        }

        handler.setGeckoPrefsOriginalValues(listOf(originalPref))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockEngine.setBrowserPrefs(any(), any(), any()) }
    }

    @Test
    fun `WHEN setGeckoPrefsOriginalValues is successful on an unknown value THEN clearBrowserUserPref is called`() {
        val handler = makeHandler(engine = mockEngine)
        val originalPref = OriginalGeckoPref(
            pref = TEST_PREF,
            branch = PrefBranch.USER,
            value = null,
        )
        handler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING

        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            onSuccess(emptyMap())
        }
        every { mockEngine.clearBrowserUserPref(any(), any(), any()) } answers {
            val onSuccess = secondArg<() -> Unit>()
            onSuccess()
        }

        handler.setGeckoPrefsOriginalValues(listOf(originalPref))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockEngine.clearBrowserUserPref(eq(TEST_PREF), any(), any()) }
    }

    @Test
    fun `WHEN getSetterPairsFromOriginalGeckoPrefs is called THEN the correct list is formed`() {
        val handler = makeHandler(engine = mockEngine)
        handler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING
        val otherPref = "gecko.nimbus.other"
        val prefWithValue = OriginalGeckoPref(pref = TEST_PREF, branch = PrefBranch.USER, value = "original")
        val prefWithoutValue = OriginalGeckoPref(pref = otherPref, branch = PrefBranch.USER, value = null)
        handler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING
        handler.preferenceTypes[otherPref] = BrowserPrefType.STRING

        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            onSuccess(mapOf(TEST_PREF to true))
        }
        every { mockEngine.clearBrowserUserPref(any(), any(), any()) } answers {
            val onSuccess = secondArg<() -> Unit>()
            onSuccess()
        }

        handler.setGeckoPrefsOriginalValues(listOf(prefWithValue, prefWithoutValue))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockEngine.setBrowserPrefs(any(), any(), any()) }
        verify { mockEngine.clearBrowserUserPref(eq(otherPref), any(), any()) }
    }

    @Test
    fun `WHEN onPreferenceChange is called THEN unenrollForGeckoPref is called`() {
        val handler = makeHandler()
        handler.start()

        handler.onPreferenceChange(
            BrowserPreference<String>(pref = TEST_PREF, hasUserChangedValue = false, prefType = BrowserPrefType.STRING),
        )

        verify { mockNimbusApi.unenrollForGeckoPref(any(), eq(PrefUnenrollReason.CHANGED)) }
    }

    @Test
    fun `WHEN setGeckoPrefsState is called with prefs not in preferenceTypes THEN getBrowserPrefs is called and preferenceTypes is populated`() {
        val handler = makeHandler(engine = mockEngine)

        every { mockEngine.getBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(List<BrowserPreference<*>>) -> Unit>()
            onSuccess(listOf(BrowserPreference<String>(pref = TEST_PREF, hasUserChangedValue = false, prefType = BrowserPrefType.STRING)))
        }
        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            onSuccess(emptyMap())
        }

        val prefState = GeckoPrefState(
            geckoPref = GeckoPref(pref = TEST_PREF, branch = PrefBranch.USER),
            geckoValue = null,
            enrollmentValue = PrefEnrollmentData(
                experimentSlug = "test-experiment",
                prefValue = "test-value",
                featureId = "gecko-nimbus-validation",
                variable = "test-preference",
            ),
            isUserSet = false,
        )

        handler.setGeckoPrefsState(listOf(prefState))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockEngine.getBrowserPrefs(any(), any(), any()) }
        assertEquals(BrowserPrefType.STRING, handler.preferenceTypes[TEST_PREF])
    }
}
