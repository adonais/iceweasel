/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.engine.gecko.webnotifications

import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import mozilla.components.concept.engine.webnotifications.WebNotification
import mozilla.components.concept.engine.webnotifications.WebNotificationAction
import mozilla.components.concept.engine.webnotifications.WebNotificationDelegate
import org.mozilla.geckoview.WebNotification as GeckoViewWebNotification
import org.mozilla.geckoview.WebNotificationDelegate as GeckoViewWebNotificationDelegate

internal class GeckoWebNotificationDelegate(
    private val webNotificationDelegate: WebNotificationDelegate,
) : GeckoViewWebNotificationDelegate {
    override fun onShowNotification(webNotification: GeckoViewWebNotification) {
        val deferred = webNotificationDelegate.onShowNotification(
            webNotification.toWebNotification(),
        )
        MainScope().launch {
            val succeeded = deferred.await()
            if (succeeded) {
                webNotification.show()
            } else {
                webNotification.dismiss()
            }
        }
    }

    override fun onCloseNotification(webNotification: GeckoViewWebNotification) {
        webNotificationDelegate.onCloseNotification(webNotification.toWebNotification())
    }

    private fun GeckoViewWebNotification.toWebNotification(): WebNotification {
        return WebNotification(
            title = title,
            tag = tag,
            body = text,
            sourceUrl = source,
            iconUrl = imageUrl,
            direction = textDirection,
            lang = lang,
            requireInteraction = requireInteraction,
            triggeredByWebExtension = source == null,
            privateBrowsing = privateBrowsing,
            engineNotification = this@toWebNotification,
            silent = silent,
            actions = actions.map { WebNotificationAction(name = it.name, title = it.title) }.toTypedArray(),
        )
    }
}
