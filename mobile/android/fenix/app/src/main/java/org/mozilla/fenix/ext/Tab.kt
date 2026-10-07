/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ext

import mozilla.components.concept.engine.utils.ABOUT_HOME_URL
import mozilla.components.feature.tabdata.coordinator.data.Tab

/** Whether this tab is a homepage tab. */
val Tab.isHomepageTab: Boolean
    get() = url.equals(ABOUT_HOME_URL, ignoreCase = true)
