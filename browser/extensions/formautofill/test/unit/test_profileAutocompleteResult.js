"use strict";

var AddressResult, CreditCardResult;
add_setup(async () => {
  ({ AddressResult, CreditCardResult } = ChromeUtils.importESModule(
    "resource://autofill/ProfileAutoCompleteResult.sys.mjs"
  ));
});

let matchingProfiles = [
  {
    guid: "test-guid-1",
    "given-name": "Timothy",
    "family-name": "Berners-Lee",
    name: "Timothy Berners-Lee",
    organization: "Sesame Street",
    "street-address": "123 Sesame Street.",
    "address-line1": "123 Sesame Street.",
    tel: "1-345-345-3456.",
  },
  {
    guid: "test-guid-2",
    "given-name": "John",
    "family-name": "Doe",
    name: "John Doe",
    organization: "Mozilla",
    "street-address": "331 E. Evelyn Avenue",
    "address-line1": "331 E. Evelyn Avenue",
    tel: "1-650-903-0800",
  },
  {
    guid: "test-guid-3",
    organization: "",
    "street-address": "321, No Name St. 2nd line 3rd line",
    "-moz-street-address-one-line": "321, No Name St. 2nd line 3rd line",
    "address-line1": "321, No Name St.",
    "address-line2": "2nd line",
    "address-line3": "3rd line",
    tel: "1-000-000-0000",
  },
];

let allFieldNames = [
  "given-name",
  "family-name",
  "street-address",
  "address-line1",
  "address-line2",
  "address-line3",
  "organization",
  "tel",
];

function getExpectedAddressImage() {
  return "chrome://browser/skin/fxa/avatar-empty.svg";
}

function makeAddressComment({ primary, secondary, profile }) {
  return JSON.stringify({
    primary,
    secondary,
    ariaLabel: primary + " " + secondary,
    image: getExpectedAddressImage(),
    type: "address",
    fillMessageName: "FormAutofill:FillForm",
    fillMessageData: { profile },
  });
}

function makeCreditCardComment({
  primary,
  secondary,
  ariaLabel,
  image,
  profile,
}) {
  return JSON.stringify({
    primary,
    secondary,
    ariaLabel,
    image,
    type: "payment",
    fillMessageName: "FormAutofill:FillForm",
    fillMessageData: { profile },
  });
}

let addressTestCases = [
  {
    description: "Focus on an `organization` field",
    options: {},
    matchingProfiles,
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "organization" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
      defaultIndex: 0,
      items: [
        {
          value: "",
          style: "autofill",
          label: "Sesame Street",
          comment: makeAddressComment({
            primary: "Sesame Street",
            secondary: "123 Sesame Street.",
            profile: matchingProfiles[0],
          }),
          image: getExpectedAddressImage(),
        },
        {
          value: "",
          style: "autofill",
          label: "Mozilla",
          comment: makeAddressComment({
            primary: "Mozilla",
            secondary: "331 E. Evelyn Avenue",
            profile: matchingProfiles[1],
          }),
          image: getExpectedAddressImage(),
        },
      ],
    },
  },
  {
    description: "Focus on an `tel` field",
    options: {},
    matchingProfiles,
    filledCategories: [
      ["address", "name", "tel", "organization"],
      ["address", "name", "tel", "organization"],
      ["address", "tel"],
    ],
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "tel" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
      defaultIndex: 0,
      items: [
        {
          value: "",
          style: "autofill",
          label: "1-345-345-3456.",
          comment: makeAddressComment({
            primary: "1-345-345-3456.",
            secondary: "123 Sesame Street.",
            profile: matchingProfiles[0],
          }),
          image: getExpectedAddressImage(),
        },
        {
          value: "",
          style: "autofill",
          label: "1-650-903-0800",
          comment: makeAddressComment({
            primary: "1-650-903-0800",
            secondary: "331 E. Evelyn Avenue",
            profile: matchingProfiles[1],
          }),
          image: getExpectedAddressImage(),
        },
        {
          value: "",
          style: "autofill",
          label: "1-000-000-0000",
          comment: makeAddressComment({
            primary: "1-000-000-0000",
            secondary: "321, No Name St. 2nd line 3rd line",
            profile: matchingProfiles[2],
          }),
          image: getExpectedAddressImage(),
        },
      ],
    },
  },
  {
    description: "Focus on an `street-address` field",
    options: {},
    matchingProfiles,
    filledCategories: [
      ["address", "name", "tel", "organization"],
      ["address", "name", "tel", "organization"],
      ["address", "tel"],
    ],
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "street-address" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
      defaultIndex: 0,
      items: [
        {
          value: "",
          style: "autofill",
          label: "123 Sesame Street.",
          comment: makeAddressComment({
            primary: "123 Sesame Street.",
            secondary: "Timothy Berners-Lee",
            profile: matchingProfiles[0],
          }),
          image: getExpectedAddressImage(),
        },
        {
          value: "",
          style: "autofill",
          label: "331 E. Evelyn Avenue",
          comment: makeAddressComment({
            primary: "331 E. Evelyn Avenue",
            secondary: "John Doe",
            profile: matchingProfiles[1],
          }),
          image: getExpectedAddressImage(),
        },
        {
          value: "",
          style: "autofill",
          label: "321, No Name St. 2nd line 3rd line",
          comment: makeAddressComment({
            primary: "321, No Name St. 2nd line 3rd line",
            secondary: "1-000-000-0000",
            profile: matchingProfiles[2],
          }),
          image: getExpectedAddressImage(),
        },
      ],
    },
  },
  {
    description: "Focus on an `address-line1` field",
    options: {},
    matchingProfiles,
    filledCategories: [
      ["address", "name", "tel", "organization"],
      ["address", "name", "tel", "organization"],
      ["address", "tel"],
    ],
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "address-line1" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
      defaultIndex: 0,
      items: [
        {
          value: "",
          style: "autofill",
          label: "123 Sesame Street.",
          comment: makeAddressComment({
            primary: "123 Sesame Street.",
            secondary: "Timothy Berners-Lee",
            profile: matchingProfiles[0],
          }),
          image: getExpectedAddressImage(),
        },
        {
          value: "",
          style: "autofill",
          label: "331 E. Evelyn Avenue",
          comment: makeAddressComment({
            primary: "331 E. Evelyn Avenue",
            secondary: "John Doe",
            profile: matchingProfiles[1],
          }),
          image: getExpectedAddressImage(),
        },
        {
          value: "",
          style: "autofill",
          label: "321, No Name St.",
          comment: makeAddressComment({
            primary: "321, No Name St.",
            secondary: "1-000-000-0000",
            profile: matchingProfiles[2],
          }),
          image: getExpectedAddressImage(),
        },
      ],
    },
  },
  {
    description: "No matching profiles",
    options: {},
    matchingProfiles: [],
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_NOMATCH,
      defaultIndex: 0,
      items: [],
    },
  },
  {
    description: "Search with failure",
    options: { resultCode: Ci.nsIAutoCompleteResult.RESULT_FAILURE },
    matchingProfiles: [],
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_FAILURE,
      defaultIndex: 0,
      items: [],
    },
  },
];

matchingProfiles = [
  {
    guid: "test-guid-1",
    "cc-name": "Timothy Berners-Lee",
    "cc-number": "************6785",
    "cc-exp-month": 12,
    "cc-exp-year": 2014,
    "cc-type": "visa",
  },
  {
    guid: "test-guid-2",
    "cc-name": "John Doe",
    "cc-number": "************1234",
    "cc-exp-month": 4,
    "cc-exp-year": 2014,
    "cc-type": "amex",
  },
  {
    guid: "test-guid-3",
    "cc-number": "************5678",
    "cc-exp-month": 8,
    "cc-exp-year": 2018,
  },
];

allFieldNames = ["cc-name", "cc-number", "cc-exp-month", "cc-exp-year"];

// The third profile has no security code and is expected to be filtered out
// when a `cc-csc` field is focused.
const cscMatchingProfiles = [
  {
    guid: "test-guid-1",
    "cc-name": "Timothy Berners-Lee",
    "cc-number": "************6785",
    "cc-exp-month": 12,
    "cc-exp-year": 2014,
    "cc-type": "visa",
    "cc-csc": "123",
  },
  {
    guid: "test-guid-2",
    "cc-name": "John Doe",
    "cc-number": "************1234",
    "cc-exp-month": 4,
    "cc-exp-year": 2014,
    "cc-type": "amex",
    "cc-csc": "4567",
  },
  {
    guid: "test-guid-3",
    "cc-name": "No Security Code",
    "cc-number": "************5678",
    "cc-exp-month": 8,
    "cc-exp-year": 2018,
  },
];

let creditCardTestCases = [
  {
    description: "Focus on a `cc-name` field",
    options: {},
    matchingProfiles,
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "cc-name" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
      defaultIndex: 0,
      items: [
        {
          value: "",
          style: "autofill",
          label: "Timothy Berners-Lee",
          comment: makeCreditCardComment({
            primary: "Timothy Berners-Lee",
            secondary: "••••6785",
            ariaLabel: "Visa Timothy Berners-Lee ••••6785",
            image: "chrome://formautofill/content/third-party/cc-logo-visa.svg",
            profile: matchingProfiles[0],
          }),
          image: "chrome://formautofill/content/third-party/cc-logo-visa.svg",
        },
        {
          value: "",
          style: "autofill",
          label: "John Doe",
          comment: makeCreditCardComment({
            primary: "John Doe",
            secondary: "••••1234",
            ariaLabel: "American Express John Doe ••••1234",
            image: "chrome://formautofill/content/third-party/cc-logo-amex.png",
            profile: matchingProfiles[1],
          }),
          image: "chrome://formautofill/content/third-party/cc-logo-amex.png",
        },
      ],
    },
  },
  {
    description: "Focus on a `cc-number` field",
    options: {},
    matchingProfiles,
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "cc-number" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
      defaultIndex: 0,
      items: [
        {
          value: "",
          style: "autofill",
          label: "••••6785",
          comment: makeCreditCardComment({
            primary: "••••6785",
            secondary: "Timothy Berners-Lee",
            ariaLabel: "Visa 6785 Timothy Berners-Lee",
            image: "chrome://formautofill/content/third-party/cc-logo-visa.svg",
            profile: matchingProfiles[0],
          }),
          image: "chrome://formautofill/content/third-party/cc-logo-visa.svg",
        },
        {
          value: "",
          style: "autofill",
          label: "••••1234",
          comment: makeCreditCardComment({
            primary: "••••1234",
            secondary: "John Doe",
            ariaLabel: "American Express 1234 John Doe",
            image: "chrome://formautofill/content/third-party/cc-logo-amex.png",
            profile: matchingProfiles[1],
          }),
          image: "chrome://formautofill/content/third-party/cc-logo-amex.png",
        },
        {
          value: "",
          style: "autofill",
          label: "••••5678",
          comment: makeCreditCardComment({
            primary: "••••5678",
            secondary: "",
            ariaLabel: "5678",
            image: "chrome://formautofill/content/icon-credit-card-generic.svg",
            profile: matchingProfiles[2],
          }),
          image: "chrome://formautofill/content/icon-credit-card-generic.svg",
        },
      ],
    },
  },
  {
    // The security code is never displayed, so the entry is named after the
    // field and the card number is shown as the secondary label. A form that
    // only asks for the security code has no other credit card field to build a
    // secondary label from, so the card number is the only thing keeping the
    // entries distinguishable.
    description: "Focus on a `cc-csc` field in a security-code-only form",
    options: {},
    matchingProfiles: cscMatchingProfiles,
    allFieldNames: ["cc-csc"],
    searchString: "",
    fieldDetail: { fieldName: "cc-csc" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
      defaultIndex: 0,
      items: [
        {
          value: "",
          style: "autofill",
          label: "CVC",
          comment: makeCreditCardComment({
            primary: "CVC",
            secondary: "••••6785",
            ariaLabel: "Visa CVC ••••6785",
            image: "chrome://formautofill/content/third-party/cc-logo-visa.svg",
            profile: cscMatchingProfiles[0],
          }),
          image: "chrome://formautofill/content/third-party/cc-logo-visa.svg",
        },
        {
          value: "",
          style: "autofill",
          label: "CVC",
          comment: makeCreditCardComment({
            primary: "CVC",
            secondary: "••••1234",
            ariaLabel: "American Express CVC ••••1234",
            image: "chrome://formautofill/content/third-party/cc-logo-amex.png",
            profile: cscMatchingProfiles[1],
          }),
          image: "chrome://formautofill/content/third-party/cc-logo-amex.png",
        },
      ],
    },
  },
  {
    // The security code entry is labelled the same way no matter what else the
    // form asks for, so the card number wins over the other credit card fields
    // that would normally supply the secondary label.
    description: "Focus on a `cc-csc` field in a full credit card form",
    options: {},
    matchingProfiles: cscMatchingProfiles,
    allFieldNames: [...allFieldNames, "cc-csc"],
    searchString: "",
    fieldDetail: { fieldName: "cc-csc" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
      defaultIndex: 0,
      items: [
        {
          value: "",
          style: "autofill",
          label: "CVC",
          comment: makeCreditCardComment({
            primary: "CVC",
            secondary: "••••6785",
            ariaLabel: "Visa CVC ••••6785",
            image: "chrome://formautofill/content/third-party/cc-logo-visa.svg",
            profile: cscMatchingProfiles[0],
          }),
          image: "chrome://formautofill/content/third-party/cc-logo-visa.svg",
        },
        {
          value: "",
          style: "autofill",
          label: "CVC",
          comment: makeCreditCardComment({
            primary: "CVC",
            secondary: "••••1234",
            ariaLabel: "American Express CVC ••••1234",
            image: "chrome://formautofill/content/third-party/cc-logo-amex.png",
            profile: cscMatchingProfiles[1],
          }),
          image: "chrome://formautofill/content/third-party/cc-logo-amex.png",
        },
      ],
    },
  },
  {
    description: "No matching profiles",
    options: {},
    matchingProfiles: [],
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_NOMATCH,
      defaultIndex: 0,
      items: [],
    },
  },
  {
    description: "Search with failure",
    options: { resultCode: Ci.nsIAutoCompleteResult.RESULT_FAILURE },
    matchingProfiles: [],
    allFieldNames,
    searchString: "",
    fieldDetail: { fieldName: "" },
    expected: {
      searchResult: Ci.nsIAutoCompleteResult.RESULT_FAILURE,
      defaultIndex: 0,
      items: [],
    },
  },
];

add_task(async function test_all_patterns() {
  let testSets = [
    {
      collectionConstructor: AddressResult,
      testCases: addressTestCases,
    },
    {
      collectionConstructor: CreditCardResult,
      testCases: creditCardTestCases,
    },
  ];

  testSets.forEach(({ collectionConstructor, testCases }) => {
    testCases.forEach(testCase => {
      info("Starting testcase: " + testCase.description);
      let actual = new collectionConstructor(
        testCase.searchString,
        testCase.fieldDetail,
        testCase.allFieldNames,
        testCase.matchingProfiles,
        testCase.options
      );
      let expectedValue = testCase.expected;
      let expectedItemLength = expectedValue.items.length;
      // If the last item shows up as a footer, we expect one more item
      // than expected.
      if (actual.getStyleAt(actual.matchCount - 1) == "action") {
        expectedItemLength++;
      }

      equal(actual.searchResult, expectedValue.searchResult);
      equal(actual.defaultIndex, expectedValue.defaultIndex);
      equal(actual.matchCount, expectedItemLength);
      expectedValue.items.forEach((item, index) => {
        equal(actual.getValueAt(index), item.value);
        Assert.deepEqual(
          JSON.parse(actual.getCommentAt(index)),
          JSON.parse(item.comment)
        );
        equal(actual.getLabelAt(index), item.label);
        equal(actual.getStyleAt(index), item.style);
        equal(actual.getImageAt(index), item.image);
      });

      if (expectedValue.items.length) {
        Assert.throws(
          () => actual.getValueAt(expectedItemLength),
          /Index out of range\./
        );

        Assert.throws(
          () => actual.getLabelAt(expectedItemLength),
          /Index out of range\./
        );

        Assert.throws(
          () => actual.getCommentAt(expectedItemLength),
          /Index out of range\./
        );
      }
    });
  });
});

function makeExternalEntry(style, label) {
  return {
    style,
    value: "",
    label,
    image: "",
    comment: JSON.stringify({ type: style }),
  };
}

add_task(async function test_external_entries_order() {
  const addressProfiles = [
    { guid: "external-guid-1", organization: "Sesame Street" },
    { guid: "external-guid-2", organization: "Mozilla" },
  ];

  function newResult(externalEntries) {
    const result = new AddressResult(
      "",
      { fieldName: "organization" },
      ["organization"],
      addressProfiles,
      {}
    );
    result.externalEntries.push(...externalEntries);
    return result;
  }

  function stylesOf(result) {
    return Array.from({ length: result.matchCount }, (_, index) =>
      result.getStyleAt(index)
    );
  }

  const smartFormFill = makeExternalEntry("smartFormFill", "Smart Form Fill");
  const generic = makeExternalEntry("generic", "Use Firefox Relay");

  info("An external entry sits between the profile rows and the footer");
  let result = newResult([smartFormFill]);
  Assert.deepEqual(stylesOf(result), [
    "autofill",
    "autofill",
    "smartFormFill",
    "action",
  ]);
  equal(result.getLabelAt(2), "Smart Form Fill");
  equal(
    result.getTypeOfIndex(3),
    "manage",
    "The footer is still recognized at its new index"
  );

  info("The footer stays last whatever the external entries are");
  result = newResult([generic, smartFormFill]);
  Assert.deepEqual(stylesOf(result), [
    "autofill",
    "autofill",
    "generic",
    "smartFormFill",
    "action",
  ]);
  equal(result.matchCount, 5, "Reordering does not change the match count");
  equal(
    result.getTypeOfIndex(2),
    "item",
    "An external entry is not treated as the footer"
  );

  Assert.throws(() => result.getValueAt(5), /Index out of range\./);
});

add_task(async function test_insecure_credit_card_form_has_no_footer() {
  const result = new CreditCardResult(
    "",
    { fieldName: "cc-name" },
    ["cc-name"],
    [{ guid: "insecure-guid-1", "cc-name": "John Doe" }],
    { isSecure: false }
  );
  result.externalEntries.push(
    makeExternalEntry("generic", "Use Firefox Relay")
  );

  equal(
    result.matchCount,
    2,
    "No footer is added, so only the warning row and the external entry"
  );
  equal(
    result.getTypeOfIndex(0),
    "insecure",
    "The warning row keeps its own type"
  );
  equal(
    result.getLabelAt(1),
    "Use Firefox Relay",
    "The warning row stays ahead of the external entry"
  );
});
