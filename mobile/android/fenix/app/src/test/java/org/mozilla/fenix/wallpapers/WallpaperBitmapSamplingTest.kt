/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.wallpapers

import android.content.res.Configuration
import android.util.Size
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.mozilla.fenix.settings.wallpaper.WALLPAPER_THUMBNAIL_ASPECT_RATIO

/**
 * Wallpaper assets are served at one resolution for every device, so these cover that they are subsampled towards the
 * size they are actually displayed at rather than decoded as-is.
 */
@RunWith(AndroidJUnit4::class)
class WallpaperBitmapSamplingTest {

    @get:Rule val temporaryFolder = TemporaryFolder()

    private val imageBytes: ByteArray
        get() = javaClass.getResourceAsStream("/png/wallpaper.png")!!.buffered().readBytes()

    private fun writeAsset(type: Wallpaper.ImageType): File {
        val file = File(temporaryFolder.root, Wallpaper.getLocalPath(WALLPAPER_NAME, type))
        file.parentFile?.mkdirs()
        file.writeBytes(imageBytes)
        return file
    }

    @Test
    fun `WHEN the display is smaller than the wallpaper THEN it is subsampled to cover the display`() = runTest {
        writeAsset(Wallpaper.ImageType.Portrait)
        val displaySize = Size(720, 1280)
        val useCase =
            WallpapersUseCases.DefaultLoadBitmapUseCase(
                getFilesDir = { temporaryFolder.root },
                getDisplaySize = { displaySize },
            )

        val bitmap = useCase.invoke(wallpaper, Configuration.ORIENTATION_PORTRAIT)

        assertNotNull(bitmap)
        assertTrue(bitmap.width < SOURCE_WIDTH)
        assertTrue(bitmap.width >= displaySize.width)
        assertTrue(bitmap.height >= displaySize.height)
    }

    @Test
    fun `WHEN the display is as large as the wallpaper THEN it is decoded at full size`() = runTest {
        writeAsset(Wallpaper.ImageType.Portrait)
        val useCase =
            WallpapersUseCases.DefaultLoadBitmapUseCase(
                getFilesDir = { temporaryFolder.root },
                getDisplaySize = { Size(SOURCE_WIDTH, SOURCE_HEIGHT) },
            )

        val bitmap = useCase.invoke(wallpaper, Configuration.ORIENTATION_PORTRAIT)

        assertNotNull(bitmap)
        assertEquals(SOURCE_WIDTH, bitmap.width)
    }

    @Test
    fun `WHEN the display metrics are transposed against the requested orientation THEN it is still subsampled`() =
        runTest {
            writeAsset(Wallpaper.ImageType.Portrait)
            // Landscape metrics with a portrait asset happens in split screen and mid-rotation.
            val useCase =
                WallpapersUseCases.DefaultLoadBitmapUseCase(
                    getFilesDir = { temporaryFolder.root },
                    getDisplaySize = { Size(1280, 720) },
                )

            val bitmap = useCase.invoke(wallpaper, Configuration.ORIENTATION_PORTRAIT)

            assertNotNull(bitmap)
            assertTrue(bitmap.width < SOURCE_WIDTH)
            assertTrue(bitmap.width >= 720)
            assertTrue(bitmap.height >= 1280)
        }

    @Test
    fun `WHEN the wallpaper is missing THEN null is returned`() = runTest {
        val useCase =
            WallpapersUseCases.DefaultLoadBitmapUseCase(
                getFilesDir = { temporaryFolder.root },
                getDisplaySize = { Size(720, 1280) },
            )

        assertNull(useCase.invoke(wallpaper, Configuration.ORIENTATION_PORTRAIT))
    }

    @Test
    fun `WHEN a thumbnail is loaded THEN it is subsampled towards the size of its grid cell`() = runTest {
        writeAsset(Wallpaper.ImageType.Thumbnail)
        val thumbnailSize = thumbnailSize(width = 240)
        val useCase = WallpapersUseCases.DefaultLoadThumbnailUseCase(filesDir = temporaryFolder.root)

        val bitmap = useCase.invoke(wallpaper, thumbnailSize)

        assertNotNull(bitmap)
        assertTrue(bitmap.width < SOURCE_WIDTH)
        assertTrue(bitmap.width >= thumbnailSize.width)
        assertTrue(bitmap.height >= thumbnailSize.height)
    }

    @Test
    fun `WHEN a load is cancelled THEN the cancellation is not turned into a null result`() = runTest {
        val useCase =
            WallpapersUseCases.DefaultLoadBitmapUseCase(
                getFilesDir = { temporaryFolder.root },
                getDisplaySize = { throw CancellationException("cancelled while loading") },
            )

        assertFailsWith<CancellationException> {
            useCase.invoke(wallpaper, Configuration.ORIENTATION_PORTRAIT)
        }
    }

    @Test
    fun `WHEN a thumbnail is missing THEN null is returned`() = runTest {
        val useCase = WallpapersUseCases.DefaultLoadThumbnailUseCase(filesDir = temporaryFolder.root)

        assertNull(useCase.invoke(wallpaper, thumbnailSize(width = 240)))
    }

    companion object {
        // Mirrors WallpaperThumbnailItem, which sets a width and lets the shared ratio give the height.
        private fun thumbnailSize(width: Int) = Size(width, (width / WALLPAPER_THUMBNAIL_ASPECT_RATIO).toInt())

        private const val WALLPAPER_NAME = "test-wallpaper"
        private const val SOURCE_WIDTH = 1440
        private const val SOURCE_HEIGHT = 2560

        private val wallpaper =
            Wallpaper(
                name = WALLPAPER_NAME,
                collection = Wallpaper.DefaultCollection,
                textColor = null,
                cardColorLight = null,
                cardColorDark = null,
                thumbnailFileState = Wallpaper.ImageFileState.Downloaded,
                assetsFileState = Wallpaper.ImageFileState.Downloaded,
            )
    }
}
