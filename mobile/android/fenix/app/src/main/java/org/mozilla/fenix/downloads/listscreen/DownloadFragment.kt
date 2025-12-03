/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.downloads.listscreen

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.compose.content
import androidx.navigation.fragment.findNavController
import mozilla.components.feature.downloads.AbstractFetchDownloadService
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.SupportedMenuNotifications
import org.mozilla.fenix.components.lazyStore
import org.mozilla.fenix.compose.snackbar.Snackbar
import org.mozilla.fenix.compose.snackbar.SnackbarState
import org.mozilla.fenix.downloads.getCannotOpenFileErrorMessage
import org.mozilla.fenix.downloads.listscreen.di.DownloadUIMiddlewareProvider
import org.mozilla.fenix.downloads.listscreen.store.DownloadUIAction
import org.mozilla.fenix.downloads.listscreen.store.DownloadUIState
import org.mozilla.fenix.downloads.listscreen.store.DownloadUIStore
import org.mozilla.fenix.downloads.listscreen.store.FileItem
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Fragment for displaying and managing the downloads list.
 */
class DownloadFragment : Fragment() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requireContext().applicationContext.components.appStore.dispatch(
            AppAction.MenuNotification.RemoveMenuNotification(
                SupportedMenuNotifications.Downloads,
            ),
        )
    }

    private val downloadStore by lazyStore { viewModelScope ->
        DownloadUIStore(
            initialState = DownloadUIState.INITIAL,
            middleware = DownloadUIMiddlewareProvider.provideMiddleware(
                coroutineScope = viewModelScope,
                applicationContext = requireContext().applicationContext,
            ),
        )
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View? = content {
        FirefoxTheme {
            DownloadsScreen(
                downloadsStore = downloadStore,
                onItemClick = { openItem(it) },
                onNavigationIconClick = {
                    if (downloadStore.state.mode is DownloadUIState.Mode.Editing) {
                        downloadStore.dispatch(DownloadUIAction.ExitEditMode)
                    } else {
                        this@DownloadFragment.findNavController().popBackStack()
                    }
                },
            )
        }
    }

    private fun openItem(item: FileItem) {
        context?.let {
            val canOpenFile = AbstractFetchDownloadService.openFile(
                applicationContext = it.applicationContext,
                packageName = it.applicationContext.packageName,
                downloadFileName = item.fileName,
                downloadFilePath = item.filePath,
                downloadContentType = item.contentType,
            )

            val rootView = view
            if (!canOpenFile && rootView != null) {
                Snackbar.make(
                    snackBarParentView = rootView,
                    snackbarState = SnackbarState(
                        message = getCannotOpenFileErrorMessage(
                            context = it,
                            filePath = item.filePath,
                        ),
                    ),
                ).show()
            }
        }
    }
}
