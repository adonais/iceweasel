/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// getMemories filtering constants
export const MEMORY_FILTER_COMPARATOR = {
  /** Arrays against individual values */
  INCLUDES: "INCLUDES", // Memory field is an array and includes the filter value
  IN: "IN", // Filter value is an array and includes the memory field

  /** Individual values against individual values */
  GREATER_THAN: "GREATER_THAN", // Memory field is greater than the filter value
  LESS_THAN: "LESS_THAN", // Memory field is less than the filter value
  GREATER_THAN_OR_EQUAL_TO: "GREATER_THAN_OR_EQUAL_TO", // Memory field is greater than or equal to the filter value
  LESS_THAN_OR_EQUAL_TO: "LESS_THAN_OR_EQUAL_TO", // Memory field is less than or equal to the filter value
  EQUAL_TO: "EQUAL_TO", // Memory field is exactly the same as the filter value
  LIKE: "LIKE", // Memory field is semantically similar to the filter value (only memory_summary supported)

  /** Arrays against arrays */
  SOME: "SOME", // Both the memory field and value are **arrays** and the memory field array includes some of the filter value array
  ALL: "ALL", // Both the memory field and value are **arrays** and the memory field array is the same as the filter value array
};

const MEMORY_FILTER_STRING_FIELDS = [
  "type",
  "sensitivity_category",
  "memory_summary",
  "reasoning",
];
const MEMORY_FILTER_ARRAY_FIELDS = [
  "sources",
  "tags",
  "keywords",
  "component_summaries",
];
const MEMORY_FILTER_NUMBER_FIELDS = [
  "created_at",
  "updated_at",
  "last_accessed",
  "lifetime_accessed_count",
  "frecency",
  "merge_count",
];
const MEMORY_FILTER_SCALAR_FIELDS = [
  ...MEMORY_FILTER_STRING_FIELDS,
  ...MEMORY_FILTER_NUMBER_FIELDS,
];

// Matches recent_accessed_counts filter field addressing into the day-keyed count map, e.g.
// "recent_accessed_counts.[0]" or "recent_accessed_counts.[0-2,4]". Captures the
// map field name and the comma/range day list (which may be empty).
export const AGGREGATE_FIELD_REGEX =
  /^(recent_accessed_counts)\.\[([\d,\s-]*)\]$/;

// Shared validator for numeric ordering comparators
const NUMERIC_FILTER_VALIDATOR = {
  field: field =>
    typeof field === "string" &&
    (MEMORY_FILTER_NUMBER_FIELDS.includes(field) ||
      AGGREGATE_FIELD_REGEX.test(field)),
  value: value => Number.isFinite(value),
};

// Shared validator for array comparators
const ARRAY_FILTER_VALIDATOR = {
  field: field => MEMORY_FILTER_ARRAY_FIELDS.includes(field),
  value: value => Array.isArray(value),
};

// Validators for filter fields and values
export const MEMORY_FILTER_VALIDATORS = {
  [MEMORY_FILTER_COMPARATOR.INCLUDES]: {
    field: field => MEMORY_FILTER_ARRAY_FIELDS.includes(field),
    value: value => value !== Object(value),
  },
  [MEMORY_FILTER_COMPARATOR.IN]: {
    field: field => MEMORY_FILTER_SCALAR_FIELDS.includes(field),
    value: value => Array.isArray(value),
  },
  [MEMORY_FILTER_COMPARATOR.GREATER_THAN]: NUMERIC_FILTER_VALIDATOR,
  [MEMORY_FILTER_COMPARATOR.LESS_THAN]: NUMERIC_FILTER_VALIDATOR,
  [MEMORY_FILTER_COMPARATOR.GREATER_THAN_OR_EQUAL_TO]: NUMERIC_FILTER_VALIDATOR,
  [MEMORY_FILTER_COMPARATOR.LESS_THAN_OR_EQUAL_TO]: NUMERIC_FILTER_VALIDATOR,
  [MEMORY_FILTER_COMPARATOR.EQUAL_TO]: {
    field: field =>
      typeof field === "string" &&
      (MEMORY_FILTER_SCALAR_FIELDS.includes(field) ||
        AGGREGATE_FIELD_REGEX.test(field)),
    value: value => value !== Object(value),
  },
  [MEMORY_FILTER_COMPARATOR.SOME]: ARRAY_FILTER_VALIDATOR,
  [MEMORY_FILTER_COMPARATOR.ALL]: ARRAY_FILTER_VALIDATOR,
  [MEMORY_FILTER_COMPARATOR.LIKE]: {
    field: field => field === "memory_summary",
    value: value => typeof value === "string",
  },
};

// Filtering predicates used in conjunction with the comparators above
export const MEMORY_FILTER_PREDICATES = {
  [MEMORY_FILTER_COMPARATOR.INCLUDES]: (field, value) =>
    Array.isArray(field) && field.includes(value),
  [MEMORY_FILTER_COMPARATOR.IN]: (field, value) => value.includes(field),
  [MEMORY_FILTER_COMPARATOR.GREATER_THAN]: (field, value) => field > value,
  [MEMORY_FILTER_COMPARATOR.LESS_THAN]: (field, value) => field < value,
  [MEMORY_FILTER_COMPARATOR.GREATER_THAN_OR_EQUAL_TO]: (field, value) =>
    field >= value,
  [MEMORY_FILTER_COMPARATOR.LESS_THAN_OR_EQUAL_TO]: (field, value) =>
    field <= value,
  [MEMORY_FILTER_COMPARATOR.EQUAL_TO]: (field, value) => field === value,
  [MEMORY_FILTER_COMPARATOR.SOME]: (field, value) =>
    Array.isArray(field) && value.some(v => field.includes(v)),
  [MEMORY_FILTER_COMPARATOR.ALL]: (field, value) => {
    if (!Array.isArray(field)) {
      return false;
    }
    const fieldSet = new Set(field);
    const valueSet = new Set(value);
    return (
      fieldSet.size === valueSet.size &&
      [...valueSet].every(v => fieldSet.has(v))
    );
  },
};
