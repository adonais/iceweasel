/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ChunkAudioTest {

    private val deleted = mutableListOf<File>()

    private val cache =
        object : AudioFileCache {
            override suspend fun create(key: String): File = File("/audio/$key.wav")

            override suspend fun delete(file: File) {
                deleted.add(file)
            }

            override suspend fun clear() = Unit
        }

    @Test
    fun `test that a chunk with no audio has no file`() {
        assertNull(ChunkAudio(cache).fileFor(0))
    }

    @Test
    fun `test that a chunk keeps the file it was given`() = runTest {
        val audio = ChunkAudio(cache)

        audio.add(3, File("/audio/3.wav"))

        assertEquals(File("/audio/3.wav"), audio.fileFor(3))
        assertNull(audio.fileFor(4))
    }

    @Test
    fun `test that the audio outside the window is deleted`() = runTest {
        val audio = ChunkAudio(cache)
        (0..9).forEach { audio.add(it, File("/audio/$it.wav")) }

        audio.keepOnly(5..7)

        assertEquals((0..4).map { File("/audio/$it.wav") } + (8..9).map { File("/audio/$it.wav") }, deleted)
    }

    @Test
    fun `test that a chunk outside the window is forgotten as well as deleted`() = runTest {
        val audio = ChunkAudio(cache)
        (0..9).forEach { audio.add(it, File("/audio/$it.wav")) }

        audio.keepOnly(5..7)

        // A deleted file has to answer no, or the player is handed a path to nothing.
        assertNull(audio.fileFor(0))
        assertEquals(File("/audio/6.wav"), audio.fileFor(6))
    }

    @Test
    fun `test that the audio inside the window is left alone`() = runTest {
        val audio = ChunkAudio(cache)
        (5..7).forEach { audio.add(it, File("/audio/$it.wav")) }

        audio.keepOnly(5..7)

        assertEquals(emptyList<File>(), deleted)
    }

    @Test
    fun `test that a chunk synthesized again replaces its file and the old one is deleted`() = runTest {
        val audio = ChunkAudio(cache)
        audio.add(2, File("/audio/first.wav"))

        audio.add(2, File("/audio/second.wav"))

        assertEquals(File("/audio/second.wav"), audio.fileFor(2))
        assertEquals(listOf(File("/audio/first.wav")), deleted)
    }

    @Test
    fun `test that a chunk given the same file twice is not deleted`() = runTest {
        val audio = ChunkAudio(cache)
        audio.add(2, File("/audio/2.wav"))

        audio.add(2, File("/audio/2.wav"))

        assertEquals(File("/audio/2.wav"), audio.fileFor(2))
        assertEquals(emptyList<File>(), deleted)
    }

    @Test
    fun `test that clearing deletes and forgets everything`() = runTest {
        val audio = ChunkAudio(cache)
        (0..2).forEach { audio.add(it, File("/audio/$it.wav")) }

        audio.clear()

        assertEquals((0..2).map { File("/audio/$it.wav") }, deleted)
        (0..2).forEach { assertNull(audio.fileFor(it)) }
    }
}
