// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @fileoverview Disallows usage of insecure protocols in URL strings
 */

"use strict";

const DEFAULT_BLOCKLIST = [/^(ftp|http|telnet|ws):\/\//i];

const DEFAULT_EXCEPTIONS = [
  // TODO: add more typical false positives such as XML schemas after more testing
  /^http:(\/\/|\\u002f\\u002f)schemas\.microsoft\.com(\/\/|\\u002f\\u002f)?.*/i,
  /^http:(\/\/|\\u002f\\u002f)schemas\.openxmlformats\.org(\/\/|\\u002f\\u002f)?.*/i,
  /^http:(\/|\\u002f){2}localhost(:|\/|\\u002f)*/i,
  /^http:(\/\/)www\.w3\.org\/1999\/xhtml/i,
  /^http:(\/\/)www\.w3\.org\/2000\/svg/i
];

const DEFAULT_VARIABLES_EXECEPTIONS = [];

module.exports = {
  defaultBlocklist: DEFAULT_BLOCKLIST,
  defaultExceptions: DEFAULT_EXCEPTIONS,
  defaultVarExecptions: DEFAULT_VARIABLES_EXECEPTIONS,
  meta: {
    type: "suggestion",
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          blocklist: {
            type: "array",
            items: {
              type: "string"
            }
          },
          exceptions: {
            type: "array",
            items: {
              type: "string"
            }
          },
          varExceptions: {
            type: "array",
            items: {
              type: "string"
            }
          }
        },
        additionalProperties: false
      }
    ],
    docs: {
      category: "Security",
      description:
        "Insecure protocols such as [HTTP](https://en.wikipedia.org/wiki/Hypertext_Transfer_Protocol) or [FTP](https://en.wikipedia.org/wiki/File_Transfer_Protocol) should be replaced by their encrypted counterparts ([HTTPS](https://en.wikipedia.org/wiki/HTTPS), [FTPS](https://en.wikipedia.org/wiki/FTPS)) to avoid sending (potentially sensitive) data over untrusted network in plaintext.",
      url: "https://github.com/microsoft/eslint-plugin-sdl/blob/master/docs/rules/no-insecure-url.md"
    },
    messages: {
      doNotUseInsecureUrl: "Do not use insecure URLs"
    }
  },
  create: function (context) {
    const options = context.options[0] || {};
    const blocklist = (options.blocklist || DEFAULT_BLOCKLIST).map((pattern) => {
      return new RegExp(pattern, "i");
    });
    const exceptions = (options.exceptions || DEFAULT_EXCEPTIONS).map((pattern) => {
      return new RegExp(pattern, "i");
    });
    const varExceptions = (options.varExceptions || DEFAULT_VARIABLES_EXECEPTIONS).map(
      (pattern) => {
        return new RegExp(pattern, "i");
      }
    );

    function matches(patterns, value) {
      return (
        patterns.find((re) => {
          return re.test(value);
        }) !== undefined
      );
    }

    function shouldFix(varExceptions, context, node) {
      // check variable for unfixable pattern e.g. `var insecureURL = "http://..."`
      let text = node.parent
        ? context.sourceCode.getText(node.parent)
        : context.sourceCode.getText(node);
      // if no match, fix the line
      return !matches(varExceptions, text);
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") {
          // Add an exception for xmlns attributes
          if (
            node.parent &&
            node.parent.type === "JSXAttribute" &&
            node.parent.name &&
            node.parent.name.name === "xmlns"
          ) {
            // Do nothing
          } else if (
            matches(blocklist, node.value) &&
            !matches(exceptions, node.value) &&
            shouldFix(varExceptions, context, node)
          ) {
            context.report({
              node: node,
              messageId: "doNotUseInsecureUrl",
              fix(fixer) {
                // Only fix if it contains an http url
                if (node.value.toLowerCase().includes("http")) {
                  let fixedString = node.value.replace(/http:/i, "https:");
                  //insert an "s" before ":/" to change http:/ to https:/
                  return fixer.replaceText(node, JSON.stringify(fixedString));
                }
              }
            });
          }
        }
      },
      TemplateElement(node) {
        if (typeof node.value.raw === "string" && typeof node.value.cooked === "string") {
          const rawStringText = node.value.raw;
          const cookedStringText = node.value.cooked;

          if (
            (shouldFix(varExceptions, context, node) &&
              matches(blocklist, rawStringText) &&
              !matches(exceptions, rawStringText)) ||
            (matches(blocklist, cookedStringText) && !matches(exceptions, cookedStringText))
          ) {
            context.report({
              node: node,
              messageId: "doNotUseInsecureUrl",
              fix(fixer) {
                // Only fix if it contains an http url
                if (node.value.raw.toLowerCase().includes("http")) {
                  let escapedString = JSON.stringify(context.sourceCode.getText(node));
                  // delete "" that JSON.stringify created and convert to `` string
                  escapedString = `` + escapedString.substring(1, escapedString.length - 1);
                  let fixedString = escapedString.replace(/http:/i, "https:");
                  //insert an "s" before ":/" to change http:/ to https:/
                  return fixer.replaceText(node, fixedString);
                }
              }
            });
          }
        }
      }
    };
  }
};
