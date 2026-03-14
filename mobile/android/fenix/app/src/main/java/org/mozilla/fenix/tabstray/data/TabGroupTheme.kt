/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.data

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import mozilla.components.compose.base.theme.information

/**
 * Value class representing the possible themes for Tab Groups.
 **/
enum class TabGroupTheme {
    Yellow {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.information

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
    },

    Orange {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.surface

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
    },

    Red {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.surface

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
    },

    Pink {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.surface

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
    },

    Purple {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.surface

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
    },

    Violet {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.surface

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
    },

    Blue {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.surface

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
    },

    Teal {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.surface

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
    },

    Green {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.surface

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
    },

    Gray {
        override val primary: Color
            @Composable get() = MaterialTheme.colorScheme.surface

        override val onPrimary: Color
            @Composable get() = MaterialTheme.colorScheme.onSurface
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
