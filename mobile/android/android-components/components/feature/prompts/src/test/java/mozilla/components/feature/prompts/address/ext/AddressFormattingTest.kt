/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.prompts.address.ext

import mozilla.components.concept.storage.Address
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AddressFormattingTest {

    private fun address(
        name: String = "",
        organization: String = "",
        streetAddress: String = "",
        addressLevel3: String = "",
        addressLevel2: String = "",
        addressLevel1: String = "",
        postalCode: String = "",
        country: String = "",
        tel: String = "",
        email: String = "",
    ) = Address(
        guid = "guid",
        name = name,
        organization = organization,
        streetAddress = streetAddress,
        addressLevel3 = addressLevel3,
        addressLevel2 = addressLevel2,
        addressLevel1 = addressLevel1,
        postalCode = postalCode,
        country = country,
        tel = tel,
        email = email,
    )

    @Test
    fun `WHEN every field is populated THEN all lines are returned in display order`() {
        val lines = address(
            name = "John Doe",
            organization = "Mozilla",
            streetAddress = "999 Test Street",
            addressLevel2 = "Mountain View",
            addressLevel1 = "CA",
            postalCode = "94016",
            country = "US",
            tel = "+15551234567",
            email = "john@example.com",
        ).toDisplayLines()

        assertEquals(
            listOf(
                "John Doe",
                "Mozilla",
                "999 Test Street",
                "Mountain View CA 94016",
                "US",
                "+15551234567",
                "john@example.com",
            ),
            lines,
        )
    }

    @Test
    fun `WHEN city region and postal are present THEN they are joined on a single line`() {
        val lines = address(
            addressLevel2 = "Mountain View",
            addressLevel1 = "CA",
            postalCode = "94016",
        ).toDisplayLines()

        assertEquals(listOf("Mountain View CA 94016"), lines)
    }

    @Test
    fun `WHEN some city region postal fields are blank THEN only the present ones are joined`() {
        val lines = address(
            addressLevel2 = "Mountain View",
            postalCode = "94016",
        ).toDisplayLines()

        assertEquals(listOf("Mountain View 94016"), lines)
    }

    @Test
    fun `WHEN a field is blank THEN it is skipped`() {
        val lines = address(
            name = "John Doe",
            organization = "   ",
            streetAddress = "999 Test Street",
            country = "US",
        ).toDisplayLines()

        assertEquals(
            listOf(
                "John Doe",
                "999 Test Street",
                "US",
            ),
            lines,
        )
    }

    @Test
    fun `WHEN all fields are blank THEN an empty list is returned`() {
        assertTrue(address().toDisplayLines().isEmpty())
    }
}
