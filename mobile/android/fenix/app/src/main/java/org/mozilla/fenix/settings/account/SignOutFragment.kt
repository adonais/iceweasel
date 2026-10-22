/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.account

import android.app.Dialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatDialogFragment
import androidx.fragment.compose.content
import androidx.lifecycle.lifecycleScope
import com.google.android.material.R as materialR
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import kotlinx.coroutines.launch
import mozilla.components.service.fxa.manager.FxaAccountManager
import org.mozilla.fenix.R
import org.mozilla.fenix.databinding.FragmentSignOutBinding
import org.mozilla.fenix.ext.requireComponents
import org.mozilla.fenix.ext.runIfFragmentIsAttached
import org.mozilla.fenix.theme.FirefoxTheme

class SignOutFragment : AppCompatDialogFragment() {
    private lateinit var accountManager: FxaAccountManager

    private var _binding: FragmentSignOutBinding? = null
    private val binding
        get() = _binding!!

    private val useNewDialog by lazy { requireComponents.settings.accountSettingsNewUi }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!useNewDialog) {
            setStyle(STYLE_NO_TITLE, R.style.BottomSheet)
        }
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog =
        if (useNewDialog) {
            super.onCreateDialog(savedInstanceState)
        } else {
            BottomSheetDialog(requireContext(), this.theme).apply {
                setOnShowListener {
                    val bottomSheet = findViewById<View>(materialR.id.design_bottom_sheet) as FrameLayout
                    val behavior = BottomSheetBehavior.from(bottomSheet)
                    behavior.state = BottomSheetBehavior.STATE_EXPANDED
                }
            }
        }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View? {
        accountManager = requireComponents.backgroundServices.accountManager

        return if (useNewDialog) {
            content {
                FirefoxTheme {
                    SignOutDialog(onConfirmSignOut = ::signOut, onCancel = ::dismiss)
                }
            }
        } else {
            _binding = FragmentSignOutBinding.inflate(inflater, container, false)

            binding.signOutMessage.text =
                String.format(
                    binding.root.context.getString(R.string.sign_out_confirmation_message_2),
                    binding.root.context.getString(R.string.app_name),
                )
            binding.root
        }
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        if (!useNewDialog) {
            binding.signOutDisconnect.setOnClickListener {
                signOut()
            }

            binding.signOutCancel.setOnClickListener {
                dismiss()
            }
        }
    }

    private fun signOut() {
        lifecycleScope
            .launch {
                requireComponents.backgroundServices.accountAbnormalities.userRequestedLogout()
                accountManager.logout()
            }
            .invokeOnCompletion {
                runIfFragmentIsAttached {
                    if (this.isVisible) {
                        dismiss()
                    }
                }
            }
    }

    override fun onDestroyView() {
        super.onDestroyView()

        if (!useNewDialog) {
            _binding = null
        }
    }
}
