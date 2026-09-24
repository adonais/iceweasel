/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// On MOZ_FOLD_LIBS platforms `nss-rs` searches `$objdir/security` for libnss3,
// but Gecko links shared libraries straight into `dist/bin`, so a standalone
// artifact such as a test binary never finds it. Emit the objdir's NSS linkage
// from the build system's own source of truth instead.
fn main() {
    mozbuild::link_nss();
}
