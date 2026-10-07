/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.test.assertFailsWith
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

// The format the test Pixel produced for every language and every voice.
private const val SAMPLE_RATE = 24_000
private const val BYTES_PER_SECOND = 48_000

class AudioFormatInfoTest {

    @get:Rule val temporaryFolder = TemporaryFolder()

    @Test
    fun `test that a second of 24 kHz mono audio is measured as a second`() {
        val audio = readWavAudio(wavFile(sampleBytes = BYTES_PER_SECOND))

        assertEquals(1.seconds, audio.duration)
        assertEquals(AudioFormatInfo(sampleRate = SAMPLE_RATE, channels = 1, bitsPerSample = 16), audio.format)
        assertEquals(BYTES_PER_SECOND, audio.format.bytesPerSecond)
    }

    @Test
    fun `test that part of a second is not rounded up to a second`() {
        val audio = readWavAudio(wavFile(sampleBytes = BYTES_PER_SECOND / 4))

        assertEquals(250.milliseconds, audio.duration)
    }

    @Test
    fun `test that the sample rate is read from the file rather than assumed`() {
        val sixteen = readWavAudio(wavFile(sampleRate = 16_000, sampleBytes = 32_000))
        val twentyTwo = readWavAudio(wavFile(sampleRate = 22_050, sampleBytes = 44_100))

        assertEquals(1.seconds, sixteen.duration)
        assertEquals(16_000, sixteen.format.sampleRate)
        assertEquals(1.seconds, twentyTwo.duration)
        assertEquals(22_050, twentyTwo.format.sampleRate)
    }

    @Test
    fun `test that the samples are found behind another chunk`() {
        val file = wavFile(sampleBytes = BYTES_PER_SECOND, chunksBeforeData = listOf("LIST" to 26))

        assertEquals(1.seconds, readWavAudio(file).duration)
    }

    @Test
    fun `test that the padding byte of an odd length chunk is skipped`() {
        val file = wavFile(sampleBytes = BYTES_PER_SECOND, chunksBeforeData = listOf("fact" to 5))

        assertEquals(1.seconds, readWavAudio(file).duration)
    }

    @Test
    fun `test that a format chunk with an extension field is still understood`() {
        val file = wavFile(sampleBytes = BYTES_PER_SECOND, formatChunkExtension = 2)

        assertEquals(1.seconds, readWavAudio(file).duration)
    }

    @Test
    fun `test that a file shorter than its header claims is measured by what it holds`() {
        val file = wavFile(sampleBytes = BYTES_PER_SECOND / 2, declaredDataSize = BYTES_PER_SECOND)

        assertEquals(500.milliseconds, readWavAudio(file).duration)
    }

    @Test
    fun `test that a second channel does not double the duration`() {
        val file = wavFile(channels = 2, sampleBytes = BYTES_PER_SECOND * 2)

        assertEquals(1.seconds, readWavAudio(file).duration)
    }

    @Test
    fun `test that a file which is not a WAV file is rejected`() {
        val file = temporaryFolder.newFile().apply { writeText("this is not audio at all, not even close") }

        assertFailsWith<AudioFormatException> { readWavAudio(file) }
    }

    @Test
    fun `test that a file too short to hold a header is rejected`() {
        val file = temporaryFolder.newFile().apply { writeBytes(ByteArray(8)) }

        assertFailsWith<AudioFormatException> { readWavAudio(file) }
    }

    @Test
    fun `test that a sample width other than 16-bit is measured rather than rejected`() {
        // An engine declares its own format and the platform allows these too, so the width is read, not required.
        val eightBit = readWavAudio(wavFile(bitsPerSample = 8, sampleBytes = SAMPLE_RATE))
        val twentyFourBit = readWavAudio(wavFile(bitsPerSample = 24, sampleBytes = SAMPLE_RATE * 3))

        assertEquals(1.seconds, eightBit.duration)
        assertEquals(1.seconds, twentyFourBit.duration)
    }

    @Test
    fun `test that floating point audio is measured rather than rejected`() {
        val file = wavFile(encoding = FLOAT_ENCODING, bitsPerSample = 32, sampleBytes = SAMPLE_RATE * 4)

        assertEquals(1.seconds, readWavAudio(file).duration)
    }

    @Test
    fun `test that a sample width which is not whole bytes is rejected`() {
        // ADPCM and friends pack samples across byte boundaries, so the size does not divide out into a duration.
        assertFailsWith<AudioFormatException> { readWavAudio(wavFile(bitsPerSample = 4)) }
    }

    @Test
    fun `test that an encoding this cannot measure is rejected`() {
        // WAVE_FORMAT_EXTENSIBLE keeps its real format in an extension block this does not read.
        assertFailsWith<AudioFormatException> { readWavAudio(wavFile(encoding = EXTENSIBLE_ENCODING)) }
    }

    @Test
    fun `test that a file with no samples in it is rejected`() {
        assertFailsWith<AudioFormatException> { readWavAudio(wavFile(withDataChunk = false)) }
    }

    @Suppress("LongParameterList")
    private fun wavFile(
        sampleRate: Int = SAMPLE_RATE,
        channels: Int = 1,
        bitsPerSample: Int = 16,
        encoding: Int = PCM_ENCODING,
        sampleBytes: Int = BYTES_PER_SECOND,
        declaredDataSize: Int = sampleBytes,
        formatChunkExtension: Int = 0,
        chunksBeforeData: List<Pair<String, Int>> = emptyList(),
        withDataChunk: Boolean = true,
    ): File {
        val bytes =
            ByteArrayOutputStream().apply {
                tag("RIFF")
                littleEndianInt(0)
                tag("WAVE")

                tag("fmt ")
                littleEndianInt(FORMAT_CHUNK_SIZE + formatChunkExtension)
                littleEndianShort(encoding)
                littleEndianShort(channels)
                littleEndianInt(sampleRate)
                littleEndianInt(sampleRate * channels * bitsPerSample / 8)
                littleEndianShort(channels * bitsPerSample / 8)
                littleEndianShort(bitsPerSample)
                write(ByteArray(formatChunkExtension))

                chunksBeforeData.forEach { (name, size) ->
                    tag(name)
                    littleEndianInt(size)
                    write(ByteArray(size + size % 2))
                }

                if (withDataChunk) {
                    tag("data")
                    littleEndianInt(declaredDataSize)
                    write(ByteArray(sampleBytes))
                }
            }

        return temporaryFolder.newFile().apply { writeBytes(bytes.toByteArray()) }
    }
}

private const val FORMAT_CHUNK_SIZE = 16
private const val PCM_ENCODING = 1
private const val FLOAT_ENCODING = 3
private const val EXTENSIBLE_ENCODING = 0xFFFE

private fun ByteArrayOutputStream.tag(value: String) = write(value.toByteArray(Charsets.US_ASCII))

private fun ByteArrayOutputStream.littleEndianInt(value: Int) =
    write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array())

private fun ByteArrayOutputStream.littleEndianShort(value: Int) =
    write(ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(value.toShort()).array())
