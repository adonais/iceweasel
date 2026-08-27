/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.remotesettings
/**
 * Enum class representing the Remote Settings server that the client should use.
 */
sealed class RemoteSettingsServer {
    /**
     * Object representing Production RemoteSettingsServer
     */
    object Prod : RemoteSettingsServer()

    /**
     * Object representing Stage RemoteSettingsServer
     */
    object Stage : RemoteSettingsServer()

    /**
     * Object representing Dev RemoteSettingsServer with v2 route
     */
    object Dev : RemoteSettingsServer()

    /**
     * Object representing Custom RemoteSettingsServer
     */
    data class Custom(val url: String) : RemoteSettingsServer()
}

/**
 * Convert [RemoteSettingsServer] into [mozilla.appservices.remotesettings.RemoteSettingsServer].
 */
fun RemoteSettingsServer.into(): mozilla.appservices.remotesettings.RemoteSettingsServer {
    return when (this) {
        RemoteSettingsServer.Dev -> mozilla.appservices.remotesettings.RemoteSettingsServer.Dev
        RemoteSettingsServer.Stage -> mozilla.appservices.remotesettings.RemoteSettingsServer.Stage
        RemoteSettingsServer.Prod -> mozilla.appservices.remotesettings.RemoteSettingsServer.Prod
        is RemoteSettingsServer.Custom -> mozilla.appservices.remotesettings.RemoteSettingsServer.Custom(this.url)
    }
}
