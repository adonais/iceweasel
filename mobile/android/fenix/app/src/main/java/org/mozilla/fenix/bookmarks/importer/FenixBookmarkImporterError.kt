/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.bookmarks.importer

import mozilla.components.concept.bookmark.parser.BookmarksParserError
import mozilla.components.concept.bookmarks.file.BookmarksImporterError

/**
 * Represents errors that can occur during the import process.
 */
enum class FenixBookmarkImporterError(val code: Int) {
    /**
     * Error reading the file
     *
     * Maps to [mozilla.components.concept.bookmarks.file.BookmarksImporterError.FileReadError]
     */
    FILE_READ_ERROR(code = 1001),

    /**
     * An unsupported content type while parsing.
     *
     * Maps to [mozilla.components.concept.bookmarks.file.BookmarksImporterError.FileParseError]
     * whose cause is [mozilla.components.concept.bookmark.parser.BookmarksParserError.UnsupportedContentType]
     */
    PARSE_ERROR_UNSUPPORTED_CONTENT_TYPE(2001),

    /**
     * An invalid format while parsing.
     *
     * Maps to [mozilla.components.concept.bookmarks.file.BookmarksImporterError.FileParseError]
     * whose cause is [mozilla.components.concept.bookmark.parser.BookmarksParserError.InvalidFormatError]
     */
    PARSE_ERROR_INVALID_FORMAT(2002),

    /**
     * An unknown error while parsing.
     *
     * Maps to [mozilla.components.concept.bookmarks.file.BookmarksImporterError.FileParseError]
     * whose cause is [mozilla.components.concept.bookmark.parser.BookmarksParserError.UnexpectedError]
     */
    PARSE_ERROR_UNKNOWN(2003),

    /**
     * An error saving bookmarks to storage.
     *
     * Maps to [mozilla.components.concept.bookmarks.file.BookmarksImporterError.BookmarksSaveError]
     */
    BOOKMARKS_SAVE_ERROR(3001),

    /**
     * An unknown error that doesn't fall into any other category.
     */
    UNKNOWN_ERROR(4001),
}

internal fun BookmarksImporterError?.toFenixError(): FenixBookmarkImporterError? {
    return when (this) {
        is BookmarksImporterError.BookmarksSaveError -> FenixBookmarkImporterError.BOOKMARKS_SAVE_ERROR
        is BookmarksImporterError.FileParseError -> this.mapParserError()
        is BookmarksImporterError.FileReadError -> FenixBookmarkImporterError.FILE_READ_ERROR
        is BookmarksImporterError.UnknownImporterError -> FenixBookmarkImporterError.UNKNOWN_ERROR
        else -> null
    }
}

private fun BookmarksImporterError.FileParseError.mapParserError(): FenixBookmarkImporterError {
    val parserError = cause as? BookmarksParserError ?: return FenixBookmarkImporterError.PARSE_ERROR_UNKNOWN
    return when (parserError) {
        is BookmarksParserError.UnsupportedContentType ->
            FenixBookmarkImporterError.PARSE_ERROR_UNSUPPORTED_CONTENT_TYPE

        is BookmarksParserError.InvalidFormatError -> FenixBookmarkImporterError.PARSE_ERROR_INVALID_FORMAT
        is BookmarksParserError.UnexpectedError -> FenixBookmarkImporterError.PARSE_ERROR_UNKNOWN
    }
}
