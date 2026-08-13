/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.intent

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.R

/**
 * Triggers the system uninstall dialog for the current application.
 * If the action fails, it falls back to displaying a Toast.
 */
fun Context.maybeTriggerDeviceUninstallPrompt() {
    val intent = Intent(Intent.ACTION_DELETE).apply {
        data = Uri.fromParts("package", packageName, null)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    try {
        startActivity(intent)
    } catch (e: ActivityNotFoundException) {
        Logger.error("Failed to trigger system uninstall prompt", e)

        Toast.makeText(this, R.string.uninstall_survey_error_failed, Toast.LENGTH_LONG).show()
    }
}
