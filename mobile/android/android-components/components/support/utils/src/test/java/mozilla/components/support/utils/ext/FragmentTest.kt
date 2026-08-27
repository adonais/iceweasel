/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.utils.ext

import androidx.fragment.app.Fragment
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.doReturn

@RunWith(AndroidJUnit4::class)
class FragmentTest {
    val fragment: Fragment = mock()

    @Test
    fun `pixelSizeFor returns the same as getDimensionPixelSize`() {
        doReturn(testContext.resources).`when`(fragment).resources

        assertEquals(
            testContext.resources.getDimensionPixelSize(android.R.dimen.app_icon_size),
            fragment.pixelSizeFor(android.R.dimen.app_icon_size),
        )
    }
}
