/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import kotlin.test.assertEquals
import kotlin.test.assertTrue
import mozilla.components.support.test.robolectric.testContext
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PrivacyReportNotificationContentTest {

    @Test
    fun `GIVEN a single blocked tracker WHEN trackersBlocked is called THEN the title uses the singular form and the body is set`() {
        val content = PrivacyReportNotificationContent.trackersBlocked(testContext, trackersBlockedCount = 1)

        assertEquals(expectedTrackersBlockedTitle(1), content.title)
        assertEquals(expectedTrackersBlockedText(), content.text)
    }

    @Test
    fun `GIVEN several blocked trackers WHEN trackersBlocked is called THEN the title uses the plural form and the body is set`() {
        val content = PrivacyReportNotificationContent.trackersBlocked(testContext, trackersBlockedCount = 7)

        assertEquals(expectedTrackersBlockedTitle(7), content.title)
        assertEquals(expectedTrackersBlockedText(), content.text)
    }

    @Test
    fun `GIVEN no blocked tracker WHEN noTrackersBlocked is called THEN the title introduces the feature and the body is empty`() {
        val content = PrivacyReportNotificationContent.noTrackersBlocked(testContext)

        val expectedTitle =
            testContext.getString(
                R.string.notification_privacy_report_headline_no_trackers,
                testContext.getString(R.string.app_name),
            )

        assertEquals(expectedTitle, content.title)
        assertTrue(content.text.isEmpty())
    }

    private fun expectedTrackersBlockedTitle(count: Int) =
        testContext.resources.getQuantityString(
            R.plurals.trackers_blocked_panel_num_trackers_blocked_this_week_2,
            count,
            count,
        )

    private fun expectedTrackersBlockedText() =
        testContext.getString(
            R.string.notification_privacy_report_body_has_trackers,
            testContext.getString(R.string.app_name),
        )
}
