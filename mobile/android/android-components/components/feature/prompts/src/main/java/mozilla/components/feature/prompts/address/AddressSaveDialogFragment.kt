/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.prompts.address

import android.app.Dialog
import android.content.DialogInterface
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.annotation.VisibleForTesting
import androidx.fragment.compose.content
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.concept.storage.Address
import mozilla.components.feature.prompts.R
import mozilla.components.feature.prompts.dialog.KEY_PROMPT_UID
import mozilla.components.feature.prompts.dialog.KEY_SESSION_ID
import mozilla.components.feature.prompts.dialog.KEY_SHOULD_DISMISS_ON_LOAD
import mozilla.components.feature.prompts.dialog.PromptDialogFragment
import mozilla.components.support.utils.ext.getParcelableCompat
import com.google.android.material.R as materialR

internal const val KEY_ADDRESS = "KEY_ADDRESS"

/**
 * [DialogFragment] that displays a read-only "Save address?" confirmation.
 *
 * Renders entirely in Jetpack Compose. The fragment shell extends [PromptDialogFragment] so that
 * [mozilla.components.feature.prompts.PromptFeature] can track it via its existing
 * active-prompt machinery and route confirm/cancel callbacks through [feature].
 */
internal class AddressSaveDialogFragment : PromptDialogFragment() {

    @VisibleForTesting(otherwise = VisibleForTesting.PRIVATE)
    internal val address by lazy {
        safeArguments.getParcelableCompat(KEY_ADDRESS, Address::class.java)!!
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        return BottomSheetDialog(requireContext(), R.style.MozDialogStyle).apply {
            setCancelable(true)
            setOnShowListener {
                val bottomSheet =
                    findViewById<View>(materialR.id.design_bottom_sheet) as FrameLayout
                val behavior = BottomSheetBehavior.from(bottomSheet)
                behavior.state = BottomSheetBehavior.STATE_EXPANDED
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ) = content {
        AcornTheme {
            AddressSaveDialogContent(
                address = address,
                onSave = ::onSaveClicked,
                onCancel = ::onCancelClicked,
            )
        }
    }

    override fun onCancel(dialog: DialogInterface) {
        super.onCancel(dialog)
        feature?.onCancel(
            sessionId = sessionId,
            promptRequestUID = promptRequestUID,
        )
    }

    override fun onDismiss(dialog: DialogInterface) {
        super.onDismiss(dialog)
        feature?.onCancel(
            sessionId = sessionId,
            promptRequestUID = promptRequestUID,
        )
    }

    private fun onSaveClicked() {
        feature?.onConfirm(
            sessionId = sessionId,
            promptRequestUID = promptRequestUID,
            value = address,
        )
        dismiss()
    }

    private fun onCancelClicked() {
        feature?.onCancel(
            sessionId = sessionId,
            promptRequestUID = promptRequestUID,
        )
        dismiss()
    }

    companion object {
        fun newInstance(
            sessionId: String,
            promptRequestUID: String,
            shouldDismissOnLoad: Boolean,
            address: Address,
        ): AddressSaveDialogFragment {
            val fragment = AddressSaveDialogFragment()
            val arguments = fragment.arguments ?: Bundle()

            with(arguments) {
                putString(KEY_SESSION_ID, sessionId)
                putString(KEY_PROMPT_UID, promptRequestUID)
                putBoolean(KEY_SHOULD_DISMISS_ON_LOAD, shouldDismissOnLoad)
                putParcelable(KEY_ADDRESS, address)
            }

            fragment.arguments = arguments
            return fragment
        }
    }
}
