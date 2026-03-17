/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.experiments.prefhandling

import android.os.Looper
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import io.mockk.mockk
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
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.experiments.nimbus.internal.GeckoPref
import org.mozilla.experiments.nimbus.internal.GeckoPrefState
import org.mozilla.experiments.nimbus.internal.OriginalGeckoPref
import org.mozilla.experiments.nimbus.internal.PrefBranch
import org.mozilla.experiments.nimbus.internal.PrefEnrollmentData
import org.mozilla.experiments.nimbus.internal.PrefUnenrollReason
import org.robolectric.Shadows.shadowOf

const val TEST_PREF = "gecko.nimbus.test"

@OptIn(ExperimentalAndroidComponentsApi::class)
@RunWith(AndroidJUnit4::class)
class NimbusGeckoPrefHandlerTest {

    @Test
    fun `test nimbusGeckoPreferences has appropriate values`() {
        Assert.assertNotNull(NimbusGeckoPrefHandler.nimbusGeckoPreferences["gecko-nimbus-validation"])
        Assert.assertNotNull(
            NimbusGeckoPrefHandler.nimbusGeckoPreferences["gecko-nimbus-validation"]?.get(
                "test-preference",
            ),
        )
    }

    @Test
    fun `preferenceList has appropriate values`() {
        Assert.assertTrue(NimbusGeckoPrefHandler.preferenceList.contains(TEST_PREF))
    }

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
        val mockEngine = mockk<Engine>().apply {
            every { getBrowserPrefs(any(), any(), any()) } answers {
                val onSuccess = secondArg<(List<BrowserPreference<*>>) -> Unit>()
                onSuccess(mockPrefResult)
            }
        }
        NimbusGeckoPrefHandler.engine = mockEngine
        assertEquals(null, NimbusGeckoPrefHandler.getPreferenceState(TEST_PREF)?.geckoValue)

        val result = NimbusGeckoPrefHandler.getPreferenceStateFromGecko()
        shadowOf(Looper.getMainLooper()).idle()
        verify { mockEngine.getBrowserPrefs(any(), any(), any()) }
        assertTrue(runBlocking { result.await() })

        assertEquals(mockPrefResult[0].defaultValue, NimbusGeckoPrefHandler.getPreferenceState(TEST_PREF)?.geckoValue)
        assertEquals(mockPrefResult[0].prefType, NimbusGeckoPrefHandler.preferenceTypes[TEST_PREF])
    }

    @Test
    fun `WHEN getPreferenceStateFromGecko is fails THEN getBrowserPrefs is called AND it returns false`() {
        val mockEngine = mockk<Engine>()
        NimbusGeckoPrefHandler.engine = mockEngine
        every { mockEngine.getBrowserPrefs(any(), any(), any()) } answers {
            val onError = thirdArg<(Throwable) -> Unit>()
            onError(Throwable("error"))
        }

        val result = NimbusGeckoPrefHandler.getPreferenceStateFromGecko()
        shadowOf(Looper.getMainLooper()).idle()

        Assert.assertFalse(runBlocking { result.await() })
        verify { mockEngine.getBrowserPrefs(any(), any(), any()) }
        assertEquals(null, NimbusGeckoPrefHandler.getPreferenceState(TEST_PREF)?.geckoValue)
    }

    @Test
    fun `WHEN setGeckoPrefsState is successful THEN setBrowserPrefs is called`() {
        val mockEngine = mockk<Engine>()
        val mockNimbusApi = mockk<NimbusApi>(relaxed = true)
        NimbusGeckoPrefHandler.engine = mockEngine
        NimbusGeckoPrefHandler.nimbusApi = mockNimbusApi
        NimbusGeckoPrefHandler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING
        NimbusGeckoPrefHandler.enrollmentErrors.clear()

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

        NimbusGeckoPrefHandler.setGeckoPrefsState(listOf(prefState))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockEngine.setBrowserPrefs(any(), any(), any()) }
    }

    @Test
    fun `WHEN setGeckoPrefsState fails THEN the item is in errorsList`() {
        val mockEngine = mockk<Engine>()
        val mockNimbusApi = mockk<NimbusApi>(relaxed = true)
        NimbusGeckoPrefHandler.engine = mockEngine
        NimbusGeckoPrefHandler.nimbusApi = mockNimbusApi
        NimbusGeckoPrefHandler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING
        NimbusGeckoPrefHandler.enrollmentErrors.clear()

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

        NimbusGeckoPrefHandler.setGeckoPrefsState(listOf(prefState))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockNimbusApi.unenrollForGeckoPref(any(), eq(PrefUnenrollReason.FAILED_TO_SET)) }
        assertEquals(1, NimbusGeckoPrefHandler.enrollmentErrors.size)
        assertEquals(TEST_PREF, NimbusGeckoPrefHandler.enrollmentErrors.first().first.prefString())
    }

    @Test
    fun `WHEN setGeckoPrefsState cannot make a setter THEN the item is in errorsList`() {
        val mockEngine = mockk<Engine>()
        val mockNimbusApi = mockk<NimbusApi>(relaxed = true)
        NimbusGeckoPrefHandler.engine = mockEngine
        NimbusGeckoPrefHandler.nimbusApi = mockNimbusApi
        NimbusGeckoPrefHandler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING
        NimbusGeckoPrefHandler.enrollmentErrors.clear()
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

        NimbusGeckoPrefHandler.setGeckoPrefsState(listOf(prefState))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockNimbusApi.unenrollForGeckoPref(any(), eq(PrefUnenrollReason.FAILED_TO_SET)) }
        assertEquals(1, NimbusGeckoPrefHandler.enrollmentErrors.size)
        assertEquals(TEST_PREF, NimbusGeckoPrefHandler.enrollmentErrors.first().first.prefString())
        val error = NimbusGeckoPrefHandler.enrollmentErrors.first().second
        assertTrue(error is IllegalStateException)
        assertEquals("Failed to make a setter!", error?.message)
    }

    @Test
    fun `WHEN setGeckoPrefsOriginalValues is successful on a known value THEN setBrowserPrefs is called`() {
        val mockEngine = mockk<Engine>()
        NimbusGeckoPrefHandler.engine = mockEngine
        NimbusGeckoPrefHandler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING
        val originalPref = OriginalGeckoPref(
            pref = TEST_PREF,
            branch = PrefBranch.USER,
            value = "original-value",
        )
        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            onSuccess(mapOf(TEST_PREF to true))
        }

        NimbusGeckoPrefHandler.setGeckoPrefsOriginalValues(listOf(originalPref))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockEngine.setBrowserPrefs(any(), any(), any()) }
    }

    @Test
    fun `WHEN setGeckoPrefsOriginalValues is successful on an unknown value THEN clearBrowserUserPref is called`() {
        val mockEngine = mockk<Engine>()
        NimbusGeckoPrefHandler.engine = mockEngine
        val originalPref = OriginalGeckoPref(
            pref = TEST_PREF,
            branch = PrefBranch.USER,
            value = null,
        )
        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            onSuccess(emptyMap())
        }
        every { mockEngine.clearBrowserUserPref(any(), any(), any()) } answers {
            val onSuccess = secondArg<() -> Unit>()
            onSuccess()
        }

        NimbusGeckoPrefHandler.setGeckoPrefsOriginalValues(listOf(originalPref))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockEngine.clearBrowserUserPref(eq(TEST_PREF), any(), any()) }
    }

    @Test
    fun `WHEN getSetterPairsFromOriginalGeckoPrefs is called THEN the correct list is formed`() {
        val mockEngine = mockk<Engine>()
        NimbusGeckoPrefHandler.engine = mockEngine
        NimbusGeckoPrefHandler.preferenceTypes[TEST_PREF] = BrowserPrefType.STRING
        val otherPref = "gecko.nimbus.other"
        val prefWithValue = OriginalGeckoPref(pref = TEST_PREF, branch = PrefBranch.USER, value = "original")
        val prefWithoutValue = OriginalGeckoPref(pref = otherPref, branch = PrefBranch.USER, value = null)

        every { mockEngine.setBrowserPrefs(any(), any(), any()) } answers {
            val onSuccess = secondArg<(Map<String, Boolean>) -> Unit>()
            onSuccess(mapOf(TEST_PREF to true))
        }
        every { mockEngine.clearBrowserUserPref(any(), any(), any()) } answers {
            val onSuccess = secondArg<() -> Unit>()
            onSuccess()
        }

        NimbusGeckoPrefHandler.setGeckoPrefsOriginalValues(listOf(prefWithValue, prefWithoutValue))
        shadowOf(Looper.getMainLooper()).idle()

        verify { mockEngine.setBrowserPrefs(any(), any(), any()) }
        verify { mockEngine.clearBrowserUserPref(eq(otherPref), any(), any()) }
    }

    @Test
    fun `WHEN onPreferenceChange is called THEN unenrollForGeckoPref is called`() {
        val mockNimbusApi = mockk<NimbusApi>(relaxed = true)
        NimbusGeckoPrefHandler.nimbusApi = mockNimbusApi

        NimbusGeckoPrefHandler.onPreferenceChange(
            BrowserPreference<String>(pref = TEST_PREF, hasUserChangedValue = false, prefType = BrowserPrefType.STRING),
        )

        verify { mockNimbusApi.unenrollForGeckoPref(any(), eq(PrefUnenrollReason.CHANGED)) }
    }
}
