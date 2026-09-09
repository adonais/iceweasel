/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.locale.screen

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mockito.Mockito.spy
import org.mockito.Mockito.`when`

class LocaleDescriptorTest {

    private lateinit var localeDescriptor: LocaleDescriptor

    @Test
    fun `setupLocaleDescriptor with empty display name`() {
        localeDescriptor = spy(LocaleDescriptor("en"))
        val locale = Locale.forLanguageTag("en")
        `when`(localeDescriptor.getDisplayName(locale)).thenReturn("")
        assertEquals("English", localeDescriptor.getNativeName())
    }

    @Test
    fun `setupLocaleDescriptor with null display name`() {
        localeDescriptor = spy(LocaleDescriptor("en-US"))
        val locale = Locale.forLanguageTag("en")
        `when`(localeDescriptor.getDisplayName(locale)).thenReturn(null)
        assertEquals("English (United States)", localeDescriptor.getNativeName())
    }

    @Test
    fun `setupLocaleDescriptor with left to right first character`() {
        localeDescriptor = LocaleDescriptor("fr")
        assertEquals("Français", localeDescriptor.getNativeName())
    }

    @Test
    fun `setupLocaleDescriptor with left to right uppercase first character`() {
        localeDescriptor = LocaleDescriptor("de")
        assertEquals("Deutsch", localeDescriptor.getNativeName())
    }

    @Test
    fun `setupLocaleDescriptor with non left to right first character`() {
        localeDescriptor = LocaleDescriptor("ar")
        assertEquals("العربية", localeDescriptor.getNativeName())
    }
}
