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
import com.google.android.material.R as materialR
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.concept.storage.Address
import mozilla.components.feature.prompts.R
import mozilla.components.feature.prompts.dialog.KEY_PROMPT_UID
import mozilla.components.feature.prompts.dialog.KEY_SESSION_ID
import mozilla.components.feature.prompts.dialog.KEY_SHOULD_DISMISS_ON_LOAD
import mozilla.components.feature.prompts.dialog.PromptDialogFragment
import mozilla.components.feature.prompts.facts.emitAddressAutofillCreatedFact
import mozilla.components.feature.prompts.facts.emitAddressAutofillUpdatedFact
import mozilla.components.feature.prompts.facts.emitAddressSaveDismissedFact
import mozilla.components.support.utils.ext.getParcelableCompat

internal const val KEY_ADDRESS = "KEY_ADDRESS"

/**
 * [DialogFragment] that displays a read-only "Save address?" confirmation, or "Update address?" when the candidate
 * merges into an already saved address.
 *
 * Renders entirely in Jetpack Compose. The fragment shell extends [PromptDialogFragment] so that
 * [mozilla.components.feature.prompts.PromptFeature] can track it via its existing active-prompt machinery and route
 * confirm/cancel callbacks through [feature].
 */
internal class AddressSaveDialogFragment : PromptDialogFragment() {

    @VisibleForTesting(otherwise = VisibleForTesting.PRIVATE)
    internal val address by lazy {
        safeArguments.getParcelableCompat(KEY_ADDRESS, Address::class.java)!!
    }

    /**
     * Gecko sends the guid of the record being merged into when the capture is an update, and no guid when the address
     * is new. See `FormAutofillPrompter.promptToSave`.
     */
    @VisibleForTesting(otherwise = VisibleForTesting.PRIVATE)
    internal val isUpdate by lazy { address.guid.isNotBlank() }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        return BottomSheetDialog(requireContext(), R.style.MozDialogStyle).apply {
            setCancelable(true)
            setOnShowListener {
                val bottomSheet = findViewById<View>(materialR.id.design_bottom_sheet) as FrameLayout
                val behavior = BottomSheetBehavior.from(bottomSheet)
                behavior.peekHeight = context.resources.displayMetrics.heightPixels
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
                isUpdate = isUpdate,
                onSave = ::onSaveClicked,
                onCancel = ::onCancelClicked,
            )
        }
    }

    override fun onCancel(dialog: DialogInterface) {
        super.onCancel(dialog)
        emitAddressSaveDismissedFact()
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
        emitSaveUpdateFact()
    }

    private fun onCancelClicked() {
        emitAddressSaveDismissedFact()
        feature?.onCancel(
            sessionId = sessionId,
            promptRequestUID = promptRequestUID,
        )
        dismiss()
    }

    /**
     * Emit the created or updated fact. A blank guid means the record is not yet in storage, which is the same
     * condition the storage delegate uses to choose between adding and updating.
     */
    @VisibleForTesting
    internal fun emitSaveUpdateFact() {
        if (address.guid.isBlank()) {
            emitAddressAutofillCreatedFact()
        } else {
            emitAddressAutofillUpdatedFact()
        }
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
