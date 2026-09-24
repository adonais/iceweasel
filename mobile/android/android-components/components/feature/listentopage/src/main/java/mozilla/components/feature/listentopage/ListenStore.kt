/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.listentopage

import mozilla.components.lib.state.Store

/** [Store] holding the [ListenState] of one listening session. */
typealias ListenStore = Store<ListenState, ListenAction>
