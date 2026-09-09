/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu.compose

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import mozilla.components.ui.icons.R as iconsR
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.store.TranslationInfo

/**
 * Translation menu item. Only shown if the current webpage can be translated.
 *
 * @param translationInfo Translation information and configuration.
 * @param isReaderViewActive Whether the reader view is active.
 */
@Composable
internal fun TranslationMenuItem(
    translationInfo: TranslationInfo,
    isReaderViewActive: Boolean,
) {
    if (!translationInfo.isTranslationSupported) return

    if (translationInfo.isTranslated) {
        MenuItem(
            label = stringResource(id = R.string.browser_menu_translated),
            beforeIconPainter = painterResource(id = iconsR.drawable.mozac_ic_translate_active_24),
            state = MenuItemState.ACTIVE,
            onClick = translationInfo.onTranslatePageMenuClick,
        ) {
            Badge(
                badgeText = translationInfo.translatedLanguage,
                state = MenuItemState.ACTIVE,
            )
        }
    } else {
        MenuItem(
            label = stringResource(id = R.string.browser_menu_translate_page_2),
            beforeIconPainter = painterResource(id = iconsR.drawable.mozac_ic_translate_24),
            state = if (isReaderViewActive || translationInfo.isPdf) MenuItemState.DISABLED else MenuItemState.ENABLED,
            onClick = translationInfo.onTranslatePageMenuClick,
        )
    }
}
