/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Converts Markdown code spans and JSDoc link tags in doclet descriptions to reST. */

const LINK_TAG_RE =
  /(?:\[([^\]]+)\])?\{@link(?:code|plain)?\s+([^\s|}]+)\s*\|?\s*([^}]*)\}/g;
const CODE_SPAN_RE = /(?<=^|[\s(\[{<"'])`([^`\n]+)`(?=$|[\s.,;:!?)\]}>"'])/gm;

function convert(text) {
  return text
    .replace(LINK_TAG_RE, (_, before, target, after) => {
      let label = (before || after).trim() || target.split("/").pop();
      return `\`\`${label}\`\``;
    })
    .replace(CODE_SPAN_RE, "``$1``");
}

function convertDescription(item) {
  if (typeof item?.description == "string") {
    item.description = convert(item.description);
  }
}

export const handlers = {
  newDoclet({ doclet }) {
    convertDescription(doclet);
    for (let field of ["classdesc", "summary"]) {
      if (typeof doclet[field] == "string") {
        doclet[field] = convert(doclet[field]);
      }
    }
    for (let field of ["params", "properties", "returns", "exceptions"]) {
      doclet[field]?.forEach(convertDescription);
    }
  },
};
