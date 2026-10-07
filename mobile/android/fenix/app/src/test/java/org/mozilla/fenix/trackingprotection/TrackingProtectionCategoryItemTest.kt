/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.trackingprotection

import android.view.View
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TrackingProtectionCategoryItemTest {

    @Test
    fun `WHEN the view is created THEN its layout is inflated into it rather than into a wrapper`() {
        val view = TrackingProtectionCategoryItem(testContext)

        assertSame(view, view.findViewById<View>(R.id.trackingProtectionCategoryTitle).parent)
    }
}
