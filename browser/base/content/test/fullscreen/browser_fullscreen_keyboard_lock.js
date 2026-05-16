"use strict";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.fullscreen.keyboard_lock.enabled", true],
      ["dom.fullscreen.keyboard_lock.long_press_interval", 0],
    ],
  });
});

add_task(async function test_escape_doesnt_exit_keyboardlock() {
  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    await DOMFullscreenTestUtils.changeFullscreen(browser, true, {
      keyboardLock: "browser",
    });

    await SpecialPowers.spawn(browser, [], async () => {
      content.window.escapePressed = new content.window.Promise(resolve => {
        content.window.addEventListener("keydown", e => {
          if (e.key == "Escape") {
            resolve();
          }
        });
      });
    });

    EventUtils.synthesizeKey("KEY_Escape", {}, browser.ownerGlobal);
    await SpecialPowers.spawn(browser, [], async () => {
      await content.window.escapePressed;
    });
    let isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(isStillFullscreen, "Escape key press shouldn't exit fullscreen");

    let fullScreenExited = BrowserTestUtils.waitForEvent(
      document,
      "fullscreenchange",
      false,
      () => !document.fullscreenElement
    );
    // Synthesize a long-press of the Escape key by repeating 2 keydown events.
    // This works as the long_press_interval is set to 0 on setup.
    EventUtils.synthesizeKey("KEY_Escape", { repeat: 2 }, browser.ownerGlobal);
    await fullScreenExited;
    isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(
      !isStillFullscreen,
      "Long-press Escape key press should exit fullscreen"
    );
  });
});

add_task(async function test_inner_iframe_with_keyboardlock() {
  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    await DOMFullscreenTestUtils.changeFullscreen(browser, true, {
      keyboardLock: "none",
    });

    await SpecialPowers.spawn(browser, [], async () => {
      let frame = content.document.createElement("iframe");
      content.document.body.appendChild(frame);

      frame.focus();
      await SpecialPowers.spawn(frame, [], async () => {
        await content.document.body.requestFullscreen({
          keyboardLock: "browser",
        });
      });
    });

    EventUtils.synthesizeKey("KEY_Escape", {}, browser.ownerGlobal);
    let isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(isStillFullscreen, "Escape key press shouldn't exit fullscreen");

    await SpecialPowers.spawn(browser, [], async () => {
      let frame = content.document.querySelector("iframe");
      await SpecialPowers.spawn(frame, [], async () => {
        await content.document.exitFullscreen();
      });
    });

    isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(
      isStillFullscreen,
      "Exiting inner fullscreen shouldn't exit outer fullscreen"
    );

    let fullScreenExited = BrowserTestUtils.waitForEvent(
      document,
      "fullscreenchange",
      false,
      () => !document.fullscreenElement
    );
    EventUtils.synthesizeKey("KEY_Escape", {}, browser.ownerGlobal);
    await fullScreenExited;
    isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(!isStillFullscreen, "Escape key press should exit fullscreen");
  });
});

add_task(async function test_inner_iframe_without_keyboardlock() {
  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    await DOMFullscreenTestUtils.changeFullscreen(browser, true, {
      keyboardLock: "browser",
    });

    await SpecialPowers.spawn(browser, [], async () => {
      let frame = content.document.createElement("iframe");
      content.document.body.appendChild(frame);

      frame.focus();
      await SpecialPowers.spawn(frame, [], async () => {
        await content.document.body.requestFullscreen({ keyboardLock: "none" });
      });
    });

    let fullScreenExited = BrowserTestUtils.waitForEvent(
      document,
      "fullscreenchange",
      false,
      () => !document.fullscreenElement
    );
    EventUtils.synthesizeKey("KEY_Escape", {}, browser.ownerGlobal);
    await fullScreenExited;
    let isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(!isStillFullscreen, "Escape key press should exit fullscreen");

    await DOMFullscreenTestUtils.changeFullscreen(browser, true, {
      keyboardLock: "browser",
    });
    await SpecialPowers.spawn(browser, [], async () => {
      let frame = content.document.querySelector("iframe");
      await SpecialPowers.spawn(frame, [], async () => {
        await content.document.body.requestFullscreen({ keyboardLock: "none" });
        await content.document.exitFullscreen();
      });
    });

    EventUtils.synthesizeKey("KEY_Escape", {}, browser.ownerGlobal);
    isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(isStillFullscreen, "Escape key press shouldn't exit fullscreen");
  });
});

add_task(async function test_enter_keyboardlock_while_already_fullscreen() {
  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      let fullscreenChanged = new content.Promise(resolve => {
        content.window.addEventListener("fullscreenchange", resolve, {
          once: true,
        });
      });
      await content.document.body.requestFullscreen({ keyboardLock: "none" });
      await fullscreenChanged;
      await content.document.body.requestFullscreen({
        keyboardLock: "browser",
      });

      content.window.escapePressed = new content.window.Promise(resolve => {
        content.window.addEventListener("keydown", e => {
          if (e.key == "Escape") {
            resolve();
          }
        });
      });
    });

    let isFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(isFullscreen, "Multiple requestFullscreen shouldn't exit fullscreen");

    EventUtils.synthesizeKey("KEY_Escape", {}, browser.ownerGlobal);
    await SpecialPowers.spawn(browser, [], async () => {
      await content.window.escapePressed;
    });
    let isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(isStillFullscreen, "Escape key press shouldn't exit fullscreen");
  });
});

add_task(async function test_leave_keyboardlock_while_already_fullscreen() {
  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      let fullscreenChanged = new content.Promise(resolve => {
        content.window.addEventListener("fullscreenchange", resolve, {
          once: true,
        });
      });
      await content.document.body.requestFullscreen({
        keyboardLock: "browser",
      });
      await fullscreenChanged;
      await content.document.body.requestFullscreen({ keyboardLock: "none" });

      content.window.escapePressed = false;
      content.window.addEventListener(
        "keydown",
        e => {
          if (e.key == "Escape") {
            content.window.escapePressed = true;
          }
        },
        { once: true }
      );
    });

    let isFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(isFullscreen, "Multiple requestFullscreen shouldn't exit fullscreen");

    await SpecialPowers.spawn(browser, [], async () => {
      content.window.fullscreenChanged = new content.Promise(resolve => {
        content.window.addEventListener("fullscreenchange", resolve, {
          once: true,
        });
      });
    });
    EventUtils.synthesizeKey("KEY_Escape", {}, browser.ownerGlobal);
    await SpecialPowers.spawn(browser, [], async () => {
      await content.window.fullscreenChanged;
    });
    let escapePressed = await SpecialPowers.spawn(browser, [], async () => {
      return content.window.escapePressed;
    });
    ok(!escapePressed, "Escape key press shouldn't make it to content process");
    let isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(!isStillFullscreen, "Escape key press should exit fullscreen");
  });
});

add_task(async function test_restore_keyboardlock_nested_elements() {
  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      content.window.outer = content.document.createElement("div");
      content.document.body.appendChild(content.window.outer);
      let inner = content.document.createElement("div");
      content.window.outer.appendChild(inner);

      let fullscreenChanged = new content.Promise(resolve => {
        content.window.addEventListener("fullscreenchange", resolve, {
          once: true,
        });
      });
      await content.window.outer.requestFullscreen({
        keyboardLock: "none",
      });
      await fullscreenChanged;

      fullscreenChanged = new content.Promise(resolve => {
        content.window.addEventListener("fullscreenchange", resolve, {
          once: true,
        });
      });
      await inner.requestFullscreen({ keyboardLock: "browser" });
      await fullscreenChanged;

      content.window.escapePressed = new content.window.Promise(resolve => {
        content.window.addEventListener("keydown", e => {
          if (e.key == "Escape") {
            resolve();
          }
        });
      });
    });

    info("entered nested fullscreen");

    EventUtils.synthesizeKey("KEY_Escape", {}, browser.ownerGlobal);
    await SpecialPowers.spawn(browser, [], async () => {
      await content.window.escapePressed;
    });
    let isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(isStillFullscreen, "Escape key press shouldn't exit fullscreen");

    await SpecialPowers.spawn(browser, [], async () => {
      let fullscreenChanged = new content.Promise(resolve => {
        content.window.addEventListener("fullscreenchange", resolve, {
          once: true,
        });
      });
      await content.document.exitFullscreen();
      await fullscreenChanged;
    });

    let fullscreenRestored = await SpecialPowers.spawn(
      browser,
      [],
      async () => {
        return content.document.fullscreenElement == content.window.outer;
      }
    );
    ok(fullscreenRestored, "fullscreen should be restored to outer element");

    let fullscreenExited = BrowserTestUtils.waitForEvent(
      document,
      "fullscreenchange",
      false,
      () => !document.fullscreenElement
    );
    EventUtils.synthesizeKey("KEY_Escape", {}, browser.ownerGlobal);
    await fullscreenExited;
    isStillFullscreen = await SpecialPowers.spawn(browser, [], async () => {
      return content.document.fullscreenElement != null;
    });
    ok(!isStillFullscreen, "Escape key press should exit fullscreen");
  });
});
