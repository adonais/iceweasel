/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.selectors

import mozilla.components.feature.downloads.R as downloadsR
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.snackbar.SNACKBAR_BUTTON_TEST_TAG
import org.mozilla.fenix.downloads.listscreen.DownloadsListTestTag
import org.mozilla.fenix.helpers.DataGenerationHelper.getStringResource
import org.mozilla.fenix.ui.efficiency.helpers.PageReadinessProfiles
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorContainer
import org.mozilla.fenix.ui.efficiency.helpers.SelectorGroup
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object DownloadsSelectors : SelectorContainer {
    enum class Group : SelectorGroup {
        EMPTY_DOWNLOADS,
        DOWNLOAD_DIALOG,
        DOWNLOAD_COMPLETE_SNACKBAR,
        DOWNLOAD_IN_PROGRESS_SNACKBAR,
        DOWNLOAD_LINKS,
        DOWNLOADS_LIST,
    }

    val DOWNLOADS_TOOLBAR_TITLE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.library_downloads),
            description = "Downloads toolbar title",
            readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
        )

    val DOWNLOADS_SETTINGS_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = getStringResource(R.string.download_navigate_settings_description),
            description = "Downloads settings button",
            readiness = PageReadinessProfiles.IDENTITY_ANCHOR,
        )

    val NAVIGATE_BACK_TOOLBAR_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_CONTENT_DESCRIPTION,
            value = getStringResource(R.string.download_navigate_back_description),
            description = "Navigate back toolbar button",
        )

    val EMPTY_DOWNLOADS_MESSAGE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.download_empty_message_2),
            description = "No downloads yet message",
            groups = setOf(Group.EMPTY_DOWNLOADS),
        )

    val EMPTY_DOWNLOADS_DESCRIPTION =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.download_empty_description),
            description = "Files you download will appear here description",
            groups = setOf(Group.EMPTY_DOWNLOADS),
        )

    val DOWNLOAD_DIALOG_TITLE =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT_SUBSTRING,
            value = getStringResource(downloadsR.string.mozac_feature_downloads_dialog_title_with_unknown_size),
            description = "Download dialog title",
            groups = setOf(Group.DOWNLOAD_DIALOG),
        )

    // Device-level tap, not a Compose click. The confirm control is a FilledButton with no testTag
    // (RenameAndChangeLocationDialogContent.DialogActionButtons), so its label is the only handle — and
    // every Compose-side variant (unmerged, merged, merged+hasClickAction) resolves a node and reports
    // a successful click while the dialog stays open. A UiObject2 tap goes through a different
    // injection path entirely: a real touch at the button's on-screen position.
    val DOWNLOAD_DIALOG_CONFIRM_BUTTON =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR2_BY_TEXT,
            value = getStringResource(downloadsR.string.mozac_feature_downloads_dialog_download),
            description = "Download dialog confirm button",
            groups = setOf(Group.DOWNLOAD_DIALOG),
        )

    val DOWNLOAD_DIALOG_CANCEL_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(downloadsR.string.mozac_feature_downloads_dialog_cancel),
            description = "Download dialog cancel button",
            groups = setOf(Group.DOWNLOAD_DIALOG),
        )

    val DOWNLOAD_COMPLETE_SNACKBAR =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.download_completed_snackbar),
            description = "Download complete snackbar",
            groups = setOf(Group.DOWNLOAD_COMPLETE_SNACKBAR),
        )

    // Shown after starting a large download that keeps transferring, instead of the completion
    // snackbar. Used to confirm the download started and, once gone, that it stopped covering the page.
    val DOWNLOAD_IN_PROGRESS_SNACKBAR =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.download_in_progress_snackbar),
            description = "Download in progress snackbar",
            groups = setOf(Group.DOWNLOAD_IN_PROGRESS_SNACKBAR),
        )

    val DOWNLOAD_SNACK_BAR_OPEN_BUTTON =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = SNACKBAR_BUTTON_TEST_TAG,
            description = "Download complete snackbar Open button",
            groups = setOf(Group.DOWNLOAD_COMPLETE_SNACKBAR),
        )

    // The tag above proves "the snackbar has an action button"; legacy also asserted the action READS
    // "Open" (DownloadRobot.verifyDownloadCompleteSnackbar). Keep both so the label stays covered.
    val DOWNLOAD_SNACK_BAR_OPEN_ACTION_LABEL =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TEXT,
            value = getStringResource(R.string.download_completed_snackbar_action_open),
            description = "Download complete snackbar 'Open' action label",
            groups = setOf(Group.DOWNLOAD_COMPLETE_SNACKBAR),
        )

    /**
     * The download link for [fileName] on a downloads test page.
     *
     * Content-description, NOT text: each link renders as a pair of nodes — a clickable one carrying `desc="Download
     * <fileName>"` and a sibling text node with the same string that is not clickable. A textContains match lands on
     * the text node, which is not clickable at all.
     *
     * UiObject2 (not the UiSelector variant) because clicking the link opens the download dialog only after a network
     * round-trip: UiObject's clickAndSync reports failure if no window update arrives within ~5.5s, so a
     * slow-but-landed click looks identical to a miss. A dump at one such "failure" showed the link holding input focus
     * — the tap had worked. Waiting is the caller's job here.
     */
    @Suppress("FunctionName")
    fun DOWNLOAD_LINK(fileName: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR2_BY_DESCRIPTION_CONTAINS,
            value = fileName,
            description = "Download link for: $fileName",
            groups = setOf(Group.DOWNLOAD_LINKS),
        )

    // --- Downloads list rows (Compose; keyed off DownloadsListTestTag in main source) ---

    /** The Downloads-list row for [fileName]; the screen tags each row with the file name. */
    @Suppress("FunctionName")
    fun DOWNLOADED_FILE_LIST_ITEM(fileName: String = "") =
        Selector(
            strategy = SelectorStrategy.COMPOSE_BY_TAG,
            value = "${DownloadsListTestTag.DOWNLOADS_LIST_ITEM}.$fileName",
            description = "Downloads list row: $fileName",
            groups = setOf(Group.DOWNLOADS_LIST),
        )

    /**
     * A file name rendered anywhere on the device — used for the two places legacy asserted the name outside the
     * Downloads list: the download link on the test page and the completion snackbar. Device-level because the
     * snackbar's file-name node is not reliably in the Compose tree.
     */
    @Suppress("FunctionName")
    fun FILE_NAME_TEXT(fileName: String = "") =
        Selector(
            strategy = SelectorStrategy.UIAUTOMATOR_WITH_TEXT_CONTAINS,
            value = fileName,
            description = "Text containing the file name: $fileName",
            groups = setOf(Group.DOWNLOAD_COMPLETE_SNACKBAR),
        )
}
