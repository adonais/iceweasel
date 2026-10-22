/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.lens

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R

@RunWith(AndroidJUnit4::class)
class LensUploadLoadingScreenTest {

    @get:Rule val composeTestRule = createComposeRule()

    private val resources
        get() = ApplicationProvider.getApplicationContext<Context>().resources

    private val status
        get() = resources.getString(R.string.lens_camera_loading_status)

    private val cancel
        get() = resources.getString(R.string.lens_camera_loading_cancel_button)

    private var cancelClicked = false

    @Test
    fun `WHEN the screen is shown THEN the status is announced as a live region`() {
        setContent(preview = pickedImage(), animateIn = false)

        composeTestRule
            .onNodeWithText(status)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    @Test
    fun `WHEN the cancel button is clicked THEN onCancel is invoked`() {
        setContent(preview = pickedImage(), animateIn = false)

        composeTestRule.onNodeWithText(cancel).performClick()

        assertTrue(cancelClicked)
    }

    @Test
    fun `GIVEN the image is still decoding WHEN the fallback delay passes THEN the cancel button becomes available`() {
        composeTestRule.mainClock.autoAdvance = false
        setContent(preview = null, animateIn = true)

        composeTestRule.onNodeWithText(cancel).assertIsNotEnabled()

        composeTestRule.mainClock.advanceTimeBy(FALLBACK_WAIT_MILLIS)

        composeTestRule.onNodeWithText(cancel).assertIsEnabled()
        composeTestRule.onNodeWithText(status).assertIsDisplayed()
    }

    // Robolectric can't create an ImageBitmap directly, only wrap a platform Bitmap.
    private fun pickedImage() = Bitmap.createBitmap(30, 40, Bitmap.Config.ARGB_8888).asImageBitmap()

    private fun setContent(preview: ImageBitmap?, animateIn: Boolean) {
        composeTestRule.setContent {
            LensUploadLoadingScreen(
                preview = preview,
                backdrop = preview,
                animateIn = animateIn,
                onCancel = { cancelClicked = true },
            )
        }
    }

    private companion object {
        const val FALLBACK_WAIT_MILLIS = 500L
    }
}
