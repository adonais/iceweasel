/**
 * @callback TestSettingControlCommonPropertiesFunction
 * @param {(config: Record<string, any>) => Promise<HTMLElement>} renderTemplateFunction
 */

/**
 * Asserts all properties on the element
 * that is returned from the provided function.
 *
 * @type {TestSettingControlCommonPropertiesFunction}
 */
async function testCommonSettingControlPropertiesSet(renderTemplateFunction) {
  const l10nId = "l10n ID";
  const l10nArgs = { foo: "bar" };
  const iconSrc = "anicon.png";
  const supportPage = "https://support.page";
  const subcategory = "the sub category";
  const label = "foo-bar";

  const element = await renderTemplateFunction({
    l10nId,
    l10nArgs,
    iconSrc,
    supportPage,
    subcategory: "the sub category",
    controlAttrs: {
      label,
    },
  });

  is(
    element.getAttribute("data-l10n-id"),
    l10nId,
    "sets data-l10n-id attribute"
  );

  is(
    element.getAttribute("data-l10n-args"),
    JSON.stringify(l10nArgs),
    "converts data-l10n-args to stringified JSON object"
  );

  is(element.dataset.subcategory, subcategory, "sets subcategory");

  is(element.getAttribute("label"), label, "sets controlAttrs.label");

  is(element.iconSrc, iconSrc, "sets iconSrc");

  is(element.supportPage, supportPage, "sets supportPage");
}

/**
 * Asserts all unset properties on the element
 * that is returned from the provided function.
 *
 * @type {TestSettingControlCommonPropertiesFunction}
 */
async function testCommonSettingControlPropertiesUnset(renderTemplateFunction) {
  info("Test common properties when unset");
  const element = await renderTemplateFunction({});
  ok(!element.hasAttribute("data-l10n-id"), "no data-l10n-id attribute");
  ok(!element.hasAttribute("data-l10n-args"), "no data-l10n-args");
  ok(!element.dataset.subcategory, "no subcategory");
  ok(!element.hasAttribute("label"), "no controlAttrs.label");
  ok(!element.iconSrc, "no iconSrc");
  ok(!element.supportPage, "no supportPage");
}

/**
 * Asserts all properties set on the element
 * that is returned from the provided function.
 *
 * @type {TestSettingControlCommonPropertiesFunction}
 */
async function testCommonSettingControlProperties(renderTemplateFunction) {
  await testCommonSettingControlPropertiesSet(renderTemplateFunction);
  await testCommonSettingControlPropertiesUnset(renderTemplateFunction);
}
