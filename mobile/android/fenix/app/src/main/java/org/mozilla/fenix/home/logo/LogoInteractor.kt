/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.logo

/**
 * An interface to define interactions with the homepage logo.
 */
interface LogoInteractor {

    /**
     * Called when the logo is long-clicked.
     */
    fun onLogoLongClicked()
}
