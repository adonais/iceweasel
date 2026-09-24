/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.pocket.recommendations.utils

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ContentRecommendationsImageUrlTest {

    @Test
    fun `WHEN an image URL is reformatted THEN the encoded URL is appended to the image resizing URL`() {
        assertEquals(
            IMAGE_URL + "https%3A%2F%2Ftest.com%2Fimage1.jpg",
            reformatImageUrl("https://test.com/image1.jpg"),
        )
    }

    @Test
    fun `GIVEN an empty image URL WHEN an image URL is reformatted THEN the image resizing URL is returned`() {
        assertEquals(IMAGE_URL, reformatImageUrl(""))
    }
}
