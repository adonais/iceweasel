/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding.view

import org.junit.Assert.assertEquals
import org.junit.Test

class OnboardingScreenTest {

    @Test
    fun `GIVEN an index within the pages range WHEN resumedPageIndex is called THEN it returns the saved index`() {
        assertEquals(2, resumedPageIndex(pageIndex = 2, pageCount = 4))
    }

    @Test
    fun `GIVEN an index on the first page WHEN resumedPageIndex is called THEN it returns the saved index`() {
        assertEquals(0, resumedPageIndex(pageIndex = 0, pageCount = 4))
    }

    @Test
    fun `GIVEN an index on the last page WHEN resumedPageIndex is called THEN it returns the saved index`() {
        assertEquals(3, resumedPageIndex(pageIndex = 3, pageCount = 4))
    }

    @Test
    fun `GIVEN the number of pages reduced past the index WHEN resumedPageIndex is called THEN it returns the last available page index`() {
        assertEquals(2, resumedPageIndex(pageIndex = 5, pageCount = 3))
    }

    @Test
    fun `GIVEN an index one past the last page WHEN resumedPageIndex is called THEN it returns the last available page index`() {
        assertEquals(3, resumedPageIndex(pageIndex = 4, pageCount = 4))
    }

    @Test
    fun `GIVEN a negative index WHEN resumedPageIndex is called THEN it returns the first page index`() {
        assertEquals(0, resumedPageIndex(pageIndex = -1, pageCount = 4))
    }

    @Test
    fun `GIVEN no pages to display WHEN resumedPageIndex is called THEN it returns the first page index`() {
        assertEquals(0, resumedPageIndex(pageIndex = 3, pageCount = 0))
    }
}
