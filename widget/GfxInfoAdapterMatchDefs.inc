/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// NOTE: No include guard.  This is meant to be included to generate different
// code based on how GFXINFO_ADAPTER_MATCH is defined, possibly multiple times
// in a single translation unit.

/* clang-format off */

/* Match against the primary adapter (default) */
GFXINFO_ADAPTER_MATCH(Primary, "PRIMARY")
/* Match against the secondary adapter */
GFXINFO_ADAPTER_MATCH(Secondary, "SECONDARY")
/* Match against any adapter */
GFXINFO_ADAPTER_MATCH(Any, "ANY")
