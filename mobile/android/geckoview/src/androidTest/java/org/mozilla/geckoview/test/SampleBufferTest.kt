/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

package org.mozilla.geckoview.test

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SmallTest
import java.io.IOException
import java.nio.ByteBuffer
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.gecko.media.SampleBuffer
import org.mozilla.gecko.mozglue.SharedMemory

@SmallTest
@RunWith(AndroidJUnit4::class)
class SampleBufferTest {
    companion object {
        @BeforeClass
        @JvmStatic
        fun loadLibrary() {
            System.loadLibrary("mozglue")
        }
    }

    private val bufferSize = 64

    private lateinit var sharedMem: SharedMemory
    private lateinit var buffer: SampleBuffer

    @Before
    fun setUp() {
        sharedMem = SharedMemory(1, bufferSize)
        buffer = SampleBuffer(sharedMem)
    }

    @After
    fun tearDown() {
        buffer.dispose()
    }

    @Test
    fun read() {
        val src = ByteBuffer.allocateDirect(bufferSize)
        // Valid call
        buffer.readFromByteBuffer(src, 0, bufferSize)
        // To null shared memory
        assertThrows(IOException::class.java) { SampleBuffer(null).readFromByteBuffer(src, 0, bufferSize) }
        // With negative offset
        assertThrows(IOException::class.java) { buffer.readFromByteBuffer(src, -1, bufferSize) }
        // With negative size
        assertThrows(IOException::class.java) { buffer.readFromByteBuffer(src, 0, -1) }
        // With offset + size exceeds src capacity
        assertThrows(IOException::class.java) { buffer.readFromByteBuffer(src, 1, bufferSize) }
        // With size exceeds shared memory
        assertThrows(IOException::class.java) {
            buffer.readFromByteBuffer(ByteBuffer.allocateDirect(bufferSize * 2), 0, bufferSize + 1)
        }
        // With offset + size integer overflow
        assertThrows(IOException::class.java) { buffer.readFromByteBuffer(src, Int.MAX_VALUE, 1) }
        // After disposal
        buffer.dispose()
        assertThrows(IOException::class.java) { buffer.readFromByteBuffer(src, 0, bufferSize) }
    }

    @Test
    fun write() {
        val dest = ByteBuffer.allocateDirect(bufferSize)
        // Valid call
        buffer.writeToByteBuffer(dest, 0, bufferSize)
        // From null shared memory
        assertThrows(IOException::class.java) { SampleBuffer(null).writeToByteBuffer(dest, 0, bufferSize) }
        // With negative offset
        assertThrows(IOException::class.java) { buffer.writeToByteBuffer(dest, -1, bufferSize) }
        // With negative size
        assertThrows(IOException::class.java) { buffer.writeToByteBuffer(dest, 0, -1) }
        // With offset + size exceeds shared memory
        assertThrows(IOException::class.java) { buffer.writeToByteBuffer(dest, 1, bufferSize) }
        // With size exceeds dest capacity
        assertThrows(IOException::class.java) {
            buffer.writeToByteBuffer(ByteBuffer.allocateDirect(bufferSize / 2), 0, bufferSize)
        }
        // With offset + size integer overflow
        assertThrows(IOException::class.java) { buffer.writeToByteBuffer(dest, Int.MAX_VALUE, 1) }
        // After disposal
        buffer.dispose()
        assertThrows(IOException::class.java) { buffer.writeToByteBuffer(dest, 0, bufferSize) }
    }

    @Test
    fun copy() {
        // Valid call
        val destMem = SharedMemory(1, bufferSize)
        buffer.nativeCopy(destMem.getPointer(), bufferSize, 0, bufferSize)
        // With null destination pointer
        assertThrows(IOException::class.java) { buffer.nativeCopy(0L, bufferSize, 0, bufferSize) }
        // From null shared memory
        assertThrows(IOException::class.java) {
            SampleBuffer(null).nativeCopy(destMem.getPointer(), bufferSize, 0, bufferSize)
        }
        // With negative offset
        assertThrows(IOException::class.java) { buffer.nativeCopy(destMem.getPointer(), bufferSize, -1, bufferSize) }
        // With negative size
        assertThrows(IOException::class.java) { buffer.nativeCopy(destMem.getPointer(), bufferSize, 0, -1) }
        // With offset + size exceeds shared memory
        assertThrows(IOException::class.java) { buffer.nativeCopy(destMem.getPointer(), bufferSize, 1, bufferSize) }
        // With size exceeds dest capacity
        assertThrows(IOException::class.java) { buffer.nativeCopy(destMem.getPointer(), bufferSize / 2, 0, bufferSize) }
        // With offset + size integer overflow
        assertThrows(IOException::class.java) { buffer.nativeCopy(destMem.getPointer(), bufferSize, Int.MAX_VALUE, 1) }
        // After disposal
        buffer.dispose()
        assertThrows(IOException::class.java) { buffer.nativeCopy(destMem.getPointer(), bufferSize, 0, bufferSize) }
        destMem.dispose()
    }
}
