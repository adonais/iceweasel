/*
 This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Every time the schema or the underlying data changes, you must bump up the
// schema version and add a migration function.

// This table persists the base `Conversation` model (models/Conversation.sys.mjs).
// Chat-specific columns (title, description, page_url, etc.) belong to
// ChatConversation and are the concern of ChatStore, not this store.
export const CONVERSATION_TABLE = `
CREATE TABLE conversation (
  conv_id TEXT PRIMARY KEY,
  created_date INTEGER NOT NULL,
  updated_date INTEGER NOT NULL,
  feature TEXT,
  security_properties_jsonb BLOB,
  seen_urls_jsonb BLOB,
  serp_urls_for_anonymous_fetch_jsonb BLOB
) WITHOUT ROWID;
`;

export const CONVERSATION_UPDATED_DATE_INDEX = `
CREATE INDEX conversation_updated_date_idx ON conversation(updated_date);
`;

// created_date is insert-only; everything else is refreshed on conflict.
export const CONVERSATION_UPSERT = `
INSERT INTO conversation (
  conv_id, created_date, updated_date, feature,
  security_properties_jsonb, seen_urls_jsonb, serp_urls_for_anonymous_fetch_jsonb
) VALUES (
  :conv_id, :created_date, :updated_date, :feature,
  jsonb(:security_properties), jsonb(:seen_urls),
  jsonb(:serp_urls_for_anonymous_fetch)
)
ON CONFLICT(conv_id) DO UPDATE SET
  updated_date = :updated_date,
  feature = :feature,
  security_properties_jsonb = jsonb(:security_properties),
  seen_urls_jsonb = jsonb(:seen_urls),
  serp_urls_for_anonymous_fetch_jsonb = jsonb(:serp_urls_for_anonymous_fetch);
`;

export const GET_CONVERSATION_BY_ID = `
SELECT conv_id, created_date, updated_date, feature,
  json(security_properties_jsonb) AS security_properties,
  json(seen_urls_jsonb) AS seen_urls,
  json(serp_urls_for_anonymous_fetch_jsonb) AS serp_urls_for_anonymous_fetch
FROM conversation
WHERE conv_id = :conv_id;
`;

export const DELETE_CONVERSATION_BY_ID = `
DELETE FROM conversation WHERE conv_id = :conv_id;
`;

// Persists base `Message` objects (models/Message.sys.mjs). Deleting a
// conversation cascades to its messages via the foreign key.
export const MESSAGE_TABLE = `
CREATE TABLE message (
  message_id TEXT PRIMARY KEY,
  conv_id TEXT NOT NULL REFERENCES conversation(conv_id) ON DELETE CASCADE,
  created_date INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  role INTEGER NOT NULL,
  content_jsonb BLOB,
  turn_index INTEGER,
  parent_message_id TEXT,
  model_id TEXT,
  params_jsonb BLOB,
  usage_jsonb BLOB,
  tool_call_id TEXT,
  tool_name TEXT
) WITHOUT ROWID;
`;

export const MESSAGE_CONV_ID_INDEX = `
CREATE INDEX message_conv_id_idx ON message(conv_id);
`;

export const MESSAGE_INSERT = `
INSERT INTO message (
  message_id, conv_id, created_date, ordinal, role, content_jsonb,
  turn_index, parent_message_id, model_id, params_jsonb, usage_jsonb,
  tool_call_id, tool_name
) VALUES (
  :message_id, :conv_id, :created_date, :ordinal, :role, jsonb(:content),
  :turn_index, :parent_message_id, :model_id, jsonb(:params), jsonb(:usage),
  :tool_call_id, :tool_name
)
ON CONFLICT(message_id) DO UPDATE SET
  ordinal = :ordinal,
  content_jsonb = jsonb(:content),
  params_jsonb = jsonb(:params),
  usage_jsonb = jsonb(:usage);
`;

export const GET_MESSAGES_BY_CONV_ID = `
SELECT message_id, conv_id, created_date, ordinal, role,
  json(content_jsonb) AS content, turn_index, parent_message_id, model_id,
  json(params_jsonb) AS params, json(usage_jsonb) AS usage,
  tool_call_id, tool_name
FROM message
WHERE conv_id = :conv_id
ORDER BY ordinal ASC;
`;

// Deletes the messages of a conversation that are no longer present in memory
// (retry, truncate, clear), leaving surviving rows untouched so the upsert
// doesn't have to churn the whole table on every save. :keep_ids is a JSON
// array of the message_ids to keep; an empty array deletes every message for
// the conversation.
export const DELETE_REMOVED_MESSAGES = `
DELETE FROM message
WHERE conv_id = :conv_id
  AND message_id NOT IN (SELECT value FROM json_each(:keep_ids));
`;
