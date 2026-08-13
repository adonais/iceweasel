/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

/* Verifies that the canvas text recipes (canvasdata9/10) render with the
 * bundled font rather than the platform fallback font. Regression test:
 * the bundled FontFace used to be registered only in usercharacteristics.html
 * while the recipes render in an arbitrary content window via the
 * UserCharacteristicsCanvasRendering actor, so the text silently fell back
 * to the platform default serif (and the bundled woff only covered 2 glyphs
 * anyway). See the field analysis: every dominant canvas9/10 hash had
 * default-serif text metrics.
 */

const ACTOR_NAME = "UserCharacteristicsCanvasRendering";

function registerActor() {
  ChromeUtils.registerWindowActor(ACTOR_NAME, {
    parent: {
      esModuleURI: "resource://gre/actors/UserCharacteristicsParent.sys.mjs",
    },
    child: {
      esModuleURI:
        "resource://gre/actors/UserCharacteristicsCanvasRenderingChild.sys.mjs",
    },
    safeForUntrustedWebProcess: true,
  });
}

add_task(async function test_canvas_text_uses_bundled_font() {
  registerActor();
  registerCleanupFunction(() => {
    ChromeUtils.unregisterWindowActor(ACTOR_NAME);
  });

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    const actor =
      browser.browsingContext.currentWindowGlobal.getActor(ACTOR_NAME);

    const data = await actor.sendQuery("CanvasRendering:Render", {
      hwRenderingExpected: false,
    });

    const errors = data.get("errors");
    Assert.ok(
      !errors.some(e => e.name == "bundledFont"),
      `bundled font loaded without error (errors: ${JSON.stringify(errors)})`
    );

    const renderings = data.get("renderings");
    const actorHash = renderings.get("canvasdata9Software");
    Assert.ok(actorHash, "canvasdata9Software was rendered");

    // Render the same recipe in the same document with the platform fallback
    // (serif) and with an unknown family (what the actor's render used to
    // resolve to before the fix). Neither may match the actor's hash, and
    // the bundled font must no longer be observable in the page.
    //
    // The rendering runs via content.eval so it executes in the content
    // scope: reading the getImageData TypedArray to compute its SHA-1 is
    // forbidden across the SpecialPowers sandbox's Xray wrappers.
    const renderInContent = async () => {
      // Keep in sync with the canvasdata9 recipe in
      // toolkit/actors/UserCharacteristicsCanvasRenderingChild.sys.mjs
      async function renderHash(family) {
        const canvas = document.createElement("canvas");
        canvas.width = 250;
        canvas.height = 250;
        const ctx = canvas.getContext("2d", {
          forceSoftwareRendering: true,
        });
        ctx.fillStyle = "green";
        ctx.font = `italic 30px ${family}`;
        ctx.fillText("The quick brown", 15, 100);
        ctx.fillText("fox jumps over", 15, 150);
        ctx.fillText("the lazy dog", 15, 200);
        const imageData = ctx.getImageData(0, 0, 250, 250);
        const digest = await crypto.subtle.digest("SHA-1", imageData.data);
        return Array.from(new Uint8Array(digest))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      }
      return {
        serifHash: await renderHash("serif"),
        unknownFamilyHash: await renderHash("LocalFiraSans"),
        fontVisibleToPage: [...document.fonts].some(f =>
          f.family.includes("LocalFiraSans")
        ),
      };
    };

    const content = await SpecialPowers.spawn(
      browser,
      [renderInContent.toString()],
      fnStr => content.eval(`(${fnStr})()`)
    );

    Assert.notEqual(
      actorHash,
      content.serifHash,
      "actor's canvasdata9Software is not the serif fallback rendering"
    );
    Assert.notEqual(
      actorHash,
      content.unknownFamilyHash,
      "actor's canvasdata9Software is not an unknown-family fallback rendering"
    );
    Assert.ok(
      !content.fontVisibleToPage,
      "the bundled font is removed from the page's document.fonts afterwards"
    );
  });
});
