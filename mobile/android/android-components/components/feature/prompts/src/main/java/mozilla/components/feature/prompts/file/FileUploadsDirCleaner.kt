/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.prompts.file

import androidx.annotation.VisibleForTesting
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers.IO
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.components.concept.engine.prompt.PromptRequest.File.Companion.DEFAULT_UPLOADS_DIR_NAME
import mozilla.components.support.base.log.logger.Logger

/**
 * A storage implementation for organizing temporal uploads metadata to be clean up. *
 *
 * @param scope The [CoroutineScope] used for launching cleanup operations. Callers should pass an application-scoped
 *   scope so cleanup is not cancelled when the UI component is destroyed. The application-lifetime scope is appropriate
 *   here since cleanup tasks should outlive individual Activities.
 * @param ioDispatcher The dispatcher used for I/O operations.
 * @param cacheDirectory Provider for the cache directory used to store temporary uploads.
 */
class FileUploadsDirCleaner(
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher = IO,
    private val cacheDirectory: () -> File,
) {
    private val logger = Logger("FileUploadsDirCleaner")

    private val cacheDir by lazy { cacheDirectory() }

    @VisibleForTesting internal var fileNamesToBeDeleted: List<String> = emptyList()

    /** Enqueue the [fileName] for future clean up. */
    internal fun enqueueForCleanup(fileName: String) {
        fileNamesToBeDeleted += (fileName)
        logger.info("File $fileName added to the upload cleaning queue.")
    }

    /** Remove all the temporary file uploads. */
    internal fun cleanRecentUploads() {
        // Don't do anything if we don't have any files to delete.
        if (fileNamesToBeDeleted.isEmpty()) {
            return
        }
        performCleanRecentUploads()
    }

    @VisibleForTesting
    internal fun performCleanRecentUploads() {
        scope.launch(ioDispatcher) {
            val cacheUploadDirectory = File(getCacheDir(), DEFAULT_UPLOADS_DIR_NAME)
            fileNamesToBeDeleted = fileNamesToBeDeleted.filter { fileName ->
                try {
                    File(cacheUploadDirectory, fileName).delete()
                    logger.info("Temporal file $fileName deleted")
                    false
                } catch (e: IOException) {
                    logger.error("Unable to delete the temporal file $fileName", e)
                    true
                }
            }
        }
    }

    /** Remove the file uploads directory if exists. */
    suspend fun cleanUploadsDirectory() {
        withContext(ioDispatcher) {
            val cacheUploadDirectory = File(getCacheDir(), DEFAULT_UPLOADS_DIR_NAME)
            if (cacheUploadDirectory.exists()) {
                // To not collide with users uploading while, we are cleaning
                // previous files, lets rename the directory.
                val cacheUploadDirectoryToDelete = File(getCacheDir(), "/uploads_to_be_deleted")

                cacheUploadDirectory.renameTo(cacheUploadDirectoryToDelete)
                cacheUploadDirectoryToDelete.deleteRecursively()
                logger.info("Removed the temporal files under /uploads")
            }
        }
    }

    private suspend fun getCacheDir(): File =
        withContext(ioDispatcher) {
            cacheDir
        }
}
