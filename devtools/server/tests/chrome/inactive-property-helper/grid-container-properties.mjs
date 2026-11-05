/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// InactivePropertyHelper test cases:
// `grid-auto-columns`, `grid-auto-flow`, `grid-auto-rows`, `grid-template`,
// `grid-template-areas`, `grid-template-columns`, `grid-template-rows`,
// and `justify-items`.
let tests = [];

const propList = [
  { propertyName: "grid-auto-columns", propertyValue: "100px" },
  { propertyName: "grid-auto-flow", propertyValue: "columns" },
  { propertyName: "grid-auto-rows", propertyValue: "100px" },
  { propertyName: "grid-template", propertyValue: "auto / auto" },
  { propertyName: "grid-template-areas", propertyValue: "a b c" },
  { propertyName: "grid-template-columns", propertyValue: "100px 1fr" },
  { propertyName: "grid-template-rows", propertyValue: "100px 1fr" },
  { propertyName: "justify-items", propertyValue: "center" },
];

for (const { propertyName, propertyValue } of propList) {
  tests = tests.concat(createTestsForProp(propertyName, propertyValue));
}

function createTestsForProp(propertyName, propertyValue) {
  return [
    {
      info: `${propertyName} is active on a grid container`,
      property: propertyName,
      tagName: "div",
      rules: [`div { display:grid; ${propertyName}: ${propertyValue}; }`],
      isActive: true,
    },
    {
      info: `${propertyName} is inactive on a non-grid container`,
      property: propertyName,
      tagName: "div",
      rules: [`div { ${propertyName}: ${propertyValue}; }`],
      isActive: false,
    },
  ];
}

for (const { propertyName, propertyValue } of propList) {
  tests.push(
    {
      info: `${propertyName} is active on a grid-lanes container`,
      property: propertyName,
      tagName: "div",
      rules: [
        `div { display: grid-lanes; ${propertyName}: ${propertyValue}; }`,
      ],
      isActive: true,
    },
    {
      info: `${propertyName} is active on an inline-grid-lanes container`,
      property: propertyName,
      tagName: "div",
      rules: [
        `div { display: inline-grid-lanes; ${propertyName}: ${propertyValue}; }`,
      ],
      isActive: true,
    }
  );
}

export default tests;
