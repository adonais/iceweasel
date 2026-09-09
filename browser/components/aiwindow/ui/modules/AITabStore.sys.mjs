/*
 This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  CURRENT_SCHEMA_VERSION,
  DB_FILE_NAME,
  PREF_BRANCH,
} from "moz-src:///browser/components/aiwindow/ui/modules/AITabConstants.sys.mjs";

import { migrations } from "moz-src:///browser/components/aiwindow/ui/modules/AITabMigrations.sys.mjs";
import {
  AITAB_PAGES_TABLE,
  AITAB_PAGES_SLUG_VERSION_INDEX,
  AITAB_PAGE_INSERT,
  GET_NEXT_VERSION,
  GET_AITAB_BY_SLUG,
  GET_AITAB_BY_SLUG_AND_VERSION,
  GET_AITAB_VERSIONS_BY_SLUG,
  GET_AITAB_PAGES_BY_CONV_ID,
} from "moz-src:///browser/components/aiwindow/ui/modules/AITabSql.sys.mjs";
import { SQLiteStoreBase } from "moz-src:///browser/components/aiwindow/ui/modules/SQLiteStoreBase.sys.mjs";
import {
  parseJSONOrNull,
  toJSONOrNull,
} from "moz-src:///browser/components/aiwindow/ui/modules/ChatUtils.sys.mjs";

/**
 * Simple interface to store and retrieve AITab UI specific data
 *
 * @augments {SQLiteStoreBase}
 */
class AITabStore extends SQLiteStoreBase {
  get logPrefix() {
    return "AITabStore";
  }

  get logLevelPref() {
    return "browser.smartwindow.aiTabStore.logLevel";
  }

  get shutdownBlockerName() {
    return "AITabStore: Shutdown";
  }

  get CURRENT_SCHEMA_VERSION() {
    return CURRENT_SCHEMA_VERSION;
  }

  get databaseFileName() {
    return DB_FILE_NAME;
  }

  get prefBranch() {
    return PREF_BRANCH;
  }

  get createEntityStatements() {
    return [AITAB_PAGES_TABLE, AITAB_PAGES_SLUG_VERSION_INDEX];
  }

  get migrations() {
    return migrations;
  }

  /**
   * Creates a new tab: the first version for a new conv_id. Rejects if the
   * conv_id already has a version (use edit instead).
   *
   * @param {object} page - Page fields: convId, slug, title, and optional
   *   context, components, localState
   * @returns {Promise<object>} The persisted page (with generated uuid,
   *   version, and timestamps)
   */
  async create(page) {
    return this.#insertNextVersion(page, { expectNew: true });
  }

  /**
   * Persists an edit as a new version of an existing tab. The version is the
   * current highest version for the conv_id plus one. Rejects if the conv_id
   * has no existing version (use create instead).
   *
   * @param {object} page - Page fields: convId, slug, title, and optional
   *   context, components, localState
   * @returns {Promise<object>} The newly persisted version
   */
  async edit(page) {
    return this.#insertNextVersion(page, { expectNew: false });
  }

  /**
   * Gets the latest version of the tab with the given slug. This is the common
   * "load the page" query: a slug-only URL implies the newest version.
   *
   * @param {string} slug
   * @returns {Promise<?object>} The latest version, or null if no tab matches
   */
  async getBySlug(slug) {
    await this.#ensureConnection();

    const rows = await this.connection.executeCached(GET_AITAB_BY_SLUG, {
      slug,
    });

    return rows.length ? this.#parseRow(rows[0]) : null;
  }

  /**
   * Gets a specific version of the tab with the given slug.
   *
   * @param {string} slug
   * @param {number} version
   * @returns {Promise<?object>} The matching version, or null if none exists
   */
  async getBySlugAndVersion(slug, version) {
    await this.#ensureConnection();

    const rows = await this.connection.executeCached(
      GET_AITAB_BY_SLUG_AND_VERSION,
      { slug, version }
    );

    return rows.length ? this.#parseRow(rows[0]) : null;
  }

  /**
   * Gets the available version numbers for the tab with the given slug, newest
   * first. Backs the history / undo affordance (which versions exist, and
   * whether an undo target is available).
   *
   * @param {string} slug
   * @returns {Promise<Array<number>>}
   */
  async getVersionsBySlug(slug) {
    await this.#ensureConnection();

    const rows = await this.connection.executeCached(
      GET_AITAB_VERSIONS_BY_SLUG,
      { slug }
    );

    return rows.map(row => row.getResultByName("version"));
  }

  /**
   * Gets every stored version (full page rows) for a conversation, oldest
   * first.
   *
   * @param {string} convId
   * @returns {Promise<Array<object>>}
   */
  async getAITabPagesByConvId(convId) {
    await this.#ensureConnection();

    const rows = await this.connection.executeCached(
      GET_AITAB_PAGES_BY_CONV_ID,
      { conv_id: convId }
    );

    return rows.map(row => this.#parseRow(row));
  }

  /**
   * Converts an aitab_pages result row into a plain page object.
   *
   * @param {mozIStorageRow} row
   * @returns {object}
   */
  #parseRow(row) {
    return {
      uuid: row.getResultByName("uuid"),
      convId: row.getResultByName("conv_id"),
      slug: row.getResultByName("slug"),
      version: row.getResultByName("version"),
      title: row.getResultByName("title"),
      createdAt: row.getResultByName("created_at"),
      updatedAt: row.getResultByName("updated_at"),
      context: parseJSONOrNull(row.getResultByName("context")),
      components: parseJSONOrNull(row.getResultByName("components")),
      localState: parseJSONOrNull(row.getResultByName("localstate")),
    };
  }

  /**
   * Inserts the next version row for a conv_id. The version is computed as
   * MAX(existing version) + 1 (so 1 for a new tab). The version read and
   * the insert run in one transaction so concurrent writers can't collide on
   * the same version number.
   *
   * @param {object} page
   * @param {string} page.convId - Conversation id the page belongs to
   * @param {string} page.slug - Opaque URL token supplied by the caller
   * @param {string} page.title - Human-readable title of the page
   * @param {*} [page.context] - Context describing how the page was created
   * @param {*} [page.components] - Component list describing how the page renders
   * @param {*} [page.localState] - Component state (checkboxes, etc.)
   * @param {object} opts
   * @param {boolean} opts.expectNew - True for create (this must be the first
   *   version); false for edit (a prior version must already exist).
   * @returns {Promise<object>}
   */
  async #insertNextVersion(
    {
      convId,
      slug,
      title,
      context = null,
      components = null,
      localState = null,
    },
    { expectNew }
  ) {
    await this.#ensureConnection();

    const uuid = crypto.randomUUID();
    const now = Date.now() * 1000;
    let version;

    await this.connection
      .executeTransaction(async () => {
        const rows = await this.connection.execute(GET_NEXT_VERSION, {
          conv_id: convId,
        });
        version = rows[0].getResultByName("next_version");

        // version === 1 means this conv_id has no prior rows.
        if (expectNew && version !== 1) {
          throw new Error(
            `create() called for existing tab "${convId}"; use edit()`
          );
        }
        if (!expectNew && version === 1) {
          throw new Error(
            `edit() called for unknown tab "${convId}"; use create()`
          );
        }

        await this.connection.executeCached(AITAB_PAGE_INSERT, {
          uuid,
          conv_id: convId,
          slug,
          version,
          title,
          created_at: now,
          updated_at: now,
          context: toJSONOrNull(context),
          components: toJSONOrNull(components),
          localstate: toJSONOrNull(localState),
        });
      })
      .catch(e => {
        this.log.error(
          "Could not insert AITab page version",
          e.message,
          e.stack
        );
        throw e;
      });

    return {
      uuid,
      convId,
      slug,
      version,
      title,
      createdAt: now,
      updatedAt: now,
      context,
      components,
      localState,
    };
  }

  async #ensureConnection() {
    await this.ensureDatabase().catch(e => {
      this.log.error(
        "Could not ensure a database connection.",
        e.message,
        e.stack
      );
      throw e;
    });
  }
}

const aiTabStore = new AITabStore();
export { aiTabStore as AITabStore };
