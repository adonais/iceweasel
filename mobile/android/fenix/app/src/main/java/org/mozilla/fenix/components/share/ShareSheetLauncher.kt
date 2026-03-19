/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.chooser.ChooserAction
import androidx.annotation.RequiresApi
import androidx.navigation.NavController
import androidx.navigation.NavOptions
import mozilla.components.browser.state.action.ShareResourceAction
import mozilla.components.browser.state.state.content.ShareResourceState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.prompt.ShareData
import mozilla.components.support.ktx.android.content.share
import mozilla.components.support.ktx.android.content.shareWithChooserActions
import mozilla.components.support.ktx.kotlin.isContentUrl
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuDialogFragmentDirections
import org.mozilla.fenix.ext.nav
import mozilla.components.ui.icons.R as iconsR

internal const val SAVE_PDF_ACTION = "org.mozilla.fenix.ACTION_SAVE_TO_PDF"
internal const val PRINT_ACTION = "org.mozilla.fenix.ACTION_PRINT"
internal const val TAB_ID_KEY = "tabID"

/**
 * Interface for handling share events and launching the appropriate share sheet.
 */
interface ShareSheetLauncher {

    /**
     * Show the custom share sheet for sharing resources within the app.
     * @param id The session id of the tab to share from.
     * @param url The url to share.
     * @param title The title of the page to share.
     * @param isCustomTab Whether the share is being initiated from a custom tab,
     * used to determine the correct destination to pop up to when navigating to the share fragment.
     */
    fun showCustomShareSheet(
        id: String?,
        url: String?,
        title: String?,
        isCustomTab: Boolean = false,
    )

    /**
     * Show the native share sheet for sharing resources outside of the app.
     * @param id The session id of the tab to share from.
     * @param url The url to share.
     * @param title The title of the page to share.
     * @param isCustomTab Whether the share is being initiated from a custom tab,
     * used to determine the correct destination to pop up to when navigating to the share fragment.
     */
    fun showNativeShareSheet(
        id: String?,
        url: String,
        title: String?,
        isCustomTab: Boolean = false,
    )
}

/**
 * Implementation for handling navigating share events, either to the native share sheet or
 * the custom share sheet.
 *
 * @param browserStore [BrowserStore] used to dispatch actions related to the menu state and access
 * the selected tab.
 * @param navController [NavController] used for navigation.
 * @param onDismiss Callback invoked to dismiss the menu dialog.
 */
class ShareSheetLauncherImpl(
    private val browserStore: BrowserStore,
    private val navController: NavController,
    private val onDismiss: () -> Unit,
) : ShareSheetLauncher {

    /**
     * Show the custom share sheet for sharing resources within the app.
     *
     * @param id The session id of the tab to share from.
     * @param url The url to share.
     * @param title The title of the page to share.
     * @param isCustomTab Whether the share is being initiated from a custom tab.
     */
    override fun showCustomShareSheet(
        id: String?,
        url: String?,
        title: String?,
        isCustomTab: Boolean,
    ) {
        if (url?.isContentUrl() == true) {
            browserStore.dispatch(
                ShareResourceAction.AddShareAction(
                    id ?: "",
                    ShareResourceState.LocalResource(url),
                ),
            )
            onDismiss()
        } else {
            dismissMenu(title, url, id, isCustomTab)
        }
    }

    /**
     * Show the native share sheet for sharing resources outside of the app.
     *
     * @param id The session id of the tab to share from.
     * @param url The url to share.
     * @param title The title of the page to share.
     * @param isCustomTab Whether the share is being initiated from a custom tab.
     */
    override fun showNativeShareSheet(
        id: String?,
        url: String,
        title: String?,
        isCustomTab: Boolean,
    ) {
        val context = navController.context
        dismissMenu(title, url, id, isCustomTab)
        if (id != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            context.shareWithChooserActions(
                text = url,
                subject = title ?: "",
                actions = arrayOf(
                    savePDFChooserAction(context, id),
                    printAction(context, id),
                ),
            )
        } else {
            context.share(text = url, subject = title ?: "")
        }
    }

    /**
     * Create a [ChooserAction] for saving the current page as a PDF.
     *
     * @param context The context used to create intents.
     * @param id The session ID of the tab to save as PDF.
     * @return A [ChooserAction] that can be added to the share intent chooser.
     */
    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private fun savePDFChooserAction(context: Context, id: String): ChooserAction {
        val icon = Icon.createWithResource(context, iconsR.drawable.mozac_ic_save_file_24)

        val actionIntent = Intent(context, SaveToPdfReceiver::class.java).apply {
            action = SAVE_PDF_ACTION
            putExtra(TAB_ID_KEY, id)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            actionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return ChooserAction.Builder(
            icon,
            context.getString(R.string.share_save_to_pdf),
            pendingIntent,
        ).build()
    }

    /**
     * Create a [ChooserAction] for printing the current page.
     *
     * @param context The context used to create intents.
     * @param id The session ID of the tab to print.
     * @return A [ChooserAction] that can be added to the share intent chooser.
     */
    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private fun printAction(context: Context, id: String): ChooserAction {
        val icon = Icon.createWithResource(context, iconsR.drawable.mozac_ic_print_24)

        val actionIntent = Intent(context, PrintReceiver::class.java).apply {
            action = PRINT_ACTION
            putExtra(TAB_ID_KEY, id)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            actionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return ChooserAction.Builder(
            icon,
            context.getString(R.string.menu_print),
            pendingIntent,
        ).build()
    }

    /**
     * Helper function to handle dismissing the menu and navigating to the share fragment with the
     * provided share data.
     * @param title The title of the page to share.
     * @param url The url to share.
     * @param id The session id of the tab to share from.
     * @param isCustomTab Whether the share is being initiated from a custom tab, used to determine
     * the correct destination to pop up to when navigating to the share fragment.
     */
    private fun dismissMenu(
        title: String?,
        url: String?,
        id: String?,
        isCustomTab: Boolean,
    ) {
        val shareData = ShareData(title = title, url = url)
        val direction =
            MenuDialogFragmentDirections.actionGlobalShareFragment(
                sessionId = id,
                data = arrayOf(shareData),
                showPage = true,
            )

        val popUpToId = if (isCustomTab) {
            R.id.externalAppBrowserFragment
        } else {
            R.id.browserFragment
        }

        navController.nav(
            R.id.menuDialogFragment,
            direction,
            navOptions = NavOptions.Builder()
                .setPopUpTo(popUpToId, false)
                .build(),
        )
    }
}
