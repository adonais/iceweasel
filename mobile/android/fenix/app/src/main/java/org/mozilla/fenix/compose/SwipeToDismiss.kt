/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.compose

import androidx.annotation.VisibleForTesting
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.SwipeToDismissBoxDefaults
import androidx.compose.material3.SwipeToDismissBoxState
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.abs

/** Alpha constants for swipe-to-dismiss transitions. */
object SwipeToDismiss {
    const val FULL_ALPHA = 1f
    const val MIN_ALPHA = 0.1f
}

/**
 * Creates a [SwipeToDismissBoxState] for an item identified by [id].
 *
 * Deliberately not [androidx.compose.material3.rememberSwipeToDismissBoxState], which saves its current value: a lazy
 * layout keeps an item's saved state around after the item leaves the list, so an item restored through the undo
 * snackbar would return as swiped away and be dismissed again on its first composition.
 *
 * @param id The unique identifier for the item.
 */
@Composable
fun rememberSwipeToDismissBoxState(id: String): SwipeToDismissBoxState {
    val positionalThreshold = SwipeToDismissBoxDefaults.positionalThreshold

    return remember(id) {
        SwipeToDismissBoxState(
            initialValue = SwipeToDismissBoxValue.Settled,
            positionalThreshold = positionalThreshold,
        )
    }
}

/** Custom modifier that fades an item to transparent as it is swiped to dismiss. */
fun Modifier.swipeToDismissFade(state: SwipeToDismissBoxState) = graphicsLayer {
    // state.progress is tied to targetValue which has a fixed threshold,
    // so we need to pull the offset to get a linear fade animation.
    val offset =
        try {
            if (state.dismissDirection == SwipeToDismissBoxValue.Settled) {
                0f
            } else {
                state.requireOffset()
            }
        } catch (_: IllegalStateException) {
            // It should be safe to call requireOffset() here, but there's no
            // reason to risk a crash for a fade animation.
            0f
        }
    alpha = swipeFadeAlpha(offset = offset, width = size.width)
}

@VisibleForTesting
internal fun swipeFadeAlpha(offset: Float, width: Float): Float {
    return if (width <= 0f || offset.isNaN()) {
        SwipeToDismiss.FULL_ALPHA
    } else {
        maxOf(
            SwipeToDismiss.MIN_ALPHA,
            SwipeToDismiss.FULL_ALPHA - (abs(offset) / width).coerceIn(0f, 1f),
        )
    }
}

/**
 * The background of an item that is being swiped horizontally.
 *
 * @param state [SwipeToDismissBoxState] of the swiped item.
 * @param modifier [Modifier] to apply to the background.
 * @param shape Shape of the background.
 */
@Composable
fun SwipeToDismissBackground(
    state: SwipeToDismissBoxState,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(0.dp),
) {
    val isSwipeActive = state.dismissDirection != SwipeToDismissBoxValue.Settled
    if (isSwipeActive) {
        val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
        // dismissDirection comes from the raw offset and is not mirrored for RTL.
        val contentMovedRight = state.dismissDirection == SwipeToDismissBoxValue.StartToEnd
        val isSwipingToStart = if (isRtl) contentMovedRight else !contentMovedRight

        DismissibleItemBackground(
            isSwipeActive = true,
            isSwipingToStart = isSwipingToStart,
            modifier = modifier,
            shape = shape,
        )
    }
}
