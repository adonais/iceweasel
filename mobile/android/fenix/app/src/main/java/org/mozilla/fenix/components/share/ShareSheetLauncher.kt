/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.share

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.chooser.ChooserAction
import androidx.annotation.RequiresApi
import androidx.navigation.NavController
import androidx.navigation.NavOptions
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.components.browser.state.action.ShareResourceAction
import mozilla.components.browser.state.state.content.ShareResourceState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.prompt.ShareData
import mozilla.components.support.ktx.android.content.share
import mozilla.components.support.ktx.android.content.shareWithChooserActions
import mozilla.components.support.ktx.kotlin.isContentUrl
import mozilla.components.support.ktx.kotlin.trimmed
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.MenuDialogFragmentDirections
import org.mozilla.fenix.components.menu.share.QRCodeGenerator
import org.mozilla.fenix.ext.nav
import mozilla.components.ui.icons.R as iconsR

internal const val SAVE_PDF_ACTION = "org.mozilla.fenix.ACTION_SAVE_TO_PDF"
internal const val PRINT_ACTION = "org.mozilla.fenix.ACTION_PRINT"
internal const val TAB_ID_KEY = "tabID"
internal const val SEND_TO_DEVICES_ACTION = "org.mozilla.fenix.ACTION_SEND_TO_DEVICES"
internal const val QR_CODE_URI_KEY = "qr_code_uri"

/**
 * Delegate interface to abstract away the share implementation, allowing for easier testing and
 * separation of concerns.
 */
interface ShareDelegate {
    /** Basic share function to invoke the native share sheet without any additional chooser actions.
     * @param text The text to share, typically the URL of the page.
     * @param subject The subject of the share, typically the title of the page.
     */
    fun share(text: String, subject: String)

    /** Share function to invoke the native share sheet with additional chooser actions for API 34+.
     * @param text The text to share, typically the URL of the page.
     * @param subject The subject of the share, typically the title of the page.
     * @param actions An array of [ChooserAction] that will be added to the share intent chooser.
     */
    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    fun shareWithChooserActions(text: String, subject: String, actions: Array<ChooserAction>)
}

private class ContextShareDelegate(private val getContext: () -> Context) : ShareDelegate {
    override fun share(text: String, subject: String) {
        getContext().share(text = text, subject = subject)
    }

    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    override fun shareWithChooserActions(text: String, subject: String, actions: Array<ChooserAction>) {
        getContext().shareWithChooserActions(text = text, subject = subject, actions = actions)
    }
}

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
     * @param longUrl The url to share.
     * @param title The title of the page to share.
     * @param isPrivate Whether the tab is in private browsing mode.
     * @param isCustomTab Whether the share is being initiated from a custom tab,
     * used to determine the correct destination to pop up to when navigating to the share fragment.
     */
    fun showNativeShareSheet(
        id: String?,
        longUrl: String,
        title: String?,
        isPrivate: Boolean = false,
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
 * @param homeActivityClass The [Class] of the activity used to handle send-to-devices and display QR codes.
 * @param qrCodeGenerator [org.mozilla.fenix.components.menu.share.QRCodeGenerator] used to generate QR codes for URLs.
 * @param cacheHelper used to store image in cache
 * @param scope [CoroutineScope] used to dispatch QR code generation off the main thread.
 * @param ioDispatcher [CoroutineDispatcher] used for IO-bound QR code generation work.
 * @param shareDelegate [ShareDelegate] used to invoke share actions.
 */
class ShareSheetLauncherImpl(
    private val browserStore: BrowserStore,
    private val navController: NavController,
    private val onDismiss: () -> Unit,
    private val homeActivityClass: Class<out Activity>,
    private val qrCodeGenerator: QRCodeGenerator = QRCodeGenerator(),
    private val cacheHelper: CacheHelper = CacheHelper(),
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val shareDelegate: ShareDelegate = ContextShareDelegate { navController.context },
) : ShareSheetLauncher {

    companion object {
        private const val PRINT_REQUEST_CODE_OFFSET = 1
        private const val SEND_TO_DEVICES_REQUEST_CODE_OFFSET = 2
        private const val QR_CODE_REQUEST_CODE_OFFSET = 3
    }

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
     * @param longUrl The url to share.
     * @param title The title of the page to share.
     * @param isPrivate Whether the tab is in private browsing mode.
     * @param isCustomTab Whether the share is being initiated from a custom tab.
     */
    override fun showNativeShareSheet(
        id: String?,
        longUrl: String,
        title: String?,
        isPrivate: Boolean,
        isCustomTab: Boolean,
    ) {
        val displayUrl = longUrl.trimmed()
        val context = navController.context
        dismissMenu(title, displayUrl, id, isCustomTab)
        if (id != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            scope.launch {
                val qrCodeAction = withContext(ioDispatcher) {
                    sendQRCodeChooserAction(context, id, displayUrl)
                }
                shareDelegate.shareWithChooserActions(
                    text = displayUrl,
                    subject = title ?: "",
                    actions = arrayOf(
                        savePDFChooserAction(context, id),
                        printAction(context, id),
                        sendToDevicesAction(context, id, longUrl, title, isPrivate),
                        qrCodeAction,
                    ),
                )
            }
        } else {
            shareDelegate.share(text = displayUrl, subject = title ?: "")
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
     * Create a [ChooserAction] for sending the current tab to other devices.
     *
     * @param context The context used to create intents.
     * @param id The session ID of the tab to send.
     * @param url The URL of the tab to send.
     * @param title The title of the tab to send.
     * @param isPrivate Whether the tab is in private browsing mode.
     * @return A [ChooserAction] that can be added to the share intent chooser.
     */
    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private fun sendToDevicesAction(
        context: Context,
        id: String,
        url: String,
        title: String?,
        isPrivate: Boolean,
    ): ChooserAction {
        val icon = Icon.createWithResource(context, iconsR.drawable.mozac_ic_device_desktop_send_24)

        val actionIntent = Intent(context, homeActivityClass).apply {
            action = SEND_TO_DEVICES_ACTION
            putExtra(SendToDevicesDialogFragment.EXTRA_URL, url)
            putExtra(SendToDevicesDialogFragment.EXTRA_TITLE, title)
            putExtra(
                SendToDevicesDialogFragment.EXTRA_PRIVACY,
                if (isPrivate) {
                    SendToDevicesDialogFragment.PRIVACY_PRIVATE
                } else {
                    SendToDevicesDialogFragment.PRIVACY_NORMAL
                },
            )
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            id.hashCode() + SEND_TO_DEVICES_REQUEST_CODE_OFFSET,
            actionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return ChooserAction.Builder(
            icon,
            context.getString(R.string.share_device_subheader),
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
            id.hashCode() + PRINT_REQUEST_CODE_OFFSET,
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
     * Create a [ChooserAction] that generates and displays a QR code for the given URL.
     *
     * @param context The context used to create intents and notifications.
     * @param id The session ID of the tab, used to compute the unique request code.
     * @param url The URL to generate a QR code for.
     * @return A [ChooserAction] that can be added to the share intent chooser.
     */
    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private fun sendQRCodeChooserAction(context: Context, id: String, url: String): ChooserAction {
        val qrCodeBitmap = qrCodeGenerator.generateQRCodeImage(url, 300, 300, context)
        val qrCodeUri = cacheHelper.saveBitmapToCache(context, qrCodeBitmap, url.hashCode().toString())
        val icon = Icon.createWithResource(context, iconsR.drawable.mozac_ic_qr_code_24)

        val displayIntent = Intent(context, homeActivityClass).apply {
            putExtra(QR_CODE_URI_KEY, qrCodeUri.toString())
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            id.hashCode() + QR_CODE_REQUEST_CODE_OFFSET,
            displayIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return ChooserAction.Builder(
            icon,
            context.getString(R.string.share_qr_code),
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
        val direction = MenuDialogFragmentDirections.actionGlobalShareFragment(
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
