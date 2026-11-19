/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection.store.state

/**
 * Represents data volume allocation.
 *
 * @property bytes the number of bytes represented by this [DataVolume]. Must be non-negative.
 */
@JvmInline
value class DataVolume(val bytes: Long) {

    companion object {
        /** The max amount of bytes, just before we reach our max value ([Long.MAX_VALUE]) that signifies unlimited */
        private const val MAX_FINITE_BYTES = Long.MAX_VALUE - 1

        /** Unlimited data volume. */
        val Unlimited = DataVolume(bytes = Long.MAX_VALUE)

        /** Zero data volume. */
        val Zero = DataVolume(bytes = 0)

        /**
         * Convenience function to round [number] to the nearest gigabyte it represents and represent it as a
         * [DataVolume] for use in tests and UI previews.
         *
         * Example usage is
         *
         * ```kotlin
         *     val oneGigabyte = DataVolume.roundedGigabytes(1)
         *     println(oneGigabyte.bytes) // 1_073_741_824
         * ```
         */
        fun roundedGigabytes(number: Number): DataVolume {
            return DataVolume(number.toLong() * BYTES_PER_GB.toLong())
        }
    }

    /**
     * Adds [other] to this data volume, returning [DataVolume.Unlimited] if either value is unlimited and capping
     * finite results at the largest finite value.
     */
    operator fun plus(other: DataVolume): DataVolume {
        return when {
            this.isUnlimited || other.isUnlimited -> Unlimited
            this.bytes > MAX_FINITE_BYTES - other.bytes -> DataVolume(MAX_FINITE_BYTES)
            else -> DataVolume(bytes + other.bytes)
        }
    }

    /**
     * Subtracts [other] from this volume
     *
     * When this volume is unlimited, the subtraction will yield unlimited. When this volume is finite, and the other
     * volume is unlimited, the result is [DataVolume.Zero].
     */
    operator fun minus(other: DataVolume): DataVolume {
        return when {
            this.isUnlimited -> Unlimited
            else -> DataVolume((this.bytes - other.bytes).coerceAtLeast(0L))
        }
    }

    /**
     * Divides this volume by [other], returning the ratio between the two as a [Float].
     *
     * When [other] is [DataVolume.Zero], the result is `0f`, including when this volume is unlimited. Otherwise, an
     * unlimited dividend returns `1f`, and an unlimited divisor returns `0f`.
     */
    operator fun div(other: DataVolume): Float {
        return when {
            other.bytes == 0L -> 0f
            this.isUnlimited -> 1f
            other.isUnlimited -> 0f
            else -> this.bytes.toFloat() / other.bytes.toFloat()
        }
    }

    override fun toString(): String {
        return when {
            this.isUnlimited -> "DataVolume.Unlimited"
            else -> "DataVolume(bytes = $bytes)"
        }
    }
}

/** Returns `true` if this [DataVolume] is unlimited */
val DataVolume.isUnlimited: Boolean
    get() = this == DataVolume.Unlimited

/** Converts a finite long to a [DataVolume], capping it below [DataVolume.Unlimited]. */
internal fun Long.asDataVolume(): DataVolume = DataVolume(coerceAtMost(Long.MAX_VALUE - 1))

/**
 * Converts the [DataVolume.bytes] represented by the [DataVolume] to how much data it is in Gigabytes.
 * [DataVolume.Unlimited] is represented as [Float.POSITIVE_INFINITY].
 */
val DataVolume.gigabytes: Float
    get() = if (isUnlimited) Float.POSITIVE_INFINITY else bytes / BYTES_PER_GB

/** Constant value representing the bytes in a gigabyte */
internal const val BYTES_PER_GB = 1024 * 1024 * 1024f
