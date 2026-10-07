# [Android Components](../../../README.md) > Feature > Tab Data Coordinator

A component that gathers tab data from the various places it is produced and exposes it from a
single location, so that consumers do not have to know which source a given piece of data came
from.

This component is intended to hold that merging logic: the coordination between tab sources, the
combined models describing tabs and tab groups regardless of origin, and the observable surface
consumers subscribe to. Code that reconciles two or more tab sources belongs here rather than in
the individual source components or in the app.

Note that this component coordinates existing tab data; it is not a storage layer. Persisting and
owning tab state remains the responsibility of the components that produce it.

`TabDataCoordinator` is the entry point. It combines open tabs with tab groups and exposes the
merged snapshot as a `StateFlow<TabsState?>`; the remaining sources are folded into it as they are
moved behind this component.

Open tabs reach the coordinator through `TabRepository`, which this component defines but does not
implement. The component deliberately does not depend on `browser-state`: the embedding app
supplies a `TabRepository` that maps its own tab representation onto the `Tab` model here. Tab
groups are read directly from `feature-tabgroups-storage`.

`TabGroup.theme` is carried through as the raw stored string. Mapping it onto a UI theme is the
consumer's responsibility.

### Setting up the dependency

Use Gradle to download the library from [maven.mozilla.org](https://maven.mozilla.org/) ([Setup repository](../../../README.md#maven-repository)):

```Groovy
implementation "org.mozilla.components:feature-tabdata-coordinator:{latest-version}"
```

## License

    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/
