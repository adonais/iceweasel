/*
 This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { AITAB_PAGES_SLUG_VERSION_INDEX } from "moz-src:///browser/components/aiwindow/ui/modules/AITabSql.sys.mjs";

// Each migration receives the schema version the database is currently on and
// returns without doing anything if it does not apply.
export const migrations = [
  /**
   * v2: idx_aitab_pages_slug_version became UNIQUE, so a slug can no longer be
   * claimed by more than one conversation. Databases created under v1 carry
   * the non-unique index and have to have it rebuilt.
   *
   * Nothing writes to this store in production yet, so no v1 database can hold
   * rows that would violate the new constraint.
   *
   * @param {object} connection - The open database connection.
   * @param {number} version - Schema version the database is migrating from.
   */
  async (connection, version) => {
    if (version >= 2) {
      return;
    }

    await connection.execute(
      "DROP INDEX IF EXISTS idx_aitab_pages_slug_version;"
    );
    await connection.execute(AITAB_PAGES_SLUG_VERSION_INDEX);
  },
];
