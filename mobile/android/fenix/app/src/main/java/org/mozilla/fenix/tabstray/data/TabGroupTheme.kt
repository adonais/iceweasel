/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.data

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Value class representing the possible themes for Tab Groups.
 **/
enum class TabGroupTheme {
    Yellow {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.yellow.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.yellow.onPrimary
    },

    Orange {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.orange.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.orange.onPrimary
    },

    Red {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.red.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.red.onPrimary
    },

    Pink {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.pink.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.pink.onPrimary
    },

    Purple {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.purple.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.purple.onPrimary
    },

    Violet {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.violet.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.violet.onPrimary
    },

    Blue {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.blue.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.blue.onPrimary
    },

    Cyan {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.cyan.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.cyan.onPrimary
    },

    Green {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.green.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.green.onPrimary
    },

    Grey {
        override val primary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.grey.primary

        override val onPrimary: Color
            @Composable get() = FirefoxTheme.tabGroupColors.grey.onPrimary
    }, ;

    /**
     * The primary color of the tab group.
     **/
    @get:Composable
    abstract val primary: Color

    /**
     * The color of content displayed on top of [primary].
     **/
    @get:Composable
    abstract val onPrimary: Color

    companion object {
        /**
         * The color of content displayed on top of [primary].
         **/
        val default: TabGroupTheme = Yellow
    }
}
