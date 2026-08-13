/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.concept.bookmarks.file

/**
 * Types of errors that could happen during bookmarks file import.
 */
sealed class BookmarksImporterError(
    override val cause: Throwable?,
) : RuntimeException() {

    /**
     * An error occurred while reading the file.
     */
    class FileReadError(override val cause: Throwable?) : BookmarksImporterError(cause = cause)

    /**
     * An error occurred while parsing the bookmarks file.
     */
    class FileParseError(
        override val cause: Throwable?,
    ) : BookmarksImporterError(cause)

    /**
     * An error occurred while saving the imported bookmarks.
     */
    class BookmarksSaveError(
        override val cause: Throwable?,
    ) : BookmarksImporterError(cause)

    /**
     * An unknown error happened while importing the bookmarks
     */
    class UnknownImporterError(
        override val cause: Throwable?,
    ) : BookmarksImporterError(cause)
}
