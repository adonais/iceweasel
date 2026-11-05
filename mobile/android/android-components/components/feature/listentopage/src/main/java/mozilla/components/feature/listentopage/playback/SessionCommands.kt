/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage.playback

import android.app.PendingIntent
import android.os.Bundle
import androidx.core.os.BundleCompat
import androidx.core.os.bundleOf

// The commands of ours that the session takes, beyond media3's player commands, and the keys of their arguments.

/** Sent by the app to say which tab tapping the notification opens. */
internal const val COMMAND_SET_SESSION_ACTIVITY = "mozilla.components.feature.listentopage.SET_SESSION_ACTIVITY"

/** Sent by the app with how long the whole article lasts, in [KEY_DURATION_MS]. */
internal const val COMMAND_SET_ARTICLE_DURATION = "mozilla.components.feature.listentopage.SET_ARTICLE_DURATION"

/** Sent by the app to stop the audio and show [KEY_POSITION_MS] until the chunk a seek needs has been made. */
internal const val COMMAND_STOP_AND_BUFFER_AT = "mozilla.components.feature.listentopage.STOP_AND_BUFFER_AT"

/** Sent by the app to stop the audio where a seek finished the article, and show [KEY_POSITION_MS], its end. */
internal const val COMMAND_FINISH_AT = "mozilla.components.feature.listentopage.FINISH_AT"

/**
 * Sent by the session to the app with the position into the article the notification asked for, in [KEY_POSITION_MS].
 */
internal const val COMMAND_SEEK_ARTICLE = "mozilla.components.feature.listentopage.SEEK_ARTICLE"

/** The command the speed control sends, which no player command of media3's covers. */
internal const val ACTION_CYCLE_SPEED = "mozilla.components.feature.listentopage.CYCLE_SPEED"

internal const val KEY_POSITION_MS = "mozilla.components.feature.listentopage.POSITION_MS"
internal const val KEY_DURATION_MS = "mozilla.components.feature.listentopage.DURATION_MS"
private const val KEY_SESSION_ACTIVITY = "mozilla.components.feature.listentopage.SESSION_ACTIVITY"

internal fun PendingIntent?.toSessionActivityArgs(): Bundle = bundleOf(KEY_SESSION_ACTIVITY to this)

internal fun Bundle.sessionActivity(): PendingIntent? =
    BundleCompat.getParcelable(this, KEY_SESSION_ACTIVITY, PendingIntent::class.java)
