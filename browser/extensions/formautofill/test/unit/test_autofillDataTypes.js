/*
 * Tests that the AutofillDataTypes registry stays consistent with the rest of
 * Form Autofill (FormAutofillUtils field categorization) and that the
 * registry-driven lookups preserve the historical invariants.
 */

"use strict";

const { AutofillDataTypes } = ChromeUtils.importESModule(
  "resource://gre/modules/shared/AutofillDataTypes.sys.mjs"
);
// FormAutofillUtils is declared as a global in head.js; assign rather than
// redeclare it to avoid a redeclaration error.
FormAutofillUtils = ChromeUtils.importESModule(
  "resource://gre/modules/shared/FormAutofillUtils.sys.mjs"
).FormAutofillUtils;
const {
  FormAutofillSection,
  FormAutofillAddressSection,
  FormAutofillCreditCardSection,
} = ChromeUtils.importESModule(
  "resource://gre/modules/shared/FormAutofillSection.sys.mjs"
);
const { FieldDetail } = ChromeUtils.importESModule(
  "resource://gre/modules/shared/FieldScanner.sys.mjs"
);

add_task(async function test_every_subcategory_is_owned_by_one_type() {
  // Every field name declared in the registry resolves to a data type.
  for (const fieldName of Object.keys(AutofillDataTypes.fieldToSubCategory)) {
    Assert.notEqual(
      AutofillDataTypes.typeIdForFieldName(fieldName),
      null,
      `field "${fieldName}" is owned by a data type`
    );
  }

  // No sub-category is claimed by more than one type.
  const seen = new Set();
  for (const type of AutofillDataTypes.all) {
    for (const subCategory of type.subCategories) {
      Assert.ok(
        !seen.has(subCategory),
        `sub-category "${subCategory}" is claimed by exactly one type`
      );
      seen.add(subCategory);
    }
  }
});

add_task(async function test_typeIdForFieldName() {
  Assert.equal(
    AutofillDataTypes.typeIdForFieldName("street-address"),
    "address"
  );
  Assert.equal(AutofillDataTypes.typeIdForFieldName("tel"), "address");
  Assert.equal(AutofillDataTypes.typeIdForFieldName("email"), "address");
  Assert.equal(AutofillDataTypes.typeIdForFieldName("cc-number"), "creditCard");
  Assert.equal(
    AutofillDataTypes.typeIdForFieldName("passport-number"),
    "passport"
  );
  Assert.equal(
    AutofillDataTypes.typeIdForFieldName("passport-given-name"),
    "passport"
  );
  Assert.equal(
    AutofillDataTypes.typeIdForFieldName("passport-family-name"),
    "passport"
  );
  Assert.equal(AutofillDataTypes.typeIdForFieldName("not-a-field"), null);
});

add_task(async function test_passport_descriptor() {
  const passport = AutofillDataTypes.get(AutofillDataTypes.PASSPORT);
  Assert.notEqual(passport, null, "passport type is registered");
  Assert.equal(passport.collectionName, "passports");
  Assert.equal(
    FormAutofillUtils.getCollectionNameFromFieldName("passport-number"),
    "passports"
  );
});

add_task(async function test_is_field_helpers_match_registry() {
  Assert.ok(FormAutofillUtils.isAddressField("street-address"));
  Assert.ok(FormAutofillUtils.isCreditCardField("cc-number"));

  // A credit card field is NOT an address field, and vice versa.
  Assert.ok(!FormAutofillUtils.isAddressField("cc-number"));
  Assert.ok(!FormAutofillUtils.isCreditCardField("street-address"));

  // Unknown fields belong to no type.
  Assert.ok(!FormAutofillUtils.isAddressField("not-a-field"));
  Assert.ok(!FormAutofillUtils.isCreditCardField("not-a-field"));
});

add_task(async function test_collection_name_resolution() {
  Assert.equal(
    FormAutofillUtils.getCollectionNameFromFieldName("street-address"),
    "addresses"
  );
  Assert.equal(
    FormAutofillUtils.getCollectionNameFromFieldName("cc-number"),
    "creditCards"
  );
  // Unknown fields fall back to addresses.
  Assert.equal(
    FormAutofillUtils.getCollectionNameFromFieldName("not-a-field"),
    "addresses"
  );
});

add_task(async function test_section_classes_report_their_type() {
  // Each section subclass reports the data type id it handles, which is how
  // classifySections and the submit dispatch identify a section's type.
  Assert.equal(
    new FormAutofillAddressSection([]).type,
    AutofillDataTypes.ADDRESS
  );
  Assert.equal(
    new FormAutofillCreditCardSection([]).type,
    AutofillDataTypes.CREDIT_CARD
  );
  Assert.notEqual(AutofillDataTypes.get(AutofillDataTypes.ADDRESS), null);
  Assert.notEqual(AutofillDataTypes.get(AutofillDataTypes.CREDIT_CARD), null);
});

add_task(async function test_classifySections_keeps_unknown_field() {
  // When unknown fields are kept (ignoreUnknownField: false, used by devtools),
  // an unrecognized field stays in the preceding bucket, which defaults to the
  // address section. This guards the historical fallback behavior.
  const doc = MockDocument.createTestDocument(
    "http://localhost:8080/test/",
    `<form>
       <input id="street-address" autocomplete="street-address">
       <input id="mystery">
     </form>`
  );
  const formLike = FormLikeFactory.createFromForm(doc.querySelector("form"));

  const fieldDetails = [
    FieldDetail.create(
      doc.getElementById("street-address"),
      formLike,
      "street-address"
    ),
    FieldDetail.create(
      doc.getElementById("mystery"),
      formLike,
      "unknown-field"
    ),
  ];

  const sections = FormAutofillSection.classifySections(fieldDetails, {
    ignoreUnknownField: false,
  });

  Assert.equal(sections.length, 1, "Unknown field does not split a section");
  Assert.equal(
    sections[0].fieldDetails.length,
    2,
    "Unknown field is kept alongside the address field"
  );
  Assert.ok(
    sections[0].fieldDetails.some(fd => fd.fieldName == "unknown-field"),
    "The unknown field stays in the address section"
  );

  // With the default (ignoreUnknownField: true), the unknown field is dropped.
  const filteredSections = FormAutofillSection.classifySections(fieldDetails);
  Assert.equal(filteredSections.length, 1, "Still one section");
  Assert.ok(
    filteredSections[0].fieldDetails.every(
      fd => fd.fieldName != "unknown-field"
    ),
    "The unknown field is dropped when unknown fields are ignored"
  );
});
