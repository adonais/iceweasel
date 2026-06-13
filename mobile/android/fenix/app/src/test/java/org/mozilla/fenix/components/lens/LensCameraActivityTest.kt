/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.lens

import android.Manifest
import android.app.Activity
import android.app.Application
import androidx.test.core.app.ApplicationProvider
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows
import org.robolectric.shadows.ShadowToast
import java.io.File
import kotlin.test.assertIs
import kotlin.test.assertNotNull

@RunWith(RobolectricTestRunner::class)
class LensCameraActivityTest {

    @Test
    fun `GIVEN a context WHEN newIntent is called THEN the returned intent targets LensCameraActivity`() {
        val intent = LensCameraActivity.newIntent(testContext)
        assertEquals(
            LensCameraActivity::class.java.name,
            intent.component?.className,
        )
    }

    @Test
    fun `GIVEN cached lens images exist WHEN clearLensImageCache is called THEN cached files are deleted and the directory remains`() {
        val activity = Robolectric.buildActivity(LensCameraActivity::class.java).get()
        val imageDir = File(activity.cacheDir, "lens_images")
        imageDir.mkdirs()
        val testFile = File(imageDir, "test_image.jpg")
        testFile.writeText("test")
        assertTrue(testFile.exists())

        activity.clearLensImageCache()

        assertFalse(testFile.exists())
        assertTrue(imageDir.exists())
    }

    @Test
    fun `GIVEN the lens image cache directory does not exist WHEN clearLensImageCache is called THEN no exception is thrown`() {
        val activity = Robolectric.buildActivity(LensCameraActivity::class.java).get()
        val imageDir = File(activity.cacheDir, "lens_images")
        assertFalse(imageDir.exists())

        activity.clearLensImageCache()
    }

    @Test
    fun `WHEN handlePermissionResult is called with false THEN a permission-denied Toast is shown, RESULT_CANCELED is set, and the activity finishes`() {
        val activity = Robolectric.buildActivity(LensCameraActivity::class.java).create().get()

        activity.handlePermissionResult(isGranted = false)

        assertEquals("Permission denied", ShadowToast.getTextOfLatestToast())
        assertEquals(Activity.RESULT_CANCELED, Shadows.shadowOf(activity).resultCode)
        assertTrue(activity.isFinishing)
    }

    @Test
    fun `WHEN handlePermissionResult is called with true THEN a LensCameraFragment is added to the container`() {
        val activity = Robolectric.buildActivity(LensCameraActivity::class.java).create().get()

        activity.handlePermissionResult(isGranted = true)
        activity.supportFragmentManager.executePendingTransactions()

        val fragment = activity.supportFragmentManager
            .findFragmentById(R.id.lens_fragment_container_view)
        assertNotNull(fragment)
        assertIs<LensCameraFragment>(fragment)
    }

    @Test
    fun `GIVEN a LensCameraFragment is already in the container WHEN handlePermissionResult is called with true THEN no duplicate fragment is added`() {
        val activity = Robolectric.buildActivity(LensCameraActivity::class.java).create().get()
        activity.handlePermissionResult(isGranted = true)
        activity.supportFragmentManager.executePendingTransactions()
        val firstFragment = activity.supportFragmentManager
            .findFragmentById(R.id.lens_fragment_container_view)

        activity.handlePermissionResult(isGranted = true)
        activity.supportFragmentManager.executePendingTransactions()

        val fragments = activity.supportFragmentManager.fragments
        assertEquals(1, fragments.size)
        assertSame(firstFragment, fragments[0])
    }

    @Test
    fun `GIVEN camera permission is granted WHEN the activity reaches onResume THEN a LensCameraFragment is added`() {
        val shadowApp = Shadows.shadowOf(ApplicationProvider.getApplicationContext<Application>())
        shadowApp.grantPermissions(Manifest.permission.CAMERA)

        val controller = Robolectric.buildActivity(LensCameraActivity::class.java).setup()
        val activity = controller.get()
        activity.supportFragmentManager.executePendingTransactions()

        val fragment = activity.supportFragmentManager
            .findFragmentById(R.id.lens_fragment_container_view)
        assertNotNull(fragment)
        assertIs<LensCameraFragment>(fragment)
    }
}
