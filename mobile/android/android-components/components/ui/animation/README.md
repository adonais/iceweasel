# [Android Components](../../../README.md) > UI > Animation

A library for providing animations.

## Usage

### Setting up the dependency

Use Gradle to download the library from [maven.mozilla.org](https://maven.mozilla.org/) ([Setup repository](../../../README.md#maven-repository)):

```Groovy
implementation "org.mozilla.components:ui-animation:{latest-version}"
```

### AnimatedIllustration

`AnimatedIllustration` plays a Lottie animation and falls back to a static drawable while the
animation is loading, if it fails to load, or when the user has reduced motion enabled.

```kotlin
AnimatedIllustration(
    animationResource = R.raw.onboarding_animation,
    staticDrawableResource = R.drawable.onboarding_illustration,
    contentDescription = stringResource(R.string.onboarding_illustration_description),
)
```

## License

This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at http://mozilla.org/MPL/2.0/
