/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs.nimbus

import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.experiments.nimbus.internal.FirefoxLabsMetadata
import org.mozilla.fenix.R
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FirefoxLabsMetadataTest {

    private fun firefoxLabsMetadata(
        slug: String,
        titleStringId: String,
        descriptionStringId: String,
        enrolled: Boolean = false,
        requiresRestart: Boolean = false,
        feedbackUrl: String? = null,
    ) = FirefoxLabsMetadata(
        slug = slug,
        titleStringId = titleStringId,
        descriptionStringId = descriptionStringId,
        feedbackUrl = feedbackUrl,
        enrolled = enrolled,
        requiresRestart = requiresRestart,
    )

    private companion object {
        // Backed by static_strings.xml entries shared with the Nimbus read-path fixture.
        const val RESOURCE_NAME_TITLE = "firefox_labs_test_lab_title"
        const val RESOURCE_NAME_DESCRIPTION = "firefox_labs_test_lab_description"
    }

    @Test
    fun `WHEN both resource names resolve THEN a LabsItem is returned with the resolved strings`() {
        val metadata = firefoxLabsMetadata(
            slug = "lab-1",
            titleStringId = RESOURCE_NAME_TITLE,
            descriptionStringId = RESOURCE_NAME_DESCRIPTION,
            enrolled = true,
            requiresRestart = false,
            feedbackUrl = "https://connect.mozilla.org/",
        )

        val item = metadata.toLabsItem(context = testContext)

        assertEquals("lab-1", item?.slug)
        assertEquals(testContext.getString(R.string.firefox_labs_test_lab_title), item?.title)
        assertEquals(testContext.getString(R.string.firefox_labs_test_lab_description), item?.description)
        assertEquals(true, item?.enrolled)
        assertEquals(false, item?.requiresRestart)
        assertEquals("https://connect.mozilla.org/", item?.feedbackUrl)
    }

    @Test
    fun `WHEN a Nimbus lab has an unknown resource name AND raw fallback is allowed THEN the raw name is surfaced`() {
        val metadata = firefoxLabsMetadata(
            slug = "broken-lab",
            titleStringId = "this_resource_does_not_exist",
            descriptionStringId = RESOURCE_NAME_DESCRIPTION,
        )

        val item = metadata.toLabsItem(
            context = testContext,
            allowRawIdFallback = true,
        )

        assertEquals("this_resource_does_not_exist", item?.title)
        assertEquals(testContext.getString(R.string.firefox_labs_test_lab_description), item?.description)
    }

    @Test
    fun `WHEN a Nimbus lab has an unknown resource name AND raw fallback is not allowed THEN the item is dropped`() {
        val metadata = firefoxLabsMetadata(
            slug = "broken-lab",
            titleStringId = "this_resource_does_not_exist",
            descriptionStringId = RESOURCE_NAME_DESCRIPTION,
        )

        val item = metadata.toLabsItem(
            context = testContext,
            allowRawIdFallback = false,
        )

        assertNull(item)
    }
}
