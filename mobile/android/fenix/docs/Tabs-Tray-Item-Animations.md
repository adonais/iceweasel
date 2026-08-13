# Tabs Tray Item Animations

Tab items in the list (or grid) by default have three configured animations via animateItems():

- fadeIn: on enter, the item's alpha animates from 0 to 1, revealing the item
- fadeOut: on exit, the item's alpha animates from 1 to 0, hiding the item
- placement: when an item is placed or moved, it is translated and surrounding items are shuffled

When a new tab group is created (via drag-and-drop onto another tab, or by saving a
multi-selection), the group's item plays a one-shot entrance animation that scales up
with a slight overshoot and fades in, while the surrounding tabs avoid the usual
fade/shuffle so the group appears to "land" in place and distractions are minimized.

This document describes how that animation is driven. See `Bug 2039969`.

See also [https://developer.android.com/develop/ui/views/animations/spring-animation]

## Lifecycle (data flow)

The animation is gated by a single piece of state, `TabsTrayState.TabGroupState.enteringGroupId`.
It is set when a group is created and cleared once the animation finishes, so the
entrance plays exactly once.

```{mermaid}
stateDiagram-v2
    state GroupEntranceAnimation {
        [*] --> Alpha
        [*] --> Scale
        state Alpha {
            [*] --> ALPHA_START
            ALPHA_START : snapTo 0f (invisible)
            ALPHA_START --> ALPHA_END
            ALPHA_END: springTo 1f (fully visible), StiffnessMedium
            ALPHA_END --> [*]
        }
        state Scale {
            [*] --> SCALE_START
            SCALE_START : snapTo 0.92f
            SCALE_START --> SCALE_PEAK
            SCALE_PEAK : springTo 1.06f, StiffnessMediumLow
            SCALE_PEAK --> SCALE_END
            SCALE_END : springTo 1f, StiffnessMediumLow
            SCALE_END --> Notify
            Notify : Update enteringGroupId to NULL
            Notify --> [*]
        }
    }
    state DefaultAnimation {
        newGroupPlaying: Is a group entrance animation playing?<br/>(enteringGroupId non-null)
        newGroupPlaying --> groupPlayingYes
        newGroupPlaying --> groupPlayingNo
        groupPlayingNo: No
        groupPlayingYes: Yes
        groupPlayingYes --> disableAnimateItems
        disableAnimateItems: Disable item animations for fadeIn, fadeOut, placement
        disableAnimateItems --> [*]
        groupPlayingNo --> enableAnimateItems
        enableAnimateItems: Play default item animations for fadeIn, fadeOut, placement
        enableAnimateItems --> [*]
    }

    [*] --> enteringGroupId
    enteringGroupId --> enteringGroup
    enteringGroup: Is tab item new group entering composition?<br/> (id == enteringGroupId)
    enteringGroup --> Yes
    enteringGroup --> No

    Yes --> GroupEntranceAnimation

    No --> DefaultAnimation
```

## Grid vs. list

The two layouts apply the entrance with slight differences:

- **Grid** hoists `tabGroupEntranceAnimation` onto the outer `InteractableDragItemContainer`,
  above the `LazyGridItem`, so the `1.06` overshoot is not clipped to the item's bounds.
- **List** combines the entrance scale with the interaction scale inside
  `tabItemGroupListInteractionAnimation` (`combinedScale = interactionScale * entranceScale`).
  This is because the overshoot displays differently on a list, which has one item per row.

## Suppressing default item animations

While `enteringGroupId != null`, `defaultGridItemAnimation` / `defaultListItemAnimation`
pass `null` for the `fadeOut` and `placement` specs. This prevents two unwanted effects
per the spec:

- "Ghost" tabs of the items being combined fading out.
- Neighboring tabs shuffling to make room; the group should appear at the position it
  was dropped.

## Key references

- `SharedTabItemUi.kt` — holds most of the animation logic.
- `InteractableGrid.kt` / `InteractableList.kt` — render the tab items and set `isEnteringGroup`.
- `TabGroupAction.kt` — definition of `NewGroupCreated`, `NewGroupAnimationPlayed`.
- `TabGroupActionReducer.kt` — sets/clears `enteringGroupId`.
- `TabStorageMiddleware.kt` — dispatches `NewGroupCreated` after the group is persisted.
