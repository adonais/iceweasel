/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.menu

import androidx.fragment.app.Fragment
import mozilla.components.compose.menu.store.MenuStore
import mozilla.components.lib.state.Action
import mozilla.components.lib.state.Middleware

/**
 * Screen allowing the user to customize the order of and what menu items or menu sections are to be shown.
 *
 * This handles all the user interaction for customizing the menu. Concretions are expected to provide a [MenuStore]
 * instance that
 * - contains the initial menu structure that will be offered to users to customize
 * - allows defining how user interactions (as dispatched [Action]s) should be handled in [Middleware]s.
 */
abstract class CustomizeMenuFragment : Fragment() {
    /** The store managing the menu state. */
    abstract val menuStore: MenuStore
}
