/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks.importer

import mozilla.components.concept.bookmark.parser.BookmarksParserError
import mozilla.components.concept.bookmarks.file.BookmarksImporterError
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class FenixBookmarkImporterErrorTest {

    @Test
    fun `GIVEN a null error WHEN mapping to a FenixImporterError THEN the result is null`() {
        val error: BookmarksImporterError? = null

        assertNull(error.toFenixError())
    }

    @Test
    fun `GIVEN a FileReadError WHEN mapping to a FenixImporterError THEN it maps to FILE_READ_ERROR`() {
        val error = BookmarksImporterError.FileReadError(cause = Throwable("cannot read"))

        assertEquals(FenixBookmarkImporterError.FILE_READ_ERROR, error.toFenixError())
    }

    @Test
    fun `GIVEN a BookmarksSaveError WHEN mapping to a FenixImporterError THEN it maps to BOOKMARKS_SAVE_ERROR`() {
        val error = BookmarksImporterError.BookmarksSaveError(cause = Throwable("cannot save"))

        assertEquals(FenixBookmarkImporterError.BOOKMARKS_SAVE_ERROR, error.toFenixError())
    }

    @Test
    fun `GIVEN an UnknownImporterError WHEN mapping to a FenixImporterError THEN it maps to UNKNOWN_ERROR`() {
        val error = BookmarksImporterError.UnknownImporterError(cause = Throwable("unexpected error"))

        assertEquals(FenixBookmarkImporterError.UNKNOWN_ERROR, error.toFenixError())
    }

    @Test
    fun `GIVEN a FileParseError caused by UnsupportedContentType THEN it maps to PARSE_ERROR_UNSUPPORTED_CONTENT_TYPE`() {
        val error = BookmarksImporterError.FileParseError(cause = BookmarksParserError.UnsupportedContentType())

        assertEquals(FenixBookmarkImporterError.PARSE_ERROR_UNSUPPORTED_CONTENT_TYPE, error.toFenixError())
    }

    @Test
    fun `GIVEN a FileParseError caused by InvalidFormatError THEN it maps to PARSE_ERROR_INVALID_FORMAT`() {
        val error = BookmarksImporterError.FileParseError(
            cause = BookmarksParserError.InvalidFormatError(message = "missing link"),
        )

        assertEquals(FenixBookmarkImporterError.PARSE_ERROR_INVALID_FORMAT, error.toFenixError())
    }

    @Test
    fun `GIVEN a FileParseError caused by UnexpectedError THEN it maps to PARSE_ERROR_UNKNOWN`() {
        val error = BookmarksImporterError.FileParseError(
            cause = BookmarksParserError.UnexpectedError(message = "io error", cause = null),
        )

        assertEquals(FenixBookmarkImporterError.PARSE_ERROR_UNKNOWN, error.toFenixError())
    }

    @Test
    fun `GIVEN a FileParseError without a parser error cause THEN it maps to PARSE_ERROR_UNKNOWN`() {
        val error = BookmarksImporterError.FileParseError(cause = Throwable("not a parser error"))

        assertEquals(FenixBookmarkImporterError.PARSE_ERROR_UNKNOWN, error.toFenixError())
    }
}
