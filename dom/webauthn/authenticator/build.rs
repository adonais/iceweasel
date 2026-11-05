/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Link against the objdir's NSS so that standalone artifacts, such as the
// test binary run by `mach rusttests`, can find it.
fn main() {
    mozbuild::link_nss();
}
