/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.base.text

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.res.stringResource

/**
 * A sealed Type so callers can take advantage of passing resource values without passing resource or context to their
 * mappers, making it easy for them. At the same time, allowing the ability to have string which could be from another
 * source or could be formatted in a feature specific way. This is a base utility that would help all components.
 */
sealed interface Text {

    /**
     * A simple string text.
     *
     * @property value The string value.
     */
    data class String(val value: kotlin.String) : Text

    /**
     * A resource text, optionally formatted with [args].
     *
     * @property value The [Int] resource value.
     * @property args The format arguments to apply to the resource, if it declares any. A [List] rather than a `vararg`
     *   so that equality between two instances stays structural.
     */
    data class Resource(
        @param:StringRes val value: Int,
        val args: List<Any> = emptyList(),
    ) : Text
}

/** Unpacks and returns the value of the text based on the type of [Text]. */
val Text.value: String
    @Composable
    @ReadOnlyComposable
    get() =
        when (this) {
            is Text.String -> this.value
            is Text.Resource ->
                when {
                    // Not simply always using the formatting overload, since that one runs the resource through
                    // `String.format` even with no arguments, which would fail for strings containing a literal "%".
                    args.isEmpty() -> stringResource(this.value)
                    else -> {
                        @Suppress("SpreadOperator") stringResource(this.value, *args.toTypedArray())
                    }
                }
        }
