/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class DefaultAppIconRepositoryTest {
    private lateinit var settings: Settings

    @Before
    fun setup() {
       settings = Settings(testContext)
       every { testContext.settings() } returns settings
    }

    @Test
    fun `WHEN the selected app icon value changes in the repository THEN the shared preference updates as well`() {
        val repository = DefaultAppIconRepository(testContext.settings())
        val defaultIcon = AppIcon.AppDefault
        val newAppIcon = AppIcon.AppCute

        assertEquals(defaultIcon.aliasSuffix, settings.selectedAppIcon)
        repository.selectedAppIcon = newAppIcon

        assertEquals(newAppIcon.aliasSuffix, settings.selectedAppIcon)
    }

    @Test
    fun `WHEN a new value has been assigned THEN the repository returns the new value`() {
        val repository = DefaultAppIconRepository(testContext.settings())
        val defaultIcon = AppIcon.AppDefault
        val newAppIcon = AppIcon.AppCute

        assertEquals(defaultIcon, repository.selectedAppIcon)

        repository.selectedAppIcon = newAppIcon

        assertEquals(newAppIcon, repository.selectedAppIcon)
    }
}
