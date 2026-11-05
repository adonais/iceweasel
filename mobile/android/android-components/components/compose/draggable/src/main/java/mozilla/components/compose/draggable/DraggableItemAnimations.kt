/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.draggable

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.foundation.lazy.grid.LazyGridItemScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * The default animations for a ListItem.
 *
 * @param lazyListItemScope The [LazyItemScope] (needed to define animateItem())
 * @param suppressTransitions Whether transition animations should be suppressed
 */
@Composable
internal fun Modifier.defaultListItemAnimation(
    lazyListItemScope: LazyItemScope,
    suppressTransitions: Boolean,
): Modifier =
    with(lazyListItemScope) {
        this@defaultListItemAnimation.animateItem(
            fadeOutSpec =
                if (suppressTransitions) {
                    null
                } else {
                    spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)
                },
            placementSpec =
                if (suppressTransitions) {
                    null
                } else {
                    spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)
                },
            fadeInSpec = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium),
        )
    }

/** Elevation parameters for interactable items. */
internal object Elevation {
    const val SWIPE_ACTIVE = 10f
    const val ENTERING_ITEM = 2f
    const val DRAGGED_ITEM = 1f
    const val NO_INTERACTION = 0f
}

/**
 * The default animations for a GridItem.
 *
 * @param lazyGridItemScope The [LazyGridItemScope] (needed to define animateItem())
 * @param suppressTransitions Whether transition animations should be suppressed. Items are by default clipped to their
 *   bounds while fade in/out animations are playing, so this can be helpful if you would like to e.g. play an
 *   overshooting scale animation for an item entering composition.
 */
@Composable
internal fun Modifier.defaultGridItemAnimation(
    lazyGridItemScope: LazyGridItemScope,
    suppressTransitions: Boolean,
): Modifier =
    with(lazyGridItemScope) {
        this@defaultGridItemAnimation.animateItem(
            fadeOutSpec =
                if (suppressTransitions) {
                    null
                } else {
                    spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)
                },
            placementSpec =
                if (suppressTransitions) {
                    null
                } else {
                    spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)
                },
            fadeInSpec =
                if (suppressTransitions) {
                    null
                } else {
                    spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium)
                },
        )
    }
