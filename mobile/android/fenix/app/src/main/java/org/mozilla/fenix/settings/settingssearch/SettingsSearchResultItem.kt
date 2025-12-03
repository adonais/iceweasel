/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Composable for the settings search result item.
 *
 * @param item [SettingsSearchItem] to display.
 * @param query Query to highlight in the title.
 * @param onClick Callback for when the item is clicked.
 */
@Composable
fun SettingsSearchResultItem(
    item: SettingsSearchItem,
    query: String,
    onClick: () -> Unit,
) {
    val defaultSpanStyle = SpanStyle(
        fontWeight = FontWeight.Bold,
        background = FirefoxTheme.colors.layer3,
    )

    val displayTitle = remember(item.title, query) {
        highlightQueryMatchingText(
            text = item.title,
            query = query,
            highlight = defaultSpanStyle,
        )
    }
    val displaySummary = remember(item.title, query) {
        highlightQueryMatchingText(
            text = item.summary,
            query = query,
            highlight = defaultSpanStyle,
        )
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(16.dp),
    ) {
        if (item.breadcrumbs.isNotEmpty()) {
            Text(
                text = item.breadcrumbs.joinToString(" > "),
                style = FirefoxTheme.typography.caption,
                color = FirefoxTheme.colors.textSecondary,
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        Text(
            text = displayTitle,
            style = FirefoxTheme.typography.subtitle1,
            color = FirefoxTheme.colors.textPrimary,
        )
        if (displaySummary.isNotBlank()) {
            Text(
                text = displaySummary,
                style = FirefoxTheme.typography.caption,
                color = FirefoxTheme.colors.textSecondary,
                modifier = Modifier.padding(top = 4.dp),
            )
        } else {
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

/**
 * Highlights the query matching text.
 *
 * @param text Text to highlight.
 * @param query Query to highlight.
 * @param highlight Highlight style.
 */
internal fun highlightQueryMatchingText(
    text: String,
    query: String,
    highlight: SpanStyle,
): AnnotatedString {
    val tokens = query.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (tokens.isEmpty()) return AnnotatedString(text)

    // Build one regex that matches *any* token — even inside words
    // For example: "data privacy" → matches "metadata", "data-saving", "privacy-aware"
    val pattern = tokens.joinToString("|") { Regex.escape(it) }
    val regex = Regex(pattern, RegexOption.IGNORE_CASE)

    // Find all match ranges
    val matches = regex.findAll(text).map { it.range }.toList()
    if (matches.isEmpty()) return AnnotatedString(text)

    // Merge overlapping or adjacent ranges
    val merged = matches.sortedBy { it.first }.fold(mutableListOf<IntRange>()) { acc, range ->
        if (acc.isEmpty()) {
            acc += range
        } else {
            val last = acc.last()
            if (range.first <= last.last + 1) {
                acc[acc.lastIndex] = (last.first..maxOf(last.last, range.last))
            } else {
                acc += range
            }
        }
        acc
    }

    return buildAnnotatedString {
        append(text)
        merged.forEach { range ->
            addStyle(highlight, range.first, range.last + 1)
        }
    }
}

private class SettingsSearchResultItemParameterProvider : PreviewParameterProvider<SettingsSearchItem> {
    override val values: Sequence<SettingsSearchItem>
        get() = sequenceOf(
            SettingsSearchItem(
                title = "Search Engine",
                summary = "Set your preferred search engine for browsing.",
                preferenceKey = "search_engine_main",
                breadcrumbs = listOf("Search", "Default Search Engine"),
                preferenceFileInformation = PreferenceFileInformation.SearchSettingsPreferences,
            ),
            SettingsSearchItem(
                title = "Advanced Settings",
                summary = "", // Empty or blank summary
                preferenceKey = "advanced_stuff",
                breadcrumbs = listOf("Developer", "Experiments"),
                preferenceFileInformation = PreferenceFileInformation.GeneralPreferences,
            ),
        )
}

/**
 * Preview for the Settings Search Result Item.
 */
@PreviewLightDark
@Composable
private fun SettingsSearchResultItemFullPreview(
    @PreviewParameter(SettingsSearchResultItemParameterProvider::class) item: SettingsSearchItem,
) {
    FirefoxTheme {
        SettingsSearchResultItem(
            item = item,
            "a",
            onClick = {},
        )
    }
}
