/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Provides the CRUD interface for tab notes.
 */
export class TabNotesStorage {
  /** @type {Map<URL, string>} */
  #store;

  constructor() {
    this.reset();
  }

  /**
   * Retrieve a note for a URL, if it exists.
   *
   * @param {URL} url
   *   The URL that the note is associated with
   * @returns {string | undefined }
   */
  get(url) {
    return this.#store.get(url);
  }

  /**
   * Set a note for a URL.
   *
   * @param {URL} url
   *   The URL that the note should be associated with
   * @param {string} note
   *   The note itself
   * @returns {string}
   *   The actual note that was set after sanitization
   */
  set(url, note) {
    let existingNote = this.get(url);
    let sanitized = this.#sanitizeInput(note);
    this.#store.set(url, sanitized);
    if (!existingNote) {
      Services.obs.notifyObservers(null, "TabNote:Created", url.toString());
    } else if (existingNote && existingNote != sanitized) {
      Services.obs.notifyObservers(null, "TabNote:Edited", url.toString());
    }

    return sanitized;
  }

  /**
   * Delete a note for a URL.
   *
   * @param {URL} url
   *   The URL of the note
   * @returns {boolean}
   *   True if there was a note and it was deleted; false otherwise
   */
  delete(url) {
    let wasDeleted = this.#store.delete(url);
    if (wasDeleted) {
      Services.obs.notifyObservers(null, "TabNote:Removed", url.toString());
    }
    return wasDeleted;
  }

  /**
   * Check if a URL has a note.
   *
   * @param {URL} url
   *   The URL of the note
   * @returns {boolean}
   *   True if a note is associated with this URL; false otherwise
   */
  has(url) {
    return this.#store.has(url);
  }

  /**
   * Clear all notes for all URLs.
   *
   * @returns {void}
   */
  reset() {
    this.#store = new Map();
  }

  #sanitizeInput(value) {
    return value.slice(0, 1000);
  }
}

// Singleton object accessible from all windows
export const TabNotes = new TabNotesStorage();
