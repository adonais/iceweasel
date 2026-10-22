/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.account

import android.content.Context
import androidx.appcompat.content.res.AppCompatResources
import androidx.core.graphics.drawable.RoundedBitmapDrawable
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import mozilla.components.concept.fetch.Client
import mozilla.components.concept.sync.Profile
import mozilla.components.support.ktx.android.content.pixelSizeFor
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.bitmapForUrl

/**
 * Updates the account preference with the current profile details and avatar.
 *
 * @param preference The account preference to update.
 * @param scope The coroutine scope used to load the avatar asynchronously.
 * @param httpClient The client used to fetch the avatar image.
 */
class AccountPreferenceUpdater(
    private val preference: AccountPreference,
    private val scope: CoroutineScope,
    private val httpClient: Client,
) {
    private var avatarJob: Job? = null

    /**
     * Updates the preference with the supplied profile details and avatar.
     *
     * @param context The context used to load and size drawables.
     * @param profile The account profile to display, or null when signed out.
     */
    fun update(context: Context, profile: Profile?) {
        preference.displayName = profile?.displayName
        preference.email = profile?.email

        avatarJob?.cancel()
        val avatarUrl = profile?.avatar?.url
        if (avatarUrl == null) {
            preference.icon = genericAvatar(context)
            return
        }

        avatarJob = scope.launch {
            preference.icon = toRoundedDrawable(avatarUrl, context) ?: genericAvatar(context)
        }
    }

    /** Cancels any in-progress avatar loading. */
    fun cancel() {
        avatarJob?.cancel()
    }

    private fun genericAvatar(context: Context) =
        AppCompatResources.getDrawable(context, iconsR.drawable.mozac_ic_avatar_circle_24)

    private suspend fun toRoundedDrawable(
        url: String,
        context: Context,
    ): RoundedBitmapDrawable? {
        val size = context.pixelSizeFor(R.dimen.preference_icon_drawable_size)
        return httpClient.bitmapForUrl(url, size, size)?.let { bitmap ->
            RoundedBitmapDrawableFactory.create(context.resources, bitmap).apply {
                isCircular = true
                setAntiAlias(true)
            }
        }
    }
}
