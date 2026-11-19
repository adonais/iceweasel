/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection.store.state

import org.junit.Assert.assertEquals
import org.junit.Test

class UsageQuotaTest {
    @Test
    fun `GIVEN a finite data volume WHEN gigabytes is queried THEN the converted value is returned`() {
        assertEquals(2f, DataVolume(2L * BYTES_PER_GB.toLong()).gigabytes)
    }

    @Test
    fun `GIVEN an unlimited data volume WHEN gigabytes is queried THEN infinity is returned`() {
        assertEquals(Float.POSITIVE_INFINITY, DataVolume.Unlimited.gigabytes)
    }

    @Test
    fun `GIVEN a finite metered quota WHEN used is queried THEN used data volume is returned`() {
        val quota = UsageQuota.Metered(resetTime = null, max = DataVolume(10), remaining = DataVolume(4))

        assertEquals(DataVolume(6), quota.used)
    }

    @Test
    fun `GIVEN an unmetered quota WHEN max and remaining are queried THEN both are unlimited`() {
        val quota = UsageQuota.Unmetered()

        assertEquals(DataVolume.Unlimited, quota.max)
        assertEquals(DataVolume.Unlimited, quota.remaining)
    }
}
