/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.crashes

import android.app.Dialog
import android.content.Context
import android.os.Bundle
import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import androidx.fragment.app.DialogFragment
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mozilla.components.lib.crash.store.CrashAction
import org.mozilla.fenix.R
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.compose.LinkText
import org.mozilla.fenix.compose.LinkTextState
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.settings.SupportUtils
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Dialog to request whether a user wants to submit crashes that have not been reported.
 *
 * @param dispatcher Callback to dispatch various [CrashAction]s in response to user input.
 * @param crashIDs If present holds the list of minidump files requested over Remote Settings.
 * @param localContext Application context to provide for Learn More links opening.
 */
class UnsubmittedCrashDialog(
    private val dispatcher: (action: CrashAction) -> Unit,
    private val crashIDs: List<String>?,
    private val localContext: Context,
) : DialogFragment() {
    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        return activity?.let { activity ->
            Dialog(activity).apply {
                setContentView(
                    ComposeView(activity).apply {
                        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
                        setContent {
                            FirefoxTheme {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(FirefoxTheme.colors.layer1),
                                ) {
                                    CrashCard(
                                        dismiss = ::dismiss,
                                        dispatcher = dispatcher,
                                        crashIDs = crashIDs,
                                        cardContext = localContext,
                                    )
                                }
                            }
                        }
                    },
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ),
                )
                window?.setBackgroundDrawableResource(android.R.color.transparent)
            }
        } ?: throw IllegalStateException("Activity cannot be null")
    }

    companion object {
        const val TAG = "unsubmitted crash dialog tag"
    }
}

@Suppress("LongMethod")
@Composable
private fun CrashCard(
    dismiss: () -> Unit,
    dispatcher: (action: CrashAction) -> Unit,
    crashIDs: List<String>?,
    cardContext: Context?,
) {
    val requestedByDevs = !crashIDs.isNullOrEmpty()
    val context = LocalContext.current

    dispatcher(CrashAction.PromptShown)

    val msg = if (requestedByDevs) {
        if (crashIDs?.size == 1) {
            stringResource(
                R.string.unsubmitted_crash_requested_by_devs_dialog_title,
                stringResource(R.string.app_name),
            )
        } else {
            stringResource(
                R.string.unsubmitted_crashes_requested_by_devs_dialog_title,
                crashIDs!!.size,
                stringResource(R.string.app_name),
            )
        }
    } else {
        stringResource(
            R.string.unsubmitted_crash_dialog_title_2,
            stringResource(R.string.app_name),
        )
    }

    var checkboxChecked by remember { mutableStateOf(false) }

    if (!requestedByDevs) {
        Column(
            modifier = Modifier
                .width(280.dp)
                .padding(top = 16.dp, start = 16.dp, end = 16.dp, bottom = 0.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = msg,
                color = FirefoxTheme.colors.textPrimary,
                style = FirefoxTheme.typography.headline7,
                modifier = Modifier
                    .semantics { heading() },
            )

            AnnotatedStringBody()

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.widthIn(max = 248.dp),
            ) {
                Checkbox(
                    checked = checkboxChecked,
                    colors = CheckboxDefaults.colors(
                        checkedColor = FirefoxTheme.colors.formSelected,
                        uncheckedColor = FirefoxTheme.colors.formDefault,
                    ),
                    onCheckedChange = { checkboxChecked = it },
                    modifier = Modifier.padding(start = 0.dp, end = 0.dp),
                )
                Text(
                    text = stringResource(R.string.unsubmitted_crash_dialog_checkbox_label),
                    color = FirefoxTheme.colors.textPrimary,
                    style = FirefoxTheme.typography.subtitle1,
                )
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(
                    space = 8.dp,
                    alignment = Alignment.End,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                TextButton(
                    onClick = {
                        dispatcher(CrashAction.CancelTapped)
                        dismiss()
                    },
                ) {
                    Text(
                        text = stringResource(R.string.unsubmitted_crash_dialog_negative_button_2),
                        color = FirefoxTheme.colors.textAccent,
                        style = FirefoxTheme.typography.button,
                    )
                }
                TextButton(
                    onClick = {
                        dispatcher(
                            CrashAction.ReportTapped(
                                checkboxChecked,
                                listOf(),
                            ),
                        )
                        dismiss()
                    },
                ) {
                    Text(
                        text = stringResource(R.string.unsubmitted_crash_dialog_positive_button_2),
                        color = FirefoxTheme.colors.textAccent,
                        style = FirefoxTheme.typography.button,
                    )
                }
            }
        }
    } else {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = msg,
                modifier = Modifier
                    .semantics { heading() },
                color = FirefoxTheme.colors.textPrimary,
                style = FirefoxTheme.typography.headline5,
            )

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = stringResource(R.string.unsubmitted_crash_requested_by_devs_learn_more).uppercase(),
                    color = FirefoxTheme.colors.actionPrimary,
                    modifier = Modifier.clickable {
                        if (cardContext != null) {
                            SupportUtils.launchSandboxCustomTab(
                                context = cardContext,
                                url = SupportUtils.getSumoURLForTopic(
                                    context = cardContext,
                                    topic = SupportUtils.SumoTopic.REQUESTED_CRASH_MINIDUMP,
                                ),
                            )
                        }
                    },
                )
                Text(
                    text = stringResource(R.string.unsubmitted_crash_requested_by_devs_dialog_never_button).uppercase(),
                    color = FirefoxTheme.colors.textSecondary,
                    modifier = Modifier.clickable {
                        dispatcher(CrashAction.CancelForEverTapped)
                        dismiss()
                    },
                )
            }
            Spacer(modifier = Modifier.height(16.dp))

            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = stringResource(R.string.unsubmitted_crash_dialog_negative_button).uppercase(),
                    color = FirefoxTheme.colors.textSecondary,
                    modifier = Modifier.clickable {
                        dispatcher(CrashAction.CancelTapped)
                        dismiss()
                    },
                )
                Text(
                    text = stringResource(R.string.unsubmitted_crash_dialog_positive_button).uppercase(),
                    color = FirefoxTheme.colors.textSecondary,
                    modifier = Modifier.clickable {
                        dispatcher(
                            CrashAction.ReportTapped(
                                automaticallySendChecked = false,
                                crashIDs = crashIDs ?: listOf(),
                            ),
                        )
                        dismiss()
                    },
                )
            }
        }
    }
}

@Composable
private fun AnnotatedStringBody() {
    val context = LocalContext.current
    val learnMoreText = stringResource(R.string.unsubmitted_crash_dialog_learn_more)
    val linkStateLearnMore = LinkTextState(
        text = learnMoreText,
        url = "",
        onClick = {
            SupportUtils.launchSandboxCustomTab(
                context = context,
                url = SupportUtils.getSumoURLForTopic(
                    context = context,
                    topic = SupportUtils.SumoTopic.CRASH_REPORTS,
                ),
            )
        },
    )
    LinkText(
        text =
            stringResource(
                R.string.unsubmitted_crash_dialog_body,
                stringResource(R.string.unsubmitted_crash_dialog_learn_more),
            ),
        linkTextStates = listOf(linkStateLearnMore),
        style = FirefoxTheme.typography.body2.copy(FirefoxTheme.colors.textPrimary),
        linkTextColor = FirefoxTheme.colors.textAccent,
        linkTextDecoration = TextDecoration.Underline,
        textAlign = null,
        shouldApplyAccessibleSize = false,
    )
}

@PreviewLightDark
@Composable
private fun CrashDialogPreview() {
    FirefoxTheme {
        Box(Modifier.background(FirefoxTheme.colors.layer1)) {
            CrashCard(
                dismiss = {},
                dispatcher = {},
                crashIDs = null,
                cardContext = null,
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun CrashPullDialogPreview() {
    FirefoxTheme {
        Box(Modifier.background(FirefoxTheme.colors.layer1)) {
            CrashCard(
                dismiss = {},
                dispatcher = {},
                crashIDs = listOf("12345", "67890"),
                cardContext = null,
            )
        }
    }
}
