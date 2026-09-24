/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.navigation

@JvmInline
value class NavigationNodeId(val value: String) {
    init {
        require(namePattern.matches(value)) { "Invalid navigation node identity: '$value'" }
    }

    override fun toString(): String = value

    private companion object {
        val namePattern = Regex("[A-Z][A-Za-z0-9]*")
    }
}

@JvmInline
value class NavigationRouteId(val value: String) {
    init {
        require(value.isNotBlank()) { "Navigation route identity cannot be blank" }
    }

    override fun toString(): String = value
}

@JvmInline
value class NavigationRouteVariant(val value: String) {
    init {
        require(namePattern.matches(value)) { "Invalid navigation route variant: '$value'" }
    }

    override fun toString(): String = value

    private companion object {
        val namePattern = Regex("[a-z][a-z0-9-]*")
    }
}

enum class NavigationNodeKind {
    PAGE,
    ENTRY,
    EXTERNAL_SURFACE,
}

data class NavigationNode(
    val id: NavigationNodeId,
    val kind: NavigationNodeKind,
)

object NavigationNodes {
    val APP_ENTRY = NavigationNode(NavigationNodeId("AppEntry"), NavigationNodeKind.ENTRY)
    val GOOGLE_PLAY = NavigationNode(NavigationNodeId("GooglePlayPage"), NavigationNodeKind.EXTERNAL_SURFACE)
}
