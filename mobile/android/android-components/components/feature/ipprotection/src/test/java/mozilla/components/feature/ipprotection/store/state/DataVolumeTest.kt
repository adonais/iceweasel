/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection.store.state

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tests for the [DataVolume] type */
class DataVolumeTest {

    @Test
    fun `GIVEN finite data volume values WHEN they are added THEN their bytes are summed`() {
        assertEquals(DataVolume(30), DataVolume(10) + DataVolume(20))
    }

    @Test
    fun `GIVEN finite data volume values WHEN their sum reaches the unlimited value THEN the result is capped`() {
        // ensures that the only allowed unlimited values are values that are intentionally declared
        // unlimited
        assertEquals(DataVolume(Long.MAX_VALUE - 1), DataVolume(Long.MAX_VALUE - 1) + DataVolume(1))
    }

    @Test
    fun `GIVEN finite data volume values WHEN their sum exceeds the unlimited value THEN the result is capped`() {
        assertEquals(DataVolume(Long.MAX_VALUE - 1), DataVolume(Long.MAX_VALUE - 1) + DataVolume(2))
    }

    @Test
    fun `GIVEN an unlimited data volume value WHEN values are added THEN the result is unlimited`() {
        assertEquals(DataVolume.Unlimited, DataVolume.Unlimited + DataVolume(10))
        assertEquals(DataVolume.Unlimited, DataVolume(10) + DataVolume.Unlimited)
    }

    @Test
    fun `GIVEN finite data volume values WHEN they are subtracted THEN their bytes are subtracted`() {
        assertEquals(DataVolume(10), DataVolume(30) - DataVolume(20))
    }

    @Test
    fun `GIVEN finite data volume values WHEN subtraction would be negative THEN the result is zero`() {
        assertEquals(DataVolume.Zero, DataVolume(10) - DataVolume(20))
    }

    @Test
    fun `GIVEN finite data volume WHEN an unlimited data volume is subtracted THEN the result is zero`() {
        assertEquals(DataVolume.Zero, DataVolume(10) - DataVolume.Unlimited)
    }

    @Test
    fun `GIVEN an unlimited data volume value WHEN finite data volume is subtracted THEN the result is unlimited`() {
        assertEquals(DataVolume.Unlimited, DataVolume.Unlimited - DataVolume(10))
    }

    @Test
    fun `GIVEN data volume values WHEN isUnlimited is queried THEN only Unlimited returns true`() {
        assertTrue(DataVolume.Unlimited.isUnlimited)
        assertFalse(DataVolume(Long.MAX_VALUE - 1).isUnlimited)
    }

    @Test
    fun `GIVEN Long MAX_VALUE WHEN converted to a data volume THEN it is capped at the largest finite value`() {
        assertEquals(DataVolume(Long.MAX_VALUE - 1), Long.MAX_VALUE.asDataVolume())
    }

    @Test
    fun `GIVEN finite data volume values WHEN they are divided THEN their ratio is returned`() {
        assertEquals(0.5f, DataVolume(10) / DataVolume(20), 0f)
    }

    @Test
    fun `GIVEN zero data volume WHEN data volume is divided THEN the result is zero`() {
        assertEquals(0f, DataVolume(10) / DataVolume.Zero, 0f)
    }

    @Test
    fun `GIVEN two unlimited data volume values WHEN they are divided THEN the result is one`() {
        assertEquals(1f, DataVolume.Unlimited / DataVolume.Unlimited, 0f)
    }

    @Test
    fun `GIVEN an unlimited dividend and finite divisor WHEN they are divided THEN the result is one`() {
        assertEquals(1f, DataVolume.Unlimited / DataVolume(10), 0f)
    }

    @Test
    fun `GIVEN a finite dividend and unlimited divisor WHEN they are divided THEN the result is zero`() {
        assertEquals(0f, DataVolume(10) / DataVolume.Unlimited, 0f)
    }
}
