
# Globally-accessible, organized tab data

## Status

`Accepted`

## Context

Tab data is needed almost everywhere in Fenix, but it’s globally available in an unorganized format, requiring every feature to repeatedly, just-in-time transform the data into a form the feature can actually use. Some of these transforms happen in parallel across the components on the same screen.

With the advent of Tab Groups in Fenix, it’s become critical that organized tab data is globally available so disparate features don’t have to individually re-transform the data anytime the feature comes into view.

### Unorganized vs organized tab data

Unorganized tab data refers to how tabs are stored as a monolithic list within `BrowserState`. The list of `TabSessionState` contains _all_ the tab data, but not in a format that's easy-to-consume in the application layer. There is no bucketing or distinction between normal, inactive, or private tabs.

Organized tab data refers to offering categorized collections of data that any feature without deep-tab-data needs can easily pick up and consume to either render tabs or perform simple tab data operations.

```Kotlin
data class TabDataSnapshot(
    val selectedTab: Tab? = null,
    val normalTabs: List<Tab> = emptyList(),
    val privateTabs: List<Tab> = emptyList(),
    val inactiveTabs: List<Tab> = emptyList(),
    val tabGroups: List<TabGroup> = emptyList(),
)
```

## Decision

Attach a "coordinator" class to `components` whose sole responsibility is to listen to various tab data sources and emit tab data in a UI-feature-friendly format.

## Alternatives considered

### Extension functions

Fenix simply could have leveraged a battery of extension functions off of `BrowserState` to perform the data operations. This would have centralized the data transformation logic, but would not have offered the affordance of already-transformed, on-demand data.

### The legacy tab grouping (partition) abstraction inside of Android Components

Rather than a separate data storage layer, Room, for tab groups, we could have migrated the data to the JSON/BrowserState mechanism via `BrowserState.tabPartitions`. This overall approach was previously researched in Bug 2016531, and it was deemed to not meet our needs or future direction of data storage in Firefox.

## Consequences

- There is now a flattened data model for simple tab metadata.
- Fetching only normal/inactive/private tabs is streamlined.
- Tab Groups are now paired-up with their tabs in the global memory space.
- Additional retained memory for lifetime of the application.
- Processing cost of an observation that is always on.
- Unlocks the development of tab group functionality outside of tab management components.
- Unlocks the capability of solving tab-related bugs that require checking inactive tabs and/or tab groups.

## See-also

- [Spike ticket](https://bugzilla.mozilla.org/show_bug.cgi?id=2053265)
- [Write-up and diagrams](https://www.figma.com/board/j7h2lms8no3wiTdZ0ey6go/Tab-Groups-MVP-architecting?node-id=269-237&p=f&t=gA8MExu6IequsiXX-0)
