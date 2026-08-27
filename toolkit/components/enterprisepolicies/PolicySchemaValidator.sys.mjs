/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This module validates enterprise policy parameters against the policy schema.
 *
 * Policy data arrives from several sources (policies.json, Windows GPO, macOS
 * config profiles) in shapes that differ from clean JSON. This module turns it
 * into validated, ready-to-use data in three stages:
 *
 *  1. NORMALIZE: transform source-specific quirks into standard JSON so the
 *     value can be validated by an off-the-shelf validator. Booleans delivered
 *     as 0/1 integers or as "true"/"false" strings become real booleans; values
 *     delivered as a JSON string (fields marked "contentMediaType":
 *     "application/json") are parsed into objects/arrays. No validity decisions
 *     happen here.
 *  2. VALIDATE: the compliant validator in JsonSchema.sys.mjs checks the
 *     normalized value using only standard JSON Schema keywords (type, format,
 *     pattern, enum, required). Every entry of a list, and every open-ended key
 *     of an object (one matched by patternProperties, e.g. an extension ID in
 *     ExtensionSettings), is validated individually: invalid entries are dropped
 *     (and logged) so one bad entry never discards the whole collection. Any
 *     other bad value fails its policy.
 *  3. HYDRATE: validated "format": "uri" strings are turned into URL objects,
 *     which the policy implementations consume (.href, .hostname, etc.).
 *
 * The schema itself stays standard JSON Schema, so the same file can drive
 * other tooling (e.g. the enterprise console). "contentMediaType" is the only
 * keyword this module keys on beyond standard validation.
 */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "JsonSchema", () => {
  return ChromeUtils.importESModule("resource://gre/modules/JsonSchema.sys.mjs")
    .JsonSchema;
});

ChromeUtils.defineLazyGetter(lazy, "log", () => {
  let { ConsoleAPI } = ChromeUtils.importESModule(
    "resource://gre/modules/Console.sys.mjs"
  );
  return new ConsoleAPI({
    prefix: "PolicySchemaValidator",
    maxLogLevel: "error",
  });
});

const JSON_MEDIA_TYPE = "application/json";

/**
 * Validate (and coerce) a policy parameter value against a policy schema.
 *
 * @param {any} value
 *   The value to validate, as provided by a policy source (policies.json, GPO,
 *   or macOS config profile).
 * @param {object} schema
 *   The schema for this policy, from policies-schema.json.
 * @param {object} [options]
 * @param {boolean} [options.allowAdditionalProperties]
 *   When true, object properties not described by the schema are stripped from
 *   the parsed value. When false, they cause validation to fail.
 * @param {string} [options.policyName]
 *   Name of the policy being validated, used to root the paths reported when an
 *   invalid entry is dropped.
 * @returns {{valid: boolean, parsedValue?: any, error?: Error}}
 *   On success, `parsedValue` holds the normalized and hydrated value (URL
 *   objects for uri-formatted fields, parsed objects for JSON-string fields,
 *   booleans for 0/1 and "true"/"false", and collections with invalid entries
 *   removed).
 */
export function validate(
  value,
  schema,
  { allowAdditionalProperties = false, policyName = "" } = {}
) {
  try {
    const normalized = trimInvalidEntries(
      normalize(value, schema),
      schema,
      policyName
    );

    const { valid, errors } = lazy.JsonSchema.validate(normalized, schema);
    if (!valid) {
      return { valid: false, error: new Error(formatErrors(errors)) };
    }

    return {
      valid: true,
      parsedValue: hydrate(normalized, schema, allowAdditionalProperties),
    };
  } catch (ex) {
    // A single malformed value must never abort the whole policy engine. The
    // validator throws (rather than returning invalid) for some inputs -- e.g.
    // an undefined value, as a JSON-string policy whose source could not parse
    // it produces -- so fail just this policy instead of letting it propagate.
    return { valid: false, error: ex };
  }
}

/**
 * Signals an object carries a property the schema does not describe while
 * additional properties are disallowed.
 */
class PolicyParameterError extends Error {
  constructor(message) {
    super(message);
    this.name = "PolicyParameterError";
  }
}

function formatErrors(errors) {
  return errors.map(e => `${e.error} (at ${e.instanceLocation})`).join("; ");
}

function pointerSegments(instanceLocation) {
  return instanceLocation
    .replace(/^#/, "")
    .split("/")
    .filter(Boolean)
    .map(segment => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function appendSegment(path, segment) {
  if (/^\d+$/.test(segment)) {
    return `${path}[${segment}]`;
  }
  if (/^[A-Za-z_][\w-]*$/.test(segment)) {
    return `${path}.${segment}`;
  }
  return `${path}["${segment}"]`;
}

/*
 * Describe a dropped entry for an administrator: which field was wrong, what
 * was expected, what arrived, and what happened to the entry. The validator
 * reports the parent "property does not match schema" wrapper alongside the
 * specific failure, so the error with the deepest location is the actionable
 * one.
 */
function describeDroppedEntry(errors, path, value) {
  if (!errors?.length) {
    return `${path}: ${valueToString(value)} is not valid. The entry was ignored.`;
  }

  let deepest = errors[0];
  let deepestSegments = pointerSegments(deepest.instanceLocation);
  for (const error of errors.slice(1)) {
    const segments = pointerSegments(error.instanceLocation);
    if (segments.length > deepestSegments.length) {
      deepest = error;
      deepestSegments = segments;
    }
  }

  const received = deepestSegments.reduce((entry, key) => entry?.[key], value);
  const where = deepestSegments.reduce(appendSegment, path);
  return (
    `${where}: ${deepest.error} Received ${valueToString(received)}. ` +
    `The entry was ignored.`
  );
}

function valueToString(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function effectiveTypes(schema) {
  let types = [];
  if (Array.isArray(schema.type)) {
    types.push(...schema.type);
  } else if (schema.type !== undefined) {
    types.push(schema.type);
  }
  // A "boolean or enumerated string" policy is expressed with anyOf; gather the
  // branch types too so a 0/1 boolean (as GPO/macOS deliver it) is coerced.
  if (Array.isArray(schema.anyOf)) {
    for (let branch of schema.anyOf) {
      if (Array.isArray(branch.type)) {
        types.push(...branch.type);
      } else if (branch.type !== undefined) {
        types.push(branch.type);
      }
    }
  }
  return types;
}

function subschemaForProperty(schema, key) {
  if (schema.properties && Object.hasOwn(schema.properties, key)) {
    return schema.properties[key];
  }
  if (schema.patternProperties) {
    for (const pattern of Object.keys(schema.patternProperties)) {
      if (new RegExp(pattern).test(key)) {
        return schema.patternProperties[pattern];
      }
    }
  }
  return undefined;
}

/*
 * Whether `key` is an open-ended entry of `schema` rather than one of its fixed
 * properties. Only open-ended entries may be dropped individually: a fixed
 * property (ExtensionSettings' "*", SecurityDevices' Add/Delete) carries
 * settings the rest of the policy depends on, so a bad one must fail the policy
 * instead of silently loosening it.
 */
function isPatternProperty(schema, key) {
  if (schema.properties && Object.hasOwn(schema.properties, key)) {
    return false;
  }
  return (
    !!schema.patternProperties &&
    Object.keys(schema.patternProperties).some(pattern =>
      new RegExp(pattern).test(key)
    )
  );
}

function isUriSchema(schema) {
  if (schema.format === "uri") {
    return true;
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.some(branch => branch.format === "uri");
  }
  return false;
}

/*
 * Stage 1. Transform source-specific shapes into standard JSON. Makes no
 * validity decisions; values it cannot transform are left as-is for the
 * validator to judge.
 */
function normalize(value, schema) {
  if (!schema || typeof schema != "object") {
    return value;
  }

  if (schema.contentMediaType === JSON_MEDIA_TYPE && typeof value == "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new PolicyParameterError(
        `value is not valid JSON: ${valueToString(value)}`
      );
    }
  }

  const types = effectiveTypes(schema);

  // GPO (REG_DWORD) and macOS (NSNumber) deliver booleans as 0/1. Only coerce
  // when the field is boolean and not also numeric, otherwise a numeric field
  // (e.g. a Preferences value typed number|boolean|string) would lose its
  // integer value.
  if (
    types.includes("boolean") &&
    !types.includes("number") &&
    !types.includes("integer") &&
    typeof value == "number" &&
    (value === 0 || value === 1)
  ) {
    return !!value;
  }

  // A quoted boolean is a common authoring mistake, and a REG_SZ value always
  // arrives as a string, sometimes padded. Skip fields that also accept a
  // string, so one that legitimately holds "true" keeps its value.
  if (
    types.includes("boolean") &&
    !types.includes("string") &&
    typeof value == "string"
  ) {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "false") {
      return text === "true";
    }
  }

  if (value && typeof value == "object" && !Array.isArray(value)) {
    if (schema.properties || schema.patternProperties) {
      const result = {};
      for (const key of Object.keys(value)) {
        const subschema = subschemaForProperty(schema, key);
        result[key] = subschema ? normalize(value[key], subschema) : value[key];
      }
      return result;
    }
    return value;
  }

  if (Array.isArray(value) && schema.items) {
    return value.map(item => normalize(item, schema.items));
  }

  return value;
}

/*
 * Stage 2 helper. Validate each entry of a collection on its own and keep only
 * the valid ones, so a single bad entry is dropped (and logged) rather than
 * failing the whole policy. Entries matched by patternProperties are the
 * independent ones (an extension ID, a preference name); fixed properties are
 * recursed into but never dropped.
 */
function trimInvalidEntries(value, schema, path = "") {
  if (!schema || typeof schema != "object" || value == null) {
    return value;
  }

  if (typeof value == "object" && !Array.isArray(value)) {
    if (schema.properties || schema.patternProperties) {
      const result = {};
      for (const key of Object.keys(value)) {
        const subschema = subschemaForProperty(schema, key);
        const entryPath = `${path}["${key}"]`;
        const trimmed = subschema
          ? trimInvalidEntries(value[key], subschema, entryPath)
          : value[key];
        if (subschema && isPatternProperty(schema, key)) {
          const { valid, errors } = lazy.JsonSchema.validate(
            trimmed,
            subschema
          );
          if (!valid) {
            lazy.log.error(describeDroppedEntry(errors, entryPath, value[key]));
            continue;
          }
        }
        result[key] = trimmed;
      }
      return result;
    }
    return value;
  }

  if (Array.isArray(value) && schema.items) {
    const result = [];
    for (const [index, item] of value.entries()) {
      const itemPath = `${path}[${index}]`;
      const trimmedItem = trimInvalidEntries(item, schema.items, itemPath);
      const { valid, errors } = lazy.JsonSchema.validate(
        trimmedItem,
        schema.items
      );
      if (valid) {
        result.push(trimmedItem);
      } else {
        lazy.log.error(describeDroppedEntry(errors, itemPath, item));
      }
    }
    return result;
  }

  return value;
}

/*
 * Stage 3. Build the value the policy implementations consume: uri-formatted
 * strings become URL objects, and object properties the schema does not
 * describe are stripped (or rejected when additional properties are
 * disallowed). Runs only after validation succeeds.
 */
function hydrate(value, schema, allowAdditionalProperties) {
  if (!schema || typeof schema != "object" || value == null) {
    return value;
  }

  if (isUriSchema(schema) && typeof value == "string") {
    if (value === "") {
      return "";
    }
    try {
      return new URL(value);
    } catch {
      // The validator accepted this string as a uri but the URL parser does
      // not; leave it as-is rather than throwing.
      return value;
    }
  }

  if (typeof value == "object" && !Array.isArray(value)) {
    if (schema.properties || schema.patternProperties) {
      const result = {};
      for (const key of Object.keys(value)) {
        const subschema = subschemaForProperty(schema, key);
        if (!subschema) {
          if (allowAdditionalProperties) {
            continue;
          }
          throw new PolicyParameterError(
            `Object has unexpected property '${key}'`
          );
        }
        result[key] = hydrate(value[key], subschema, allowAdditionalProperties);
      }
      return result;
    }
    return value;
  }

  if (Array.isArray(value) && schema.items) {
    return value.map(item =>
      hydrate(item, schema.items, allowAdditionalProperties)
    );
  }

  return value;
}

export const PolicySchemaValidator = { validate };
