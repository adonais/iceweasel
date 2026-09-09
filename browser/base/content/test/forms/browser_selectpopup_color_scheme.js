// An explicit color-scheme on the <select> wins over guessing the color scheme
// from the used background color.
const TESTS = [
  {
    name: "dark color-scheme, light background",
    style: "color-scheme: dark; background-color: #fff; color: #000;",
    expected: "dark",
  },
  {
    name: "light color-scheme, dark background",
    style: "color-scheme: light; background-color: #000; color: #fff;",
    expected: "light",
  },
];

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["test.wait300msAfterTabSwitch", true],
      ["dom.forms.select.customstyling", true],
    ],
  });
});

add_task(async function test_explicit_color_scheme() {
  for (let { name, style, expected } of TESTS) {
    let url =
      "data:text/html," +
      encodeURIComponent(
        `<select style="${style}"><option>One</option><option>Two</option></select>`
      );
    await BrowserTestUtils.withNewTab(url, async function () {
      let selectPopup = await openSelectPopup("click");
      is(
        getComputedStyle(selectPopup).colorScheme,
        expected,
        `${name}: popup should honor the explicit color-scheme of the select`
      );
      await hideSelectPopup("escape");
    });
  }
});
