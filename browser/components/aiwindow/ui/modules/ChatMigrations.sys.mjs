import { MESSAGE_CONV_ID_INDEX } from "./ChatSql.sys.mjs";

/*
 This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Please refer to sql.mjs for details on creating new migrations.
 *
 * - List each change here and what it's for.
 *
 * @param {OpenedConnection} conn - The SQLite connection to use for the migration
 * @param {number} version - The version number of the current schema
 */
async function applyV2(conn, version) {
  if (version < 2) {
    await conn.execute(MESSAGE_CONV_ID_INDEX);
  }
}

/**
 * Array of migration functions to run in the order they should be run in.
 *
 * @returns {Array<Function>}
 */
export const migrations = [applyV2];
