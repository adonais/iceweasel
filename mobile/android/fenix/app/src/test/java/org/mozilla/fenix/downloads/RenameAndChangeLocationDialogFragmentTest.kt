/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.downloads

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import androidx.fragment.app.FragmentActivity
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowToast

@RunWith(RobolectricTestRunner::class)
class RenameAndChangeLocationDialogFragmentTest {
    private lateinit var fragment: RenameAndChangeLocationDialogFragment

    @Before
    fun setUp() {
        fragment =
            RenameAndChangeLocationDialogFragment.newInstance(
                fileName = "file.pdf",
                directoryPath = "/path",
                contentSize = 0L,
            )

        val activity = Robolectric.buildActivity(FragmentActivity::class.java).create().get()
        activity.supportFragmentManager
            .beginTransaction()
            .add(fragment, "RenameAndChangeLocationDialogFragmentTest")
            .commitNow()
    }

    @Test
    fun `GIVEN no activity can handle the folder picker WHEN launching the directory picker THEN a toast is shown and no exception propagates`() {
        fragment.directoryLauncher = mockk { every { launch(any()) } throws ActivityNotFoundException() }

        fragment.launchDirectoryPicker()

        assertEquals(
            testContext.getString(R.string.preferences_downloads_no_folder_picker_available),
            ShadowToast.getTextOfLatestToast(),
        )
    }

    @Test
    fun `GIVEN an activity can handle the folder picker WHEN launching the directory picker THEN the picker is launched and no toast is shown`() {
        val launcher: ActivityResultLauncher<Uri?> = mockk(relaxed = true)
        fragment.directoryLauncher = launcher

        fragment.launchDirectoryPicker()

        verify { launcher.launch(null) }
        assertNull(ShadowToast.getTextOfLatestToast())
    }
}
