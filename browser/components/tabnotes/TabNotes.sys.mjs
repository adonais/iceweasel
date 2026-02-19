/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** @import { OpenedConnection } from "resource://gre/modules/Sqlite.sys.mjs" */

import { Sqlite } from "resource://gre/modules/Sqlite.sys.mjs";

/**
 * @param {string} url
 *   The canonical URL of a tab note to look up
 */
const GET_NOTE_BY_URL = `
SELECT
  id,
  canonical_url,
  created,
  note_text
FROM tabnotes
WHERE
  canonical_url = :url
`;

/**
 * @param {string} url
 *   The canonical URL to associate the new tab note
 * @param {string} note
 *   The sanitized text for a tab note
 */
const CREATE_NOTE = `
INSERT INTO tabnotes
  (canonical_url, created, note_text)
VALUES
  (:url, unixepoch("now"), :note)
RETURNING
  id, canonical_url, created, note_text

`;

/**
 * @param {string} url
 *   The canonical URL for the existing tab note
 * @param {string} note
 *   The sanitized text for a tab note
 */
const UPDATE_NOTE = `
UPDATE
  tabnotes
SET
  note_text = :note
WHERE
  canonical_url = :url
RETURNING
  id, canonical_url, created, note_text
`;

/**
 * @param {string} url
 *   The canonical URL of a tab note to delete
 */
const DELETE_NOTE = `
DELETE FROM
  tabnotes
WHERE
  canonical_url = :url
RETURNING
  id, canonical_url, created, note_text
`;

/**
 * Provides the CRUD interface for tab notes.
 */
export class TabNotesStorage {
  DATABASE_FILE_NAME = Object.freeze("tabnotes.sqlite");
  TELEMETRY_SOURCE = Object.freeze({
    TAB_CONTEXT_MENU: "context_menu",
    TAB_HOVER_PREVIEW_PANEL: "hover_menu",
  });

  /** @type {OpenedConnection|undefined} */
  #connection;

  /**
   * @param {object} [options={}]
   * @param {string} [options.basePath=PathUtils.profileDir]
   *   Base file path to a folder where the database file should live.
   *   Defaults to the current profile's root directory.
   * @returns {Promise<void>}
   */
  init(options) {
    const basePath = options?.basePath ?? PathUtils.profileDir;
    this.dbPath = PathUtils.join(basePath, this.DATABASE_FILE_NAME);
    return Sqlite.openConnection({
      path: this.dbPath,
    }).then(async connection => {
      this.#connection = connection;
      await this.#connection.execute("PRAGMA journal_mode = WAL");
      await this.#connection.execute("PRAGMA wal_autocheckpoint = 16");

      let currentVersion = await this.#connection.getSchemaVersion();

      if (currentVersion == 1) {
        // tabnotes schema is up to date
        return;
      }

      if (currentVersion == 0) {
        // version 0: create `tabnotes` table
        await this.#connection.executeTransaction(async () => {
          await this.#connection.execute(`
          CREATE TABLE IF NOT EXISTS "tabnotes" (
            id            INTEGER PRIMARY KEY,
            canonical_url TEXT NOT NULL,
            created       INTEGER NOT NULL,
            note_text     TEXT NOT NULL
          );`);
          await this.#connection.setSchemaVersion(1);
        });
      }
    });
  }

  /**
   * @returns {Promise<void>}
   */
  deinit() {
    if (this.#connection) {
      return this.#connection.close().then(() => {
        this.#connection = null;
      });
    }
    return Promise.resolve();
  }

  /**
   * @param {MozTabbrowserTab} tab
   * @returns {boolean}
   */
  isEligible(tab) {
    if (tab?.canonicalUrl && URL.canParse(tab.canonicalUrl)) {
      return true;
    }
    return false;
  }

  /**
   * Retrieve a note for a tab, if it exists.
   *
   * @param {MozTabbrowserTab} tab
   *   The tab to check for a note
   * @returns {Promise<TabNoteRecord|undefined>}
   */
  async get(tab) {
    if (!this.isEligible(tab)) {
      return undefined;
    }
    const results = await this.#connection.executeCached(GET_NOTE_BY_URL, {
      url: tab.canonicalUrl,
    });
    if (!results?.length) {
      return undefined;
    }
    const [result] = results;
    const record = this.#mapDbRowToRecord(result);
    return record;
  }

  /**
   * Set a note for a tab.
   *
   * @param {MozTabbrowserTab} tab
   *   The tab that the note should be associated with
   * @param {string} note
   *   The note itself
   * @param {object} [options]
   * @param {TabNoteTelemetrySource} [options.telemetrySource]
   *   The UI surface that requested to set a note.
   * @returns {Promise<TabNoteRecord>}
   *   The actual note that was set after sanitization
   * @throws {RangeError}
   *   if `tab` is not eligible for a tab note or `note` is empty
   */
  async set(tab, note, options = {}) {
    if (!this.isEligible(tab)) {
      throw new RangeError("Tab notes must be associated to an eligible tab");
    }
    if (!note) {
      throw new RangeError("Tab note text must be provided");
    }

    let existingNote = await this.get(tab);
    let sanitized = this.#sanitizeInput(note);

    if (existingNote && existingNote.text == sanitized) {
      return existingNote;
    }

    return this.#connection.executeTransaction(async () => {
      if (!existingNote) {
        const insertResult = await this.#connection.executeCached(CREATE_NOTE, {
          url: tab.canonicalUrl,
          note: sanitized,
        });

        const insertedRecord = this.#mapDbRowToRecord(insertResult[0]);
        tab.dispatchEvent(
          new CustomEvent("TabNote:Created", {
            bubbles: true,
            detail: {
              note: insertedRecord,
              telemetrySource: options.telemetrySource,
            },
          })
        );
        return insertedRecord;
      }

      const updateResult = await this.#connection.executeCached(UPDATE_NOTE, {
        url: tab.canonicalUrl,
        note: sanitized,
      });

      const updatedRecord = this.#mapDbRowToRecord(updateResult[0]);
      tab.dispatchEvent(
        new CustomEvent("TabNote:Edited", {
          bubbles: true,
          detail: {
            note: updatedRecord,
            telemetrySource: options.telemetrySource,
          },
        })
      );
      return updatedRecord;
    });
  }

  /**
   * Delete a note for a tab.
   *
   * @param {MozTabbrowserTab} tab
   *   The tab that has a note
   * @param {object} [options]
   * @param {TabNoteTelemetrySource} [options.telemetrySource]
   *   The UI surface that requested to delete a note.
   * @returns {Promise<boolean>}
   *   True if there was a note and it was deleted; false otherwise
   */
  async delete(tab, options = {}) {
    /** @type {mozIStorageRow[]} */
    const deleteResult = await this.#connection.executeCached(DELETE_NOTE, {
      url: tab.canonicalUrl,
    });

    if (deleteResult?.length > 0) {
      const deletedRecord = this.#mapDbRowToRecord(deleteResult[0]);
      tab.dispatchEvent(
        new CustomEvent("TabNote:Removed", {
          bubbles: true,
          detail: {
            note: deletedRecord,
            telemetrySource: options.telemetrySource,
          },
        })
      );
      return true;
    }

    return false;
  }

  /**
   * Check if a tab has a note.
   *
   * @param {MozTabbrowserTab} tab
   *   The tab to check for a tab note
   * @returns {Promise<boolean>}
   *   True if a note is associated with this URL; false otherwise
   */
  async has(tab) {
    const record = await this.get(tab);
    return record !== undefined;
  }

  /**
   * Clear all notes for all URLs.
   *
   * @returns {void}
   */
  reset() {
    this.#connection.execute(`
      DELETE FROM "tabnotes"`);
  }

  /**
   * Given user-supplied note text, returns sanitized note text.
   *
   * @param {string} value
   * @returns {string}
   */
  #sanitizeInput(value) {
    return value.slice(0, 1000);
  }

  /**
   * @param {mozIStorageRow} row
   *   Row returned with the following data shape:
   *   [id: number, canonical_url: string, created: number, note_text: string]
   * @returns {TabNoteRecord}
   */
  #mapDbRowToRecord(row) {
    return {
      id: row.getDouble(0),
      canonicalUrl: row.getString(1),
      created: Temporal.Instant.fromEpochMilliseconds(row.getDouble(2) * 1000),
      text: row.getString(3),
    };
  }
}

// Singleton object accessible from all windows
export const TabNotes = new TabNotesStorage();
