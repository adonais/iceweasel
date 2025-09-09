/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.ui

import android.app.Dialog
import android.content.DialogInterface
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.ui.platform.ComposeView
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import org.mozilla.fenix.R
import org.mozilla.fenix.components.lazyStore
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.settings.SupportUtils
import org.mozilla.fenix.termsofuse.store.DefaultTermsOfUsePromptRepository
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptAction
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptPreferencesMiddleware
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptStore
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * [BottomSheetDialogFragment] wrapper for the compose [TermsOfUseBottomSheet]
 */
class TermsOfUseBottomSheetFragment : BottomSheetDialogFragment() {

    private val termsOfUsePromptStore by lazyStore {
        TermsOfUsePromptStore(
            middleware = listOf(
                TermsOfUsePromptPreferencesMiddleware(
                    repository = DefaultTermsOfUsePromptRepository(
                        settings = requireContext().settings(),
                    ),
                ),
            ),
        )
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog =
        super.onCreateDialog(savedInstanceState).apply {
            window?.setDimAmount(0f)
            setOnShowListener {
                val bottomSheet = findViewById<View?>(R.id.design_bottom_sheet)
                bottomSheet?.setBackgroundResource(android.R.color.transparent)
            }
        }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = ComposeView(requireContext()).apply {
        setContent {
            FirefoxTheme {
                TermsOfUseBottomSheet(
                    store = termsOfUsePromptStore,
                    onDismiss = {
                        dismiss()
                    },
                    onTermsOfUseClicked = {
                        SupportUtils.launchSandboxCustomTab(
                            context,
                            SupportUtils.getMozillaPageUrl(SupportUtils.MozillaPage.TERMS_OF_SERVICE),
                        )
                    },
                    onPrivacyNoticeClicked = {
                        SupportUtils.launchSandboxCustomTab(
                            context,
                            SupportUtils.getMozillaPageUrl(SupportUtils.MozillaPage.PRIVATE_NOTICE),
                        )
                    },
                    onLearnMoreClicked = {
                        SupportUtils.launchSandboxCustomTab(
                            context,
                            SupportUtils.getSumoURLForTopic(
                                context,
                                SupportUtils.SumoTopic.TERMS_OF_USE,
                                useMobilePage = false,
                            ),
                        )
                    },
                )
            }
        }
    }

    override fun onDismiss(dialog: DialogInterface) {
        super.onDismiss(dialog)
        termsOfUsePromptStore.dispatch(TermsOfUsePromptAction.OnPromptDismissed)
    }
}
