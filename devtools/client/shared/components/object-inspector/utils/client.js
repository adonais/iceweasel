/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

const {
  getValue,
  nodeHasFullText,
} = require("resource://devtools/client/shared/components/object-inspector/utils/node.js");

async function enumIndexedProperties(objectFront, start, end) {
  try {
    const iterator = await objectFront.enumProperties({
      ignoreNonIndexedProperties: true,
    });
    const response = await iteratorSlice(iterator, start, end);
    return response;
  } catch (e) {
    console.error("Error in enumIndexedProperties", e);
    return {};
  }
}

async function enumNonIndexedProperties(objectFront, start, end) {
  try {
    const iterator = await objectFront.enumProperties({
      ignoreIndexedProperties: true,
    });
    const response = await iteratorSlice(iterator, start, end);
    return response;
  } catch (e) {
    console.error("Error in enumNonIndexedProperties", e);
    return {};
  }
}

async function enumEntries(objectFront, start, end) {
  try {
    const iterator = await objectFront.enumEntries();
    const response = await iteratorSlice(iterator, start, end);
    return response;
  } catch (e) {
    console.error("Error in enumEntries", e);
    return {};
  }
}

async function enumSymbols(objectFront, start, end) {
  try {
    const iterator = await objectFront.enumSymbols();
    const response = await iteratorSlice(iterator, start, end);
    return response;
  } catch (e) {
    console.error("Error in enumSymbols", e);
    return {};
  }
}

async function enumPrivateProperties(objectFront, start, end) {
  try {
    const iterator = await objectFront.enumPrivateProperties();
    const response = await iteratorSlice(iterator, start, end);
    return response;
  } catch (e) {
    console.error("Error in enumPrivateProperties", e);
    return {};
  }
}

async function getPrototype(objectFront) {
  if (typeof objectFront.getPrototype !== "function") {
    console.error("objectFront.getPrototype is not a function");
    return Promise.resolve({});
  }
  try {
    const response = await objectFront.getPrototype();
    return response;
  } catch (e) {
    console.error("Error in getPrototype", e);
    return {};
  }
}

async function getGlobal(objectFront) {
  if (typeof objectFront.getGlobal !== "function") {
    console.error("objectFront.getGlobal is not a function");
    return Promise.resolve({});
  }
  try {
    const response = await objectFront.getGlobal();
    return response;
  } catch (e) {
    console.error("Error in getGlobal", e);
    return {};
  }
}

async function getFullText(longStringFront, item) {
  const { initial, fullText, length } = getValue(item);
  // Return fullText property if it exists so that it can be added to the
  // loadedProperties map.
  if (nodeHasFullText(item)) {
    return { fullText };
  }

  try {
    const substring = await longStringFront.substring(initial.length, length);
    return {
      fullText: initial + substring,
    };
  } catch (e) {
    console.error("LongStringFront.substring", e);
    throw e;
  }
}

async function getPromiseState(objectFront) {
  try {
    const response = await objectFront.getPromiseState();
    return response;
  } catch (e) {
    console.error("Error in getPromiseState", e);
    return {};
  }
}

async function getProxySlots(objectFront) {
  try {
    const response = await objectFront.getProxySlots();
    return response;
  } catch (e) {
    console.error("Error in getProxySlots", e);
    return {};
  }
}

function iteratorSlice(iterator, start, end) {
  start = start || 0;
  const count = end ? end - start + 1 : iterator.count;

  if (count === 0) {
    return Promise.resolve({});
  }
  return iterator.slice(start, count);
}

module.exports = {
  enumEntries,
  enumIndexedProperties,
  enumNonIndexedProperties,
  enumPrivateProperties,
  enumSymbols,
  getFullText,
  getGlobal,
  getPromiseState,
  getPrototype,
  getProxySlots,
};
