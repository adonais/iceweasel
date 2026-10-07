# [Android Components](../../../README.md) > Feature > Tab Groups Storage

A component for persisting tab groups and the assignment of tabs to those groups.

`TabGroupRepository` is the entry point. It exposes a `Flow` of `TabGroupData` describing every
stored group together with the tab-to-group assignments, and suspending operations for creating,
updating, opening, closing and deleting groups and assignments. `DefaultTabGroupRepository` is the
Room-backed implementation; the database, its entities and DAOs are internal to this component so
that consumers only depend on the repository abstraction.

### Setting up the dependency

Use Gradle to download the library from [maven.mozilla.org](https://maven.mozilla.org/) ([Setup repository](../../../README.md#maven-repository)):

```Groovy
implementation "org.mozilla.components:feature-tabgroups-storage:{latest-version}"
```

### Usage

```Kotlin
val repository = DefaultTabGroupRepository(applicationContext)

val group = TabGroup(title = "Trip planning", theme = "Purple")
repository.createTabGroupWithTabs(group, listOf(tabId))

repository.tabGroupDataFlow.collect { data ->
    // data.tabGroups and data.tabGroupAssignments
}
```

## License

    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/
