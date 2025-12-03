package org.mozilla.fenix.settings.settingssearch

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import org.junit.Test

class TextHighlightingTest {
    private val highlightStyle = SpanStyle(color = Color.Red, fontWeight = FontWeight.Bold)

    @Test
    fun `test single word query highlights correctly`() {
        val text = "Set your search engine"
        val query = "search"
        val annotatedString = highlightQueryMatchingText(text, query, highlightStyle)

        val spanStyles = annotatedString.spanStyles
        assert(spanStyles.size == 1)
        assert(spanStyles.first().start == 9)
        assert(spanStyles.first().end == 15)
        assert(spanStyles.first().item == highlightStyle)
    }

    @Test
    fun `test case-insensitive query highlights correctly`() {
        val text = "Set Your Search Engine"
        val query = "search"
        val annotatedString = highlightQueryMatchingText(text, query, highlightStyle)

        val spanStyles = annotatedString.spanStyles
        assert(spanStyles.size == 1)
        assert(spanStyles.first().start == 9)
        assert(spanStyles.first().end == 15)
    }

    @Test
    fun `test query with extra whitespace is handled`() {
        val text = "Set your search engine"
        val query = "  search  "
        val annotatedString = highlightQueryMatchingText(text, query, highlightStyle)

        val spanStyles = annotatedString.spanStyles
        assert(spanStyles.size == 1)
        assert(spanStyles.first().start == 9)
        assert(spanStyles.first().end == 15)
    }

    @Test
    fun `test overlapping matches are merged into one span`() {
        val text = "datadata"
        val query = "data"
        val annotatedString = highlightQueryMatchingText(text, query, highlightStyle)

        val spanStyles = annotatedString.spanStyles
        assert(spanStyles.size == 1)
        assert(spanStyles.first().start == 0)
        assert(spanStyles.first().end == 8)
    }

    @Test
    fun `test no matches returns unstyled string`() {
        val text = "Set your search engine"
        val query = "firefox"
        val annotatedString = highlightQueryMatchingText(text, query, highlightStyle)

        assert(annotatedString.spanStyles.isEmpty())
        assert(annotatedString.text == text)
    }

    @Test
    fun `test empty query returns unstyled string`() {
        val text = "Set your search engine"
        val query = ""
        val annotatedString = highlightQueryMatchingText(text, query, highlightStyle)

        assert(annotatedString.spanStyles.isEmpty())
        assert(annotatedString.text == text)
    }

    @Test
    fun `test empty text returns empty annotated string`() {
        val text = ""
        val query = "search"
        val annotatedString = highlightQueryMatchingText(text, query, highlightStyle)

        assert(annotatedString.spanStyles.isEmpty())
        assert(annotatedString.text.isEmpty())
    }

    @Test
    fun `test partial word matching`() {
        val text = "Enable data privacy features"
        val query = "priv"
        val annotatedString = highlightQueryMatchingText(text, query, highlightStyle)

        val spanStyles = annotatedString.spanStyles
        assert(spanStyles.size == 1)
        assert(spanStyles.first().start == 12)
        assert(spanStyles.first().end == 16)
    }
}
