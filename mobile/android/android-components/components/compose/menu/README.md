# [Android Components](../../../README.md) > Compose > Menu

A customizable menu using Jetpack Compose.
This allows building a menu with an opinionated UI and special support for reorganizing items shown.

## Usage

```kotlin
Menu {
    Text(text = "First entry")
    Text(text = "Second entry")
}
```

### Setting up the dependency

Use Gradle to download the library from [maven.mozilla.org](https://maven.mozilla.org/) ([Setup repository](../../../README.md#maven-repository)):

```Groovy
implementation "org.mozilla.components:compose-menu:{latest-version}"
```

## License

    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/
