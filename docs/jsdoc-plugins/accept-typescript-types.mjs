/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Firefox JSDoc comments are type-checked by TypeScript (`./mach ts check`),
// so they use TypeScript type syntax. catharsis, the Closure-only parser jsdoc
// hands a type expression to, rejects it -- and jsdoc then drops the whole tag,
// description and all, so what it documented vanishes from the rendered page.
// Anything is a valid Closure type name once quoted, so quote the expressions
// catharsis rejects before it sees them and unquote them again on the doclet.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// catharsis is jsdoc's dependency rather than ours, so resolve it through
// jsdoc: the grammar an expression is tested against here is then the one
// jsdoc will parse it with, whatever the layout of node_modules.
const catharsis = require(
  require.resolve("catharsis", {
    paths: [require.resolve("jsdoc/package.json")],
  })
);

const MARKER = "$$TS$$";
const WRAPPED_RE = /^"\$\$TS\$\$([\s\S]*)"$/;
const DOC_COMMENT_RE = /\/\*\*[\s\S]*?\*\//g;
// The start of a tag's braced type expression. Only the tags below are
// rewritten: jsdoc keeps the braced text of a tag such as `@this`, and of one
// it does not know at all, verbatim in the doclet, where the quoting would
// show up in the rendered page rather than being undone by `unwrap`.
const TYPE_TAG_RE =
  /@(?:param|arg|argument|property|prop|returns?|yields?|throws|exception|type|typedef|member|var|const|constant|enum)[ \t]*\{/g;
const TYPED_PROPERTIES = [
  "params",
  "properties",
  "returns",
  "yields",
  "exceptions",
];

function isParseable(expression) {
  try {
    catharsis.parse(expression, { jsdoc: true, useCache: false });
    return true;
  } catch (e) {
    return false;
  }
}

// The index of the brace closing the one at `start`, or -1 if it never closes.
function closingBrace(comment, start) {
  let depth = 0;
  for (let i = start; i < comment.length; i++) {
    depth += (comment[i] === "{") - (comment[i] === "}");
    if (!depth) {
      return i;
    }
  }
  return -1;
}

function rewriteComment(comment) {
  let prefix = /\n([ \t]*\*)/.exec(comment)?.[1] ?? " *";
  let rewritten = "";
  let index = 0;
  for (let match of comment.matchAll(TYPE_TAG_RE)) {
    let start = match.index + match[0].length - 1;
    let end = closingBrace(comment, start);
    // A match inside an expression already rewritten is part of that
    // expression, not a tag of its own.
    if (start < index || end < 0) {
      continue;
    }
    let raw = comment.slice(start + 1, end);
    // jsdoc strips the `*` that opens each line of a comment before it parses
    // the tags, so an expression has to be read the same way to be recognized.
    let expression = raw
      .replace(/\n[ \t]*\*/g, "\n")
      .replace(/\s+/g, " ")
      .replace(/ (?=\.)/g, "")
      .trim();
    // An inline tag such as `{@link Foo}` is not a type expression.
    if (!expression || expression.startsWith("@") || isParseable(expression)) {
      continue;
    }
    // Replacing a multi-line expression with a single line would renumber the
    // rest of the file, so pad the replacement back out to its line count.
    let quoted = expression.replace(/[\\"]/g, "\\$&");
    let padding = `\n${prefix}`.repeat(raw.split("\n").length - 1);
    rewritten += `${comment.slice(index, start)}{"${MARKER}${quoted}"}${padding}`;
    index = end + 1;
  }
  return rewritten + comment.slice(index);
}

function unwrap(typed) {
  for (let entry of [].concat(typed ?? [])) {
    entry?.type?.names?.forEach((typeName, i) => {
      entry.type.names[i] = typeName.replace(WRAPPED_RE, (_, expression) =>
        expression.replace(/\\([\\"])/g, "$1")
      );
    });
  }
}

export const handlers = {
  beforeParse(e) {
    e.source = e.source.replace(DOC_COMMENT_RE, rewriteComment);
  },

  newDoclet({ doclet }) {
    unwrap(doclet);
    for (let property of TYPED_PROPERTIES) {
      unwrap(doclet[property]);
    }
  },
};
