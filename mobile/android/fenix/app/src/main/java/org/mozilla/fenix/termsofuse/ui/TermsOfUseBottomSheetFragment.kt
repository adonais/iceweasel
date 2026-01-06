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
import androidx.navigation.fragment.navArgs
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import mozilla.components.lib.state.helpers.StoreProvider.Companion.fragmentStore
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.settings.SupportUtils
import org.mozilla.fenix.termsofuse.store.DefaultTermsOfUsePromptRepository
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptAction
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptPreferencesMiddleware
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptState
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptStore
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptTelemetryMiddleware
import org.mozilla.fenix.theme.FirefoxTheme
import com.google.android.material.R as materialR

/**
 * [BottomSheetDialogFragment] wrapper for the compose [TermsOfUseBottomSheet].
 */
class TermsOfUseBottomSheetFragment : BottomSheetDialogFragment() {

    private val args by navArgs<TermsOfUseBottomSheetFragmentArgs>()

    private val termsOfUsePromptStore by fragmentStore(TermsOfUsePromptState) {
        TermsOfUsePromptStore(
            initialState = it,
            middleware = listOf(
                TermsOfUsePromptPreferencesMiddleware(
                    repository = DefaultTermsOfUsePromptRepository(
                        settings = requireContext().settings(),
                    ),
                ),
                TermsOfUsePromptTelemetryMiddleware(),
            ),
        )
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog =
        super.onCreateDialog(savedInstanceState).apply {
            setOnShowListener {
                val bottomSheet = findViewById<View?>(materialR.id.design_bottom_sheet)
                bottomSheet?.setBackgroundResource(android.R.color.transparent)

                termsOfUsePromptStore.dispatch(TermsOfUsePromptAction.OnImpression(args.surface))
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
                    showDragHandle = settings().shouldShowTermsOfUsePromptDragHandle,
                    onDismiss = { dismiss() },
                    onDismissRequest = {
                        termsOfUsePromptStore.dispatch(
                            TermsOfUsePromptAction.OnPromptManuallyDismissed(args.surface),
                        )

                        dismiss()
                    },
                    onAcceptClicked = {
                        termsOfUsePromptStore.dispatch(TermsOfUsePromptAction.OnAcceptClicked(args.surface))
                    },
                    onRemindMeLaterClicked = {
                        termsOfUsePromptStore.dispatch(
                            TermsOfUsePromptAction.OnRemindMeLaterClicked(args.surface),
                        )
                    },
                    onTermsOfUseClicked = {
                        termsOfUsePromptStore.dispatch(
                            TermsOfUsePromptAction.OnTermsOfUseClicked(args.surface),
                        )
                        SupportUtils.launchSandboxCustomTab(
                            context,
                            SupportUtils.getMozillaPageUrl(SupportUtils.MozillaPage.TERMS_OF_SERVICE),
                        )
                    },
                    onPrivacyNoticeClicked = {
                        termsOfUsePromptStore.dispatch(
                            TermsOfUsePromptAction.OnPrivacyNoticeClicked(args.surface),
                        )
                        SupportUtils.launchSandboxCustomTab(
                            context,
                            SupportUtils.getMozillaPageUrl(SupportUtils.MozillaPage.PRIVATE_NOTICE),
                        )
                    },
                    onLearnMoreClicked = {
                        termsOfUsePromptStore.dispatch(
                            TermsOfUsePromptAction.OnLearnMoreClicked(args.surface),
                        )
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
