/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:Suppress("MagicNumber")

package mozilla.components.compose.base.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import mozilla.components.ui.colors.PhotonColors

/**
 * A custom Color Palette for Mozilla Firefox for Android (Fenix).
 */
@Suppress("LongParameterList")
@Stable
class AcornColors(
    layer3: Color,
    layerGradientStart: Color,
    layerGradientEnd: Color,
    formDefault: Color,
    textOnColorPrimary: Color,
    iconOnColor: Color,
    ripple: Color,
    tabActive: Color,
    tabInactive: Color,
    information: Color,
    informationContainer: Color,
    onInformationContainer: Color,
    success: Color,
    warning: Color,
    warningContainer: Color,
    onWarningContainer: Color,
    surfaceDimVariant: Color,
) {
    // Layers

    // Search
    var layer3 by mutableStateOf(layer3)
        private set

    // Tooltip
    var layerGradientStart by mutableStateOf(layerGradientStart)
        private set

    // Tooltip
    var layerGradientEnd by mutableStateOf(layerGradientEnd)
        private set

    // Checkbox default, Radio button default
    var formDefault by mutableStateOf(formDefault)
        private set

    // Text

    // Text Inverted/On Color
    var textOnColorPrimary by mutableStateOf(textOnColorPrimary)
        private set

    // Icon

    // Icon inverted (on color)
    var iconOnColor by mutableStateOf(iconOnColor)
        private set

    var ripple by mutableStateOf(ripple)
        private set

    // Tab Active
    var tabActive by mutableStateOf(tabActive)
        private set

    // Tab Inactive
    var tabInactive by mutableStateOf(tabInactive)
        private set

    /*
     * M3 color scheme extensions that do not have a mapped value from Acorn
     */

    /**
     * Attention-grabbing color against surface for fills, icons, and text,
     * indicating neutral information.
     */
    internal var information by mutableStateOf(information)
        private set

    /**
     * Less prominent fill color against surface, for neutral information.
     */
    internal var informationContainer by mutableStateOf(informationContainer)
        private set

    /**
     * Text and icons against information container.
     */
    internal var onInformationContainer by mutableStateOf(onInformationContainer)
        private set

    /**
     * Attention-grabbing color against surface for fills, icons, and text,
     * indicating successful information
     */
    internal var success by mutableStateOf(success)
        private set

    /**
     * Attention-grabbing color against surface for fills, icons, and text, indicating
     * warning information.
     */
    internal var warning by mutableStateOf(warning)
        private set

    /**
     * Less prominent fill color against surface, for warning information.
     */
    internal var warningContainer by mutableStateOf(warningContainer)
        private set

    /**
     * Text and icons against warning container.
     */
    internal var onWarningContainer by mutableStateOf(onWarningContainer)
        private set

    /**
     * Slightly dimmer surface color in light theme.
     */
    internal var surfaceDimVariant by mutableStateOf(surfaceDimVariant)
        private set

    /**
     * Updates the existing colors with the provided [AcornColors].
     */
    @Suppress("LongMethod")
    fun update(other: AcornColors) {
        layer3 = other.layer3
        layerGradientStart = other.layerGradientStart
        layerGradientEnd = other.layerGradientEnd
        formDefault = other.formDefault
        textOnColorPrimary = other.textOnColorPrimary
        iconOnColor = other.iconOnColor
        ripple = other.ripple
        tabActive = other.tabActive
        tabInactive = other.tabInactive
        information = other.information
        informationContainer = other.informationContainer
        onInformationContainer = other.onInformationContainer
        success = other.success
        warning = other.warning
        warningContainer = other.warningContainer
        onWarningContainer = other.onWarningContainer
        surfaceDimVariant = other.surfaceDimVariant
    }

    /**
     * Return a copy of this [AcornColors] and optionally overriding any of the provided values.
     */
    @Suppress("LongMethod")
    fun copy(
        layer3: Color = this.layer3,
        layerGradientStart: Color = this.layerGradientStart,
        layerGradientEnd: Color = this.layerGradientEnd,
        formDefault: Color = this.formDefault,
        textOnColorPrimary: Color = this.textOnColorPrimary,
        iconOnColor: Color = this.iconOnColor,
        ripple: Color = this.ripple,
        tabActive: Color = this.tabActive,
        tabInactive: Color = this.tabInactive,
        information: Color = this.information,
        informationContainer: Color = this.informationContainer,
        onInformationContainer: Color = this.onInformationContainer,
        success: Color = this.success,
        warning: Color = this.warning,
        warningContainer: Color = this.warningContainer,
        onWarningContainer: Color = this.onWarningContainer,
        surfaceDimVariant: Color = this.surfaceDimVariant,
    ): AcornColors = AcornColors(
        layer3 = layer3,
        layerGradientStart = layerGradientStart,
        layerGradientEnd = layerGradientEnd,
        formDefault = formDefault,
        textOnColorPrimary = textOnColorPrimary,
        iconOnColor = iconOnColor,
        ripple = ripple,
        tabActive = tabActive,
        tabInactive = tabInactive,
        information = information,
        informationContainer = informationContainer,
        onInformationContainer = onInformationContainer,
        success = success,
        warning = warning,
        warningContainer = warningContainer,
        onWarningContainer = onWarningContainer,
        surfaceDimVariant = surfaceDimVariant,
    )
}

val darkColorPalette = AcornColors(
    layer3 = PhotonColors.DarkGrey80,
    layerGradientStart = PhotonColors.Violet70,
    layerGradientEnd = PhotonColors.Violet60,
    formDefault = PhotonColors.LightGrey05,
    textOnColorPrimary = PhotonColors.LightGrey05,
    iconOnColor = PhotonColors.LightGrey05,
    ripple = PhotonColors.White,
    tabActive = PhotonColors.DarkGrey30,
    tabInactive = PhotonColors.DarkGrey80,
    information = PhotonColors.Blue30,
    informationContainer = PhotonColors.Blue50,
    onInformationContainer = PhotonColors.LightGrey05,
    success = PhotonColors.Green50,
    warning = PhotonColors.Yellow50,
    warningContainer = PhotonColors.Yellow70A77,
    onWarningContainer = PhotonColors.LightGrey05,
    surfaceDimVariant = PhotonColors.DarkGrey80,
)

val lightColorPalette = AcornColors(
    layer3 = PhotonColors.LightGrey20,
    layerGradientStart = PhotonColors.Violet70,
    layerGradientEnd = PhotonColors.Violet60,
    formDefault = PhotonColors.DarkGrey90,
    textOnColorPrimary = PhotonColors.LightGrey05,
    iconOnColor = PhotonColors.LightGrey05,
    ripple = PhotonColors.Black,
    tabActive = PhotonColors.LightGrey10,
    tabInactive = PhotonColors.LightGrey20,
    information = PhotonColors.Blue60,
    informationContainer = PhotonColors.Blue50A44,
    onInformationContainer = PhotonColors.DarkGrey90,
    success = PhotonColors.Green80,
    warning = PhotonColors.Yellow80,
    warningContainer = PhotonColors.Yellow20,
    onWarningContainer = PhotonColors.DarkGrey90,
    surfaceDimVariant = PhotonColors.LightGrey20,
)

val privateColorPalette = darkColorPalette.copy(
    layer3 = PhotonColors.Ink90,
    tabActive = PhotonColors.Purple60,
    tabInactive = PhotonColors.Ink90,
    surfaceDimVariant = PhotonColors.Ink90,
)

@Suppress("LongParameterList")
private fun buildColorScheme(
    primary: Color,
    primaryContainer: Color,
    inversePrimary: Color,
    secondary: Color,
    secondaryContainer: Color,
    tertiary: Color,
    tertiaryContainer: Color,
    surface: Color,
    onSurface: Color,
    surfaceTint: Color,
    inverseSurface: Color,
    inverseOnSurface: Color,
    error: Color,
    errorContainer: Color,
    outline: Color,
    outlineVariant: Color,
    scrim: Color,
    surfaceBright: Color,
    surfaceDim: Color,
    surfaceContainer: Color,
    surfaceContainerHigh: Color,
    surfaceContainerHighest: Color,
    surfaceContainerLow: Color,
    surfaceContainerLowest: Color,
): ColorScheme = ColorScheme(
    primary = primary,
    onPrimary = inverseOnSurface,
    primaryContainer = primaryContainer,
    onPrimaryContainer = onSurface,
    inversePrimary = inversePrimary,
    secondary = secondary,
    onSecondary = inverseOnSurface,
    secondaryContainer = secondaryContainer,
    onSecondaryContainer = onSurface,
    tertiary = tertiary,
    onTertiary = inverseOnSurface,
    tertiaryContainer = tertiaryContainer,
    onTertiaryContainer = onSurface,
    background = surface,
    onBackground = onSurface,
    surface = surface,
    onSurface = onSurface,
    surfaceVariant = surfaceContainerHighest,
    onSurfaceVariant = secondary,
    surfaceTint = surfaceTint,
    inverseSurface = inverseSurface,
    inverseOnSurface = inverseOnSurface,
    error = error,
    onError = inverseOnSurface,
    errorContainer = errorContainer,
    onErrorContainer = onSurface,
    outline = outline,
    outlineVariant = outlineVariant,
    scrim = scrim,
    surfaceBright = surfaceBright,
    surfaceDim = surfaceDim,
    surfaceContainer = surfaceContainer,
    surfaceContainerHigh = surfaceContainerHigh,
    surfaceContainerHighest = surfaceContainerHighest,
    surfaceContainerLow = surfaceContainerLow,
    surfaceContainerLowest = surfaceContainerLowest,
    primaryFixed = PhotonColors.Violet05,
    primaryFixedDim = primaryContainer,
    onPrimaryFixed = PhotonColors.DarkGrey90,
    onPrimaryFixedVariant = inverseOnSurface,
    secondaryFixed = secondaryContainer,
    secondaryFixedDim = secondaryContainer,
    onSecondaryFixed = onSurface,
    onSecondaryFixedVariant = inverseOnSurface,
    tertiaryFixed = tertiaryContainer,
    tertiaryFixedDim = tertiaryContainer,
    onTertiaryFixed = onSurface,
    onTertiaryFixedVariant = inverseOnSurface,
)

/**
 * Returns a dark Material color scheme mapped from Acorn.
 */
fun acornDarkColorScheme(): ColorScheme = buildColorScheme(
    primary = PhotonColors.Violet10,
    primaryContainer = PhotonColors.Violet80,
    inversePrimary = PhotonColors.Violet70,
    secondary = PhotonColors.LightGrey40,
    secondaryContainer = Color(0xFF4B3974),
    tertiary = PhotonColors.Violet20,
    tertiaryContainer = PhotonColors.Pink80,
    surface = PhotonColors.DarkGrey60,
    onSurface = PhotonColors.LightGrey05,
    surfaceTint = PhotonColors.LightGrey05A34,
    inverseSurface = PhotonColors.LightGrey40,
    inverseOnSurface = PhotonColors.DarkGrey90,
    error = PhotonColors.Red20,
    errorContainer = PhotonColors.Red80,
    outline = PhotonColors.LightGrey80,
    outlineVariant = PhotonColors.DarkGrey05,
    scrim = PhotonColors.DarkGrey90A95,
    surfaceBright = PhotonColors.DarkGrey40,
    surfaceDim = PhotonColors.DarkGrey80,
    surfaceContainer = PhotonColors.DarkGrey60,
    surfaceContainerHigh = PhotonColors.DarkGrey50,
    surfaceContainerHighest = PhotonColors.DarkGrey40,
    surfaceContainerLow = PhotonColors.DarkGrey70,
    surfaceContainerLowest = PhotonColors.DarkGrey80,
)

/**
 * Returns a light Material color scheme mapped from Acorn.
 */
fun acornLightColorScheme(): ColorScheme = buildColorScheme(
    primary = PhotonColors.Ink20,
    primaryContainer = PhotonColors.Violet05,
    inversePrimary = PhotonColors.Violet20,
    secondary = PhotonColors.DarkGrey05,
    secondaryContainer = Color(0xFFE6E0F5),
    tertiary = PhotonColors.Violet70,
    tertiaryContainer = PhotonColors.Pink05,
    surface = PhotonColors.LightGrey10,
    onSurface = PhotonColors.DarkGrey90,
    surfaceTint = PhotonColors.DarkGrey05A43,
    inverseSurface = PhotonColors.DarkGrey60,
    inverseOnSurface = PhotonColors.LightGrey05,
    error = PhotonColors.Red70,
    errorContainer = PhotonColors.Red10,
    outline = PhotonColors.LightGrey90,
    outlineVariant = PhotonColors.LightGrey30,
    scrim = PhotonColors.DarkGrey30A95,
    surfaceBright = PhotonColors.White,
    surfaceDim = PhotonColors.LightGrey30,
    surfaceContainer = PhotonColors.LightGrey10,
    surfaceContainerHigh = PhotonColors.LightGrey20,
    surfaceContainerHighest = PhotonColors.LightGrey30,
    surfaceContainerLow = PhotonColors.LightGrey05,
    surfaceContainerLowest = PhotonColors.White,
)

/**
 * Returns a private Material color scheme mapped from Acorn.
 */
fun acornPrivateColorScheme(): ColorScheme = buildColorScheme(
    primary = PhotonColors.Violet10,
    primaryContainer = PhotonColors.Violet80,
    inversePrimary = PhotonColors.Violet70,
    secondary = PhotonColors.LightGrey40,
    secondaryContainer = Color(0xFF4B3974),
    tertiary = PhotonColors.Violet20,
    tertiaryContainer = PhotonColors.Pink80,
    surface = Color(0xFF342B4A),
    onSurface = PhotonColors.LightGrey05,
    surfaceTint = PhotonColors.Violet60,
    inverseSurface = PhotonColors.LightGrey40,
    inverseOnSurface = PhotonColors.DarkGrey90,
    error = PhotonColors.Red20,
    errorContainer = PhotonColors.Red80,
    outline = PhotonColors.LightGrey80,
    outlineVariant = PhotonColors.DarkGrey05,
    scrim = PhotonColors.DarkGrey90A95,
    surfaceBright = Color(0xFF413857),
    surfaceDim = PhotonColors.Ink90,
    surfaceContainer = Color(0xFF342B4A),
    surfaceContainerHigh = Color(0xFF3B3251),
    surfaceContainerHighest = Color(0xFF413857),
    surfaceContainerLow = Color(0xFF281C3D),
    surfaceContainerLowest = PhotonColors.Ink90,
)

// M3 color scheme extensions

/**
 * @see AcornColors.information
 */
val ColorScheme.information: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.information

/**
 * @see AcornColors.informationContainer
 */
val ColorScheme.informationContainer: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.informationContainer

/**
 * @see AcornColors.onInformationContainer
 */
val ColorScheme.onInformationContainer: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.onInformationContainer

/**
 * @see AcornColors.success
 */
val ColorScheme.success: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.success

/**
 * @see AcornColors.warning
 */
val ColorScheme.warning: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.warning

/**
 * @see AcornColors.warningContainer
 */
val ColorScheme.warningContainer: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.warningContainer

/**
 * @see AcornColors.onWarningContainer
 */
val ColorScheme.onWarningContainer: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.onWarningContainer

/**
 * @see AcornColors.surfaceDimVariant
 */
val ColorScheme.surfaceDimVariant: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.surfaceDimVariant
