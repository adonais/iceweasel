/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.synthesis

import java.io.EOFException
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

/**
 * The parts of a WAV header that decide how long the audio lasts.
 *
 * A WAV file is a small header followed by raw samples, one per channel per tick. One sample per channel makes a frame,
 * and a frame is one instant of the audio, so the bytes divide straight out into seconds: 24 kHz, 16-bit, mono is
 * `24000 ticks x 2 bytes x 1 channel` = 48,000 bytes per second.
 *
 * @property sampleRate Frames per second.
 * @property channels Samples per frame — 1 for mono, 2 for stereo.
 * @property bitsPerSample How big one sample is.
 */
internal data class AudioFormatInfo(
    val sampleRate: Int,
    val channels: Int,
    val bitsPerSample: Int,
) {
    /** How many bytes of samples one second of this audio takes. */
    val bytesPerSecond: Int = sampleRate * channels * (bitsPerSample / BITS_PER_BYTE)

    /** How long [sampleBytes] bytes of samples last. */
    fun durationOf(sampleBytes: Long): Duration = (sampleBytes * MILLIS_PER_SECOND / bytesPerSecond).milliseconds
}

/**
 * A WAV file's format and the length of the audio in it.
 *
 * @property format The format the engine wrote it in.
 * @property duration How long the audio lasts.
 */
internal data class WavAudio(val format: AudioFormatInfo, val duration: Duration)

/** Thrown when a file is not a WAV file, or is one this cannot measure. */
internal class AudioFormatException(message: String, cause: Throwable? = null) : IOException(message, cause)

private fun audioFormatError(message: String, cause: Throwable? = null): Nothing =
    throw AudioFormatException(message, cause)

/**
 * Reads [file]'s header and works out how long its audio lasts, without decoding any of it.
 *
 * @throws AudioFormatException if the file is not a WAV file, is truncated before its header ends, or declares a format
 *   whose size does not divide out into a duration. Every engine measured so far writes 16-bit PCM, but an engine
 *   declares its own format to the platform and the platform allows 8-bit and floating point too, so the width is read
 *   from the file rather than required to be 16.
 */
internal fun readWavAudio(file: File): WavAudio =
    try {
        RandomAccessFile(file, "r").use { it.readWavAudio(file.length()) }
    } catch (e: EOFException) {
        audioFormatError("Ran out of file while reading the header of ${file.name}", e)
    }

private fun RandomAccessFile.readWavAudio(fileLength: Long): WavAudio {
    val riff = readBytes(RIFF_HEADER_SIZE)
    if (riff.tag(0) != RIFF_TAG || riff.tag(WAVE_TAG_OFFSET) != WAVE_TAG) {
        audioFormatError("Not a WAV file")
    }

    // Walk the chunks rather than assuming the samples start at byte 44, because a writer is free to put a LIST or a
    // fact chunk in front of them and some do.
    var format: AudioFormatInfo? = null
    while (filePointer + CHUNK_HEADER_SIZE <= fileLength) {
        val header = readBytes(CHUNK_HEADER_SIZE)
        val declaredSize = header.leUInt(CHUNK_SIZE_OFFSET)
        val payloadStart = filePointer

        when (header.tag(0)) {
            FORMAT_TAG -> format = readFormat(declaredSize)
            DATA_TAG -> {
                val measured = format ?: audioFormatError("The data chunk comes before the format chunk")

                // A file the system reclaimed, or one an interrupted request left behind, is shorter than its header
                // claims. Measuring what is there beats reporting a duration the audio does not have.
                val sampleBytes = minOf(declaredSize, fileLength - payloadStart)
                return WavAudio(measured, measured.durationOf(sampleBytes))
            }
        }

        // Chunks are padded to an even length, and the padding byte is not counted in the declared size.
        seek(payloadStart + declaredSize + declaredSize % 2)
    }

    audioFormatError("The file has no data chunk")
}

private fun RandomAccessFile.readFormat(declaredSize: Long): AudioFormatInfo {
    if (declaredSize < FORMAT_CHUNK_SIZE) {
        audioFormatError("The format chunk is $declaredSize bytes, too short to read")
    }

    val chunk = readBytes(FORMAT_CHUNK_SIZE)
    val encoding = chunk.leUShort(ENCODING_OFFSET)
    val channels = chunk.leUShort(CHANNELS_OFFSET)
    val sampleRate = chunk.leUInt(SAMPLE_RATE_OFFSET).toInt()
    val bitsPerSample = chunk.leUShort(BITS_PER_SAMPLE_OFFSET)

    if (encoding !in UNCOMPRESSED_ENCODINGS) {
        audioFormatError("Expected uncompressed audio, the file declares encoding $encoding")
    }
    if (bitsPerSample < BITS_PER_BYTE || bitsPerSample % BITS_PER_BYTE != 0) {
        audioFormatError("Expected whole bytes per sample, the file declares $bitsPerSample bits")
    }
    if (channels < 1 || sampleRate < 1) {
        audioFormatError("The format chunk declares $channels channels at $sampleRate Hz")
    }

    return AudioFormatInfo(sampleRate = sampleRate, channels = channels, bitsPerSample = bitsPerSample)
}

private fun RandomAccessFile.readBytes(count: Int) = ByteArray(count).also { readFully(it) }

private fun ByteArray.tag(offset: Int) = String(this, offset, TAG_LENGTH, Charsets.US_ASCII)

private fun ByteArray.littleEndian() = ByteBuffer.wrap(this).order(ByteOrder.LITTLE_ENDIAN)

private fun ByteArray.leUInt(offset: Int) = littleEndian().getInt(offset).toLong() and UINT_MASK

private fun ByteArray.leUShort(offset: Int) = littleEndian().getShort(offset).toInt() and USHORT_MASK

private const val BITS_PER_BYTE = 8
private const val MILLIS_PER_SECOND = 1000

private const val RIFF_TAG = "RIFF"
private const val WAVE_TAG = "WAVE"
private const val FORMAT_TAG = "fmt "
private const val DATA_TAG = "data"

private const val TAG_LENGTH = 4
private const val RIFF_HEADER_SIZE = 12
private const val WAVE_TAG_OFFSET = 8
private const val CHUNK_HEADER_SIZE = 8
private const val CHUNK_SIZE_OFFSET = 4

private const val FORMAT_CHUNK_SIZE = 16
private const val ENCODING_OFFSET = 0
private const val CHANNELS_OFFSET = 2
private const val SAMPLE_RATE_OFFSET = 4
private const val BITS_PER_SAMPLE_OFFSET = 14

// WAVE_FORMAT_PCM and WAVE_FORMAT_IEEE_FLOAT. The bytes divide out into seconds the same way for both, so neither
// needs a branch of its own. Anything else either packs samples across byte boundaries, as ADPCM does, or hides its
// real format in an extension block, as WAVE_FORMAT_EXTENSIBLE does, and the arithmetic below would be wrong.
private val UNCOMPRESSED_ENCODINGS = setOf(1, 3)

private const val UINT_MASK = 0xFFFFFFFFL
private const val USHORT_MASK = 0xFFFF
