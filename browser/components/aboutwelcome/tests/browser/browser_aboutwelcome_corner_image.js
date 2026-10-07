"use strict";

const CORNER_IMAGE_URL =
  "chrome://activity-stream/content/data/content/assets/fox-doodle-waving.gif";

const makeCornerImageScreen = (id, cornerImageAdditions, contentAdditions) =>
  makeTestContent(id, {
    position: "center-large",
    fullscreen: true,
    corner_image: {
      imageURL: CORNER_IMAGE_URL,
      height: "200px",
      ...cornerImageAdditions,
    },
    ...contentAdditions,
  });

add_setup(async function () {
  registerCleanupFunction(function () {
    Services.prefs.clearUserPref("browser.aboutwelcome.didSeeFinalScreen");
  });
});

/**
 * Test that the corner image is anchored to each supported corner
 */
add_task(async function test_aboutwelcome_corner_image_positions() {
  const CORNER_OFFSETS = {
    "bottom-left": { bottom: "-10px", left: "20px" },
    "bottom-right": { bottom: "-10px", right: "20px" },
    "top-left": { top: "-10px", left: "20px" },
    "top-right": { top: "-10px", right: "20px" },
  };

  for (const [position, offsets] of Object.entries(CORNER_OFFSETS)) {
    info(`Testing corner image position: ${position}`);
    const screens = [
      makeCornerImageScreen(`TEST_CORNER_IMAGE_${position}`, { position }),
    ];
    let browser = await openAboutWelcome(JSON.stringify(screens));

    await test_screen_content(
      browser,
      `renders the corner image in the ${position} corner, outside section-main`,
      // Expected selectors:
      [
        `main.screen > .corner-image-container picture.corner-image.${position}`,
      ],
      // Unexpected selectors:
      [".section-main .corner-image-container"]
    );

    await test_element_styles(browser, "picture.corner-image", {
      position: "absolute",
      ...offsets,
    });

    browser.closeBrowser();
  }
});

/**
 * Test that the direction-relative corner positions resolve to the physical
 * corner that matches the text direction
 */
add_task(async function test_aboutwelcome_corner_image_logical_positions() {
  const LOGICAL_POSITIONS = {
    "bottom-start": { ltr: "bottom-left", rtl: "bottom-right" },
    "bottom-end": { ltr: "bottom-right", rtl: "bottom-left" },
    "top-start": { ltr: "top-left", rtl: "top-right" },
    "top-end": { ltr: "top-right", rtl: "top-left" },
  };

  for (const [position, expected] of Object.entries(LOGICAL_POSITIONS)) {
    info(`Testing direction-relative corner image position: ${position}`);
    // Two identical screens, so flipping the direction on the first can be
    // observed on the second once it renders.
    const screens = [
      makeCornerImageScreen(`TEST_CORNER_IMAGE_${position}_LTR`, { position }),
      makeCornerImageScreen(`TEST_CORNER_IMAGE_${position}_RTL`, { position }),
    ];
    let browser = await openAboutWelcome(JSON.stringify(screens));

    await test_screen_content(
      browser,
      `resolves ${position} to ${expected.ltr} in LTR`,
      // Expected selectors:
      [`picture.corner-image.${expected.ltr}`],
      // Unexpected selectors:
      [
        `picture.corner-image.${expected.rtl}`,
        `picture.corner-image.${position}`,
      ]
    );

    await SpecialPowers.spawn(browser, [], async () => {
      content.document.documentElement.setAttribute("dir", "rtl");
    });
    await onButtonClick(browser, "button.primary");

    await test_screen_content(
      browser,
      `resolves ${position} to ${expected.rtl} in RTL`,
      // Expected selectors:
      [`picture.corner-image.${expected.rtl}`],
      // Unexpected selectors:
      [`picture.corner-image.${expected.ltr}`]
    );

    browser.closeBrowser();
  }
});

/**
 * Test that a corner image position outside the allowlist, or omitted entirely,
 * falls back to bottom-right
 */
add_task(async function test_aboutwelcome_corner_image_fallback_position() {
  const FALLBACK_CASES = [
    {
      label: "an unsupported position",
      cornerImage: { position: "not-a-corner" },
    },
    { label: "an omitted position", cornerImage: {} },
  ];

  for (const { label, cornerImage } of FALLBACK_CASES) {
    info(`Testing corner image fallback for ${label}`);
    const screens = [
      makeCornerImageScreen("TEST_CORNER_IMAGE_FALLBACK", cornerImage),
    ];
    let browser = await openAboutWelcome(JSON.stringify(screens));

    await test_screen_content(
      browser,
      `falls back to bottom-right for ${label}`,
      // Expected selectors:
      ["picture.corner-image.bottom-right"],
      // Unexpected selectors:
      ["picture.corner-image.not-a-corner", "picture.corner-image.undefined"]
    );

    browser.closeBrowser();
  }
});

/**
 * Test that layouts other than fullscreen center-large anchor the corner image
 * to the card, by rendering it inside section-main rather than at screen level
 */
add_task(async function test_aboutwelcome_corner_image_card_anchored_layouts() {
  const CARD_ANCHORED_LAYOUTS = [
    {
      label: "center-large without fullscreen",
      content: { fullscreen: false },
    },
    { label: "split", content: { position: "split" } },
    { label: "center", content: { position: "center", fullscreen: false } },
  ];

  for (const { label, content } of CARD_ANCHORED_LAYOUTS) {
    info(`Testing that the corner image anchors to the card for ${label}`);
    const screens = [
      makeCornerImageScreen(
        "TEST_CORNER_IMAGE_CARD_ANCHORED",
        { position: "bottom-right" },
        content
      ),
    ];
    let browser = await openAboutWelcome(JSON.stringify(screens));

    await test_screen_content(
      browser,
      `renders the corner image inside section-main for ${label}`,
      // Expected selectors:
      [
        `.section-main > .corner-image-container picture.corner-image.bottom-right`,
      ],
      // Unexpected selectors:
      ["main.screen > .corner-image-container"]
    );

    await test_element_styles(browser, "picture.corner-image", {
      position: "absolute",
      bottom: "0px",
      right: "0px",
    });

    // The image has to be blockified, or the line box's baseline descender
    // space stops it sitting flush with the bottom of its own picture box.
    await test_element_styles(browser, "picture.corner-image .brand-logo", {
      display: "block",
    });

    browser.closeBrowser();
  }
});

/**
 * Test that each allowlisted entrance animation lands as a class on the
 * corner image
 */
add_task(async function test_aboutwelcome_corner_image_entrance_animations() {
  const ANIMATION_TYPES = [
    "none",
    "fade",
    "slide-block",
    "slide-inline",
    "slide-corner",
    "zoom",
  ];

  for (const type of ANIMATION_TYPES) {
    info(`Testing corner image entrance animation: ${type}`);
    const screens = [
      makeCornerImageScreen(`TEST_CORNER_IMAGE_ENTRANCE_${type}`, {
        position: "bottom-left",
        entrance_animation: { type },
      }),
    ];
    let browser = await openAboutWelcome(JSON.stringify(screens));

    await test_screen_content(
      browser,
      `renders the corner image with the ${type} entrance animation`,
      // Expected selectors:
      [`picture.corner-image.bottom-left.entrance-${type}`]
    );

    browser.closeBrowser();
  }
});

/**
 * Test that an entrance animation outside the allowlist, or omitted entirely,
 * falls back to no animation
 */
add_task(async function test_aboutwelcome_corner_image_entrance_fallback() {
  const FALLBACK_CASES = [
    {
      label: "an unsupported animation type",
      cornerImage: { entrance_animation: { type: "backflip" } },
    },
    {
      label: "an omitted animation type",
      cornerImage: { entrance_animation: { delay: "0.3s" } },
    },
    { label: "an omitted entrance_animation", cornerImage: {} },
  ];

  for (const { label, cornerImage } of FALLBACK_CASES) {
    info(`Testing corner image entrance fallback for ${label}`);
    const screens = [
      makeCornerImageScreen("TEST_CORNER_IMAGE_ENTRANCE_FALLBACK", cornerImage),
    ];
    let browser = await openAboutWelcome(JSON.stringify(screens));

    await test_screen_content(
      browser,
      `falls back to no entrance animation for ${label}`,
      // Expected selectors:
      ["picture.corner-image.entrance-none"],
      // Unexpected selectors:
      [
        "picture.corner-image.entrance-backflip",
        "picture.corner-image.entrance-undefined",
      ]
    );

    browser.closeBrowser();
  }
});

/**
 * Test that the configured duration and delay reach the corner image, and that
 * an unanimated corner image is left with no transition at all
 */
add_task(async function test_aboutwelcome_corner_image_entrance_timing() {
  const TIMING_CASES = [
    {
      label: "a configured entrance animation",
      cornerImage: {
        entrance_animation: {
          type: "slide-block",
          duration: "0.4s",
          delay: "0.2s",
        },
      },
      expectedStyles: {
        "transition-property": "opacity, translate, scale",
        "transition-duration": "0.4s",
        "transition-delay": "0.2s",
      },
    },
    {
      label: "no entrance animation",
      cornerImage: {},
      expectedStyles: { "transition-duration": "0s" },
    },
  ];

  for (const { label, cornerImage, expectedStyles } of TIMING_CASES) {
    info(`Testing corner image transition for ${label}`);
    const screens = [
      makeCornerImageScreen("TEST_CORNER_IMAGE_ENTRANCE_TIMING", {
        position: "bottom-left",
        ...cornerImage,
      }),
    ];
    let browser = await openAboutWelcome(JSON.stringify(screens));

    await test_element_styles(browser, "picture.corner-image", expectedStyles);

    browser.closeBrowser();
  }
});

/**
 * Test that the entrance animation custom properties do not clobber a transform
 * supplied through corner_image.style, which messages use to mirror an
 * illustration
 */
add_task(async function test_aboutwelcome_corner_image_entrance_keeps_style() {
  const screens = [
    makeCornerImageScreen("TEST_CORNER_IMAGE_ENTRANCE_STYLE", {
      position: "bottom-left",
      entrance_animation: { type: "slide-block", distance: "80px" },
      style: { transform: "rotateY(180deg)" },
    }),
  ];
  let browser = await openAboutWelcome(JSON.stringify(screens));

  await test_element_styles(
    browser,
    "picture.corner-image.entrance-slide-block",
    // Expected styles:
    {},
    // Unexpected styles:
    { transform: "none" }
  );

  browser.closeBrowser();
});

/**
 * Test that a corner image's `rtl` overrides are forwarded and applied
 */
add_task(async function test_aboutwelcome_corner_image_rtl_selection() {
  const LTR_URL = "chrome://branding/content/icon16.png";
  const RTL_URL = "chrome://branding/content/icon64.png";

  const screens = [
    makeCornerImageScreen("TEST_CORNER_IMAGE_RTL_1", {
      imageURL: LTR_URL,
      rtl: { imageURL: RTL_URL },
    }),
    makeCornerImageScreen("TEST_CORNER_IMAGE_RTL_2", {
      imageURL: LTR_URL,
      rtl: { imageURL: RTL_URL },
    }),
  ];
  let browser = await openAboutWelcome(JSON.stringify(screens));

  await test_screen_content(
    browser,
    "corner image uses the base URL in LTR",
    // Expected selectors:
    [`picture.corner-image .brand-logo[src="${LTR_URL}"]`],
    // Unexpected selectors:
    [`picture.corner-image .brand-logo[src="${RTL_URL}"]`]
  );

  await SpecialPowers.spawn(browser, [], async () => {
    content.document.documentElement.setAttribute("dir", "rtl");
  });
  await onButtonClick(browser, "button.primary");

  await test_screen_content(
    browser,
    "corner image uses the rtl URL in RTL",
    // Expected selectors:
    [`picture.corner-image .brand-logo[src="${RTL_URL}"]`],
    // Unexpected selectors:
    [`picture.corner-image .brand-logo[src="${LTR_URL}"]`]
  );

  browser.closeBrowser();
});
