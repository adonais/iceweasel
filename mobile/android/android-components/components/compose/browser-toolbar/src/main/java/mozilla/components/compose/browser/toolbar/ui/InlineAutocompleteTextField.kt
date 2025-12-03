/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar.ui

import android.content.ClipData
import android.content.Context
import android.text.Spanned
import android.view.inputmethod.EditorInfo
import androidx.annotation.DoNotInline
import androidx.annotation.VisibleForTesting
import androidx.compose.foundation.ComposeFoundationFlags
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.Clipboard
import androidx.compose.ui.platform.InterceptPlatformTextInput
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalTextToolbar
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.PlatformTextInputMethodRequest
import androidx.compose.ui.platform.TextToolbar
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.toClipEntry
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.sp
import androidx.core.graphics.toColorInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_SEARCH_BOX
import mozilla.components.concept.toolbar.AutocompleteResult
import mozilla.components.support.utils.SafeUrl

private const val TEXT_SIZE = 15f
private const val TEXT_HIGHLIGHT_COLOR = "#5C592ACB"

/**
 * A text field composable that displays a suggestion inline with the user's input,
 * styled differently to distinguish it from the typed text.
 *
 * @param query The query to show.
 * @param hint Placeholder text tpo show if [query] is empty.
 * @param suggestion The autocomplete suggestion to display. `null` if no suggestion is active.
 * @param showQueryAsPreselected If `true`, the initial query text will be fully selected.
 * @param usePrivateModeQueries If `true`, instructs the keyboard to disable personalized learning,
 * suitable for private/incognito modes.
 * @param modifier The [Modifier] to be applied to this text field.
 * @param onUrlEdit Callback invoked when the user types or deletes text, providing [BrowserToolbarQuery]
 * with information about the previous and the new query.
 * @param onUrlCommitted A callback for when the user commits the text via an IME action like "Go".
 */
@OptIn(ExperimentalComposeUiApi::class) // for InterceptPlatformTextInput
@Suppress("LongMethod", "CyclomaticComplexMethod")
@Composable
internal fun InlineAutocompleteTextField(
    query: String,
    hint: String,
    suggestion: AutocompleteResult?,
    showQueryAsPreselected: Boolean,
    usePrivateModeQueries: Boolean,
    modifier: Modifier = Modifier,
    onUrlEdit: (BrowserToolbarQuery) -> Unit = {},
    onUrlCommitted: (String) -> Unit = {},
) {
    var textFieldValue by remember { mutableStateOf(TextFieldValue("")) }
    LaunchedEffect(query) {
        if (query != textFieldValue.text) {
            textFieldValue = TextFieldValue(
                text = query,
                selection = when (showQueryAsPreselected) {
                    true -> TextRange(0, query.length)
                    false -> TextRange(query.length)
                },
            )
        }
    }

    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    var useSuggestion by remember { mutableStateOf(true) }
    val suggestionTextColor = AcornTheme.colors.textPrimary
    val highlightBackgroundColor = Color(TEXT_HIGHLIGHT_COLOR.toColorInt())
    val suggestionVisualTransformation = remember(useSuggestion, suggestion, textFieldValue) {
        when (textFieldValue.text.isEmpty() || !useSuggestion) {
            true -> VisualTransformation.None
            false -> AutocompleteVisualTransformation(
                userInput = textFieldValue,
                suggestion = suggestion,
                textColor = suggestionTextColor,
                textBackground = highlightBackgroundColor,
            )
        }
    }

    val localView = LocalView.current
    LaunchedEffect(suggestion) {
        suggestion?.text?.let {
            @Suppress("DEPRECATION")
            localView.announceForAccessibility(it)
        }
    }

    var suggestionBounds by remember { mutableStateOf<Rect?>(null) }
    val deviceLayoutDirection = LocalLayoutDirection.current

    val context = LocalContext.current
    val defaultTextToolbar = LocalTextToolbar.current
    val clipboard = LocalClipboard.current
    val coroutineScope = rememberCoroutineScope()
    val pasteInterceptorToolbar = remember(defaultTextToolbar, clipboard) {
        PasteSanitizerTextToolbar(context, defaultTextToolbar, clipboard, coroutineScope)
    }

    // Always want the text to be entered left to right.
    CompositionLocalProvider(
        LocalLayoutDirection provides LayoutDirection.Ltr,
        LocalTextToolbar provides pasteInterceptorToolbar,
    ) {
        // Set incognito mode for the keyboard when needed.
        InterceptPlatformTextInput(
            interceptor = { request, nextHandler ->
                val modifiedRequest = PlatformTextInputMethodRequest { outAttributes ->
                    request.createInputConnection(outAttributes).also {
                        if (usePrivateModeQueries) {
                            NoPersonalizedLearningHelper.addNoPersonalizedLearning(outAttributes)
                        }
                    }
                }
                nextHandler.startInputMethod(modifiedRequest)
            },
        ) {
            BasicTextField(
                value = textFieldValue,
                onValueChange = { newValue ->
                    // Remove suggestion if cursor placement changed
                    val onlySelectionChanged = textFieldValue.text == newValue.text &&
                            textFieldValue.composition == newValue.composition &&
                            textFieldValue.annotatedString == newValue.annotatedString
                    if (onlySelectionChanged) {
                        useSuggestion = false
                        textFieldValue = newValue
                        return@BasicTextField
                    }

                    // Remove suggestion if user pressed backspace and
                    // only delete query characters for the next backspace after the suggestion was removed.
                    val originalText = textFieldValue.text
                    val newText = newValue.text
                    val isBackspaceHidingSuggestion = originalText.length == newText.length + 1 &&
                            originalText.startsWith(newText) &&
                            (useSuggestion && suggestion?.text?.startsWith(originalText) == true)
                    if (isBackspaceHidingSuggestion) {
                        useSuggestion = false
                    } else {
                        useSuggestion = true
                        onUrlEdit(
                            BrowserToolbarQuery(
                                previous = originalText,
                                current = newText,
                            ),
                        )
                        textFieldValue = newValue
                    }
                },
                modifier = modifier
                    .testTag(ADDRESSBAR_SEARCH_BOX)
                    .fillMaxWidth()
                    .onFocusChanged { focusState ->
                        if (focusState.isFocused) {
                            keyboardController?.show()
                        }
                    }
                    .focusRequester(focusRequester),
                textStyle = TextStyle(
                    fontSize = TEXT_SIZE.sp,
                    color = AcornTheme.colors.textPrimary,
                    textAlign = when (deviceLayoutDirection) {
                        LayoutDirection.Ltr -> TextAlign.Start
                        LayoutDirection.Rtl -> TextAlign.End
                    },
                ),
                keyboardOptions = KeyboardOptions(
                    showKeyboardOnFocus = true,
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Go,
                    autoCorrectEnabled = !usePrivateModeQueries,
                ),
                keyboardActions = KeyboardActions(
                    onGo = {
                        keyboardController?.hide()
                        val currentSuggestion = suggestion?.text
                        onUrlCommitted(
                            when (useSuggestion && currentSuggestion?.startsWith(textFieldValue.text) == true) {
                                true -> currentSuggestion
                                else -> textFieldValue.text
                            },
                        )
                    },
                ),
                singleLine = true,
                visualTransformation = suggestionVisualTransformation,
                onTextLayout = { layoutResult ->
                    val currentInput = textFieldValue.text
                    suggestionBounds = when (currentInput.isEmpty()) {
                        true -> null
                        false -> try {
                            layoutResult.getBoundingBox(currentInput.length - 1)
                        } catch (_: IllegalArgumentException) {
                            null
                        }
                    }
                },
                cursorBrush = SolidColor(AcornTheme.colors.textPrimary),
                decorationBox = { innerTextField ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            // Commit the suggestion when users tap on the outside of the typed in text.
                            .pointerInput(suggestion, suggestionBounds) {
                                awaitEachGesture {
                                    val downEvent = awaitFirstDown(requireUnconsumed = false)
                                    val bounds = suggestionBounds
                                    val suggestion = suggestion?.text
                                    if (bounds != null && suggestion != null &&
                                        bounds.right < downEvent.position.x
                                    ) {
                                        onUrlEdit(
                                            BrowserToolbarQuery(
                                                previous = textFieldValue.text,
                                                current = suggestion,
                                            ),
                                        )
                                        textFieldValue = TextFieldValue(
                                            text = suggestion,
                                            selection = TextRange(suggestion.length),
                                        )
                                    }
                                }
                            },
                        contentAlignment = when (deviceLayoutDirection) {
                            LayoutDirection.Ltr -> Alignment.CenterStart
                            LayoutDirection.Rtl -> Alignment.CenterEnd
                        },
                    ) {
                        if (textFieldValue.text.isEmpty()) {
                            Text(
                                text = hint,
                                style = TextStyle(
                                    fontSize = TEXT_SIZE.sp,
                                    color = AcornTheme.colors.textSecondary,
                                ),
                            )
                        }
                        innerTextField()
                    }
                },
            )
        }
    }
}

/**
 * Information about the current browser toolbar query.
 *
 * @property current The current query.
 * @property previous The previous query, if any.
 */
data class BrowserToolbarQuery(
    val current: String,
    val previous: String? = null,
)

/**
 * Helper for showing the autocomplete suggestion inline with user's input.
 */
private class AutocompleteVisualTransformation(
    private val userInput: TextFieldValue,
    private val suggestion: AutocompleteResult?,
    private val textColor: Color,
    private val textBackground: Color,
) : VisualTransformation {

    override fun filter(text: AnnotatedString): TransformedText {
        if (suggestion?.text.isNullOrEmpty() || !suggestion.text.startsWith(userInput.text)) {
            return TransformedText(AnnotatedString(userInput.text), OffsetMapping.Identity)
        }

        val transformed = buildAnnotatedString {
            append(userInput.text)
            append(
                AnnotatedString(
                    suggestion.text.removePrefix(userInput.text),
                    spanStyle = SpanStyle(
                        color = textColor,
                        background = textBackground,
                    ),
                ),
            )
        }

        val offsetMapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                return offset
            }

            override fun transformedToOriginal(offset: Int): Int {
                return offset.coerceIn(0, userInput.text.length)
            }
        }

        return TransformedText(transformed, offsetMapping)
    }
}

/**
 * Temporary helper for putting the toolbar in incognito mode.
 * See https://issuetracker.google.com/issues/359257538.
 */
@VisibleForTesting
internal object NoPersonalizedLearningHelper {
    @DoNotInline
    fun addNoPersonalizedLearning(info: EditorInfo) {
        info.imeOptions = info.imeOptions or EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING
    }
}

/**
 * Helper for sanitizing what gets pasted through the contextual menu.
 */
@OptIn(ExperimentalFoundationApi::class) // for ComposeFoundationFlags
private class PasteSanitizerTextToolbar(
    private val context: Context,
    private val delegate: TextToolbar,
    private val clipboard: Clipboard,
    private val scope: CoroutineScope,
) : TextToolbar {
    init {
        // Temporary workaround for https://issuetracker.google.com/issues/447192728
        ComposeFoundationFlags.isNewContextMenuEnabled = false
    }

    override val status = delegate.status

    override fun hide() = delegate.hide()

    override fun showMenu(
        rect: Rect,
        onCopyRequested: (() -> Unit)?,
        onPasteRequested: (() -> Unit)?,
        onCutRequested: (() -> Unit)?,
        onSelectAllRequested: (() -> Unit)?,
        onAutofillRequested: (() -> Unit)?,
    ) {
        delegate.showMenu(
            rect = rect,
            onCopyRequested = onCopyRequested,
            onPasteRequested = {
                sanitizeAvailableTextClip { onPasteRequested?.invoke() }
            },
            onCutRequested = onCutRequested,
            onSelectAllRequested = onSelectAllRequested,
            onAutofillRequested = onAutofillRequested,
        )
    }

    override fun showMenu(
        rect: Rect,
        onCopyRequested: (() -> Unit)?,
        onPasteRequested: (() -> Unit)?,
        onCutRequested: (() -> Unit)?,
        onSelectAllRequested: (() -> Unit)?,
    ) {
        delegate.showMenu(
            rect = rect,
            onCopyRequested = onCopyRequested,
            onPasteRequested = {
                sanitizeAvailableTextClip { onPasteRequested?.invoke() }
            },
            onCutRequested = onCutRequested,
            onSelectAllRequested = onSelectAllRequested,
        )
    }

    private fun sanitizeAvailableTextClip(
        pasteDelegate: () -> Unit,
    ) = scope.launch {
        val originalClip = clipboard.getClipEntry() ?: return@launch

        val sb = StringBuilder()
        for (i in 0 until originalClip.clipData.itemCount) {
            val text = originalClip.clipData.getItemAt(i).coerceToText(context)
            val textToBePasted = (text as? Spanned)?.toString() ?: text

            val safeTextToBePasted = SafeUrl.stripUnsafeUrlSchemes(context, textToBePasted)

            if (i >= 1) { sb.append("\n") }
            sb.append(safeTextToBePasted)
        }

        // Setup a temporary clip with the sanitized text to allow the framework pasting it
        // then restore the original clip.
        SafeUrl.stripUnsafeUrlSchemes(context, sb.toString())?.let { safeText ->
            clipboard.setClipEntry(ClipData.newPlainText("", safeText).toClipEntry())
            pasteDelegate.invoke()
            clipboard.setClipEntry(originalClip)
        }
    }
}

@PreviewLightDark
@Composable
private fun InlineAutocompleteTextFieldWithSuggestion() {
    AcornTheme {
        Box(
            Modifier.background(AcornTheme.colors.layer1),
        ) {
            InlineAutocompleteTextField(
                query = "wiki",
                hint = "hint",
                showQueryAsPreselected = false,
                usePrivateModeQueries = false,
                suggestion = AutocompleteResult(
                    "wiki",
                    "wikipedia.org",
                    "https://wikipedia.org",
                    "test",
                    1,
                ),
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun InlineAutocompleteTextFieldWithNoQuery() {
    AcornTheme {
        Box(
            Modifier.background(AcornTheme.colors.layer1),
        ) {
            InlineAutocompleteTextField(
                query = "",
                hint = "hint",
                showQueryAsPreselected = false,
                usePrivateModeQueries = false,
                suggestion = null,
            )
        }
    }
}
