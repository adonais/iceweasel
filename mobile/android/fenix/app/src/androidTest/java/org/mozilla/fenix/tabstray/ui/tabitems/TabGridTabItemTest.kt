package org.mozilla.fenix.tabstray.ui.tabitems

import androidx.compose.animation.core.DecayAnimationSpec
import androidx.compose.animation.rememberSplineBasedDecay
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.LayoutDirection
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.compose.SwipeToDismissState2
import org.mozilla.fenix.tabstray.TabsTrayTestTag
import org.mozilla.fenix.tabstray.browser.compose.TabItemInteractionState
import org.mozilla.fenix.tabstray.data.createTab

@RunWith(AndroidJUnit4::class)
class TabGridTabItemTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun verifyDraggedItemScale() {
        composeTestRule.mainClock.autoAdvance = false
        composeTestRule.setContent {
            ComposableUnderTest(interactionState = TabItemInteractionState(isDragged = true))
        }
        composeTestRule.mainClock.advanceTimeBy(50L)

        val draggedScale = composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_ITEM_ROOT).fetchSemanticsNode().config[ScaleKey]

        Assert.assertEquals("Dragged item is scaled at 75%", 0.75f, draggedScale)
    }

    @Test
    fun verifyUndraggedItemScale() {
        composeTestRule.mainClock.autoAdvance = false
        composeTestRule.setContent {
            ComposableUnderTest(interactionState = TabItemInteractionState(isDragged = false))
        }
        composeTestRule.mainClock.advanceTimeBy(50L)

        val undraggedScale = composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_ITEM_ROOT).fetchSemanticsNode().config[ScaleKey]

        Assert.assertEquals("Dragged item is scaled at 100%", 1f, undraggedScale)
    }

    @Test
    fun verifyDraggedItemAlpha() {
        composeTestRule.mainClock.autoAdvance = false
        composeTestRule.setContent {
            ComposableUnderTest(interactionState = TabItemInteractionState(isDragged = true))
        }
        composeTestRule.mainClock.advanceTimeBy(50L)

        val draggedAlpha = composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_ITEM_ROOT).fetchSemanticsNode().config[AlphaKey]

        Assert.assertEquals("Dragged item opacity is 70%", 0.7f, draggedAlpha)
    }

    @Test
    fun verifyUndraggedItemAlpha() {
        composeTestRule.mainClock.autoAdvance = false
        composeTestRule.setContent {
            ComposableUnderTest(interactionState = TabItemInteractionState(isDragged = false))
        }
        composeTestRule.mainClock.advanceTimeBy(50L)

        val undraggedAlpha = composeTestRule.onNodeWithTag(TabsTrayTestTag.TAB_ITEM_ROOT).fetchSemanticsNode().config[AlphaKey]

        Assert.assertEquals("Undragged item opacity is 100%", 1f, undraggedAlpha)
    }

    @Composable
    private fun ComposableUnderTest(interactionState: TabItemInteractionState = TabItemInteractionState()) {
        val density = LocalDensity.current
        val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
        val decayAnimationSpec: DecayAnimationSpec<Float> = rememberSplineBasedDecay()

        val swipeState = remember {
            SwipeToDismissState2(
                density = density,
                decayAnimationSpec = decayAnimationSpec,
                isRtl = isRtl,
            )
        }
        TabGridTabItem(
            tab = createTab(url = "mozilla.org"),
            swipeState = swipeState,
            onCloseClick = { _ -> },
            onClick = { _ -> },
            interactionState = interactionState,
        )
    }
}
