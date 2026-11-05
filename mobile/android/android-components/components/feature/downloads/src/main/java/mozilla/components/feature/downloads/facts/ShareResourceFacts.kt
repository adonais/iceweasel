/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.downloads.facts

import mozilla.components.browser.state.state.content.ShareResourceState
import mozilla.components.support.base.Component
import mozilla.components.support.base.facts.Action
import mozilla.components.support.base.facts.Fact
import mozilla.components.support.base.facts.collect
import mozilla.components.support.utils.INTENT_TYPE_PDF

/** Facts emitted for telemetry related to the ShareResourceFeature. */
class ShareResourceFacts {
    /** Specific types of telemetry items. */
    object Items {
        const val SHARE_DURATION = "share_duration"
        const val SHARE_FAILED = "share_failed"
    }

    /** Keys used to record metadata about [Items]. */
    object MetadataKeys {
        /** How long it takes the share sheet to populate. */
        const val DURATION_MS = "duration_ms"

        /** The type of content shared. [ShareContentType] will be used to populate this value. */
        const val CONTENT_TYPE = "content_type"

        /** The way the shared item bytes were obtained. [ShareType] will be used to populate this value. */
        const val SHARE_TYPE = "share_type"

        /** The reason share failed. [FailureReason] will be used to populate this value. */
        const val FAILURE_REASON = "failure_reason"
    }

    /** The way the object was shared. */
    object ShareType {
        /** The shared item's bytes were directly used. */
        const val DIRECT = "direct"

        /** The shared item's bytes were retrieved from the URL. */
        const val INTERNET = "internet"

        /** The shared item was a local resource. */
        const val LOCAL = "local"
    }

    /** The type of object shared. */
    object ShareContentType {
        /** The shared item is a PDF. */
        const val PDF = "pdf"

        /** The shared item is something else. */
        const val OTHER = "other"
    }

    /** Why sharing did not finish. */
    object FailureReason {
        /** Obtaining the shared item's bytes took longer than allowed. */
        const val TIMEOUT = "timeout"

        /** Sharing was cancelled, such as a navigation away. */
        const val CANCELLED = "cancelled"

        /** Sharing failed with an error. */
        const val ERROR = "error"
    }
}

internal fun emitShareDurationFact(shareState: ShareResourceState, durationMs: Long) {
    Fact(
            component = Component.FEATURE_DOWNLOADS,
            action = Action.IMPLEMENTATION_DETAIL,
            item = ShareResourceFacts.Items.SHARE_DURATION,
            metadata =
                mapOf(
                    ShareResourceFacts.MetadataKeys.SHARE_TYPE to shareType(shareState),
                    ShareResourceFacts.MetadataKeys.CONTENT_TYPE to shareContentType(shareState),
                    ShareResourceFacts.MetadataKeys.DURATION_MS to durationMs,
                ),
        )
        .collect()
}

internal fun emitShareFailedFact(shareState: ShareResourceState, failureReason: String) {
    Fact(
            component = Component.FEATURE_DOWNLOADS,
            action = Action.IMPLEMENTATION_DETAIL,
            item = ShareResourceFacts.Items.SHARE_FAILED,
            metadata =
                mapOf(
                    ShareResourceFacts.MetadataKeys.SHARE_TYPE to shareType(shareState),
                    ShareResourceFacts.MetadataKeys.CONTENT_TYPE to shareContentType(shareState),
                    ShareResourceFacts.MetadataKeys.FAILURE_REASON to failureReason,
                ),
        )
        .collect()
}

private fun shareType(shareState: ShareResourceState) =
    when (shareState) {
        is ShareResourceState.DirectResource -> ShareResourceFacts.ShareType.DIRECT
        is ShareResourceState.InternetResource -> ShareResourceFacts.ShareType.INTERNET
        is ShareResourceState.LocalResource -> ShareResourceFacts.ShareType.LOCAL
    }

private fun shareContentType(shareState: ShareResourceState) =
    when (shareState.contentType) {
        INTENT_TYPE_PDF -> ShareResourceFacts.ShareContentType.PDF
        else -> ShareResourceFacts.ShareContentType.OTHER
    }
