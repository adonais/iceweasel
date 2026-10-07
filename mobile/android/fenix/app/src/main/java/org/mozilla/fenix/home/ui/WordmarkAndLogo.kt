/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.dimensionResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.R
import org.mozilla.fenix.home.ui.HomepageTestTag.HOMEPAGE_WORDMARK_LOGO
import org.mozilla.fenix.home.ui.HomepageTestTag.HOMEPAGE_WORDMARK_TEXT

/** Semantic property for accessing a Composable item's current resource property. */
internal val ResourceId = SemanticsPropertyKey<Int>("ResourceId")
internal var SemanticsPropertyReceiver.resourceId by ResourceId

private val LOGO_HEIGHT = 40.dp
private val LOGO_PADDING = 10.dp

/**
 * The Firefox logo followed by the Firefox wordmark.
 *
 * @param wordmarkTextColor Tint applied to the wordmark text, or null to leave it untinted.
 * @param modifier [Modifier] to be applied to the layout.
 */
@Composable
internal fun WordmarkAndLogo(
    wordmarkTextColor: Color?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Logo()
        Wordmark(wordmarkTextColor)
    }
}

@Composable
internal fun Logo() {
    Image(
        modifier =
            Modifier.height(LOGO_HEIGHT)
                .semantics {
                    testTagsAsResourceId = true
                    testTag = HOMEPAGE_WORDMARK_LOGO
                    resourceId = R.attr.fenixWordmarkLogo
                }
                .padding(end = LOGO_PADDING),
        painter = painterResource(getAttr(R.attr.fenixWordmarkLogo)),
        contentDescription = null,
    )
}

@Composable
internal fun Wordmark(color: Color?) {
    Image(
        modifier =
            Modifier.semantics {
                    testTagsAsResourceId = true
                    testTag = HOMEPAGE_WORDMARK_TEXT
                }
                .height(dimensionResource(R.dimen.wordmark_text_height)),
        painter = painterResource(getAttr(R.attr.fenixWordmarkText)),
        colorFilter = color?.let { ColorFilter.tint(it) },
        contentDescription = stringResource(R.string.app_name),
    )
}
