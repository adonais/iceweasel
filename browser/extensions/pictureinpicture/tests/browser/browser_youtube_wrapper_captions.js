/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../../../../toolkit/components/pictureinpicture/tests/head.js */

const TEST_URL =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://mochitest.youtube.com:443"
  ) + "test-youtube-caption-container.html";

async function testCaptionContainerReplacement(playerId) {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "media.videocontrols.picture-in-picture.display-text-tracks.enabled",
        true,
      ],
    ],
  });

  await BrowserTestUtils.withNewTab(TEST_URL, async browser => {
    await ensureVideosReady(browser);
    await SpecialPowers.spawn(browser, [playerId], async id => {
      let player = content.document.getElementById("movie_player");
      player.id = id;
      if (id === "shorts-player") {
        content.history.replaceState(null, "", "?shorts");
      }
      let otherPlayer = content.document.createElement("div");
      otherPlayer.id = id === "movie_player" ? "shorts-player" : "movie_player";
      otherPlayer.className = "html5-video-player";
      let otherContainer = content.document.createElement("div");
      otherContainer.id = "ytp-caption-window-container";
      otherContainer.innerHTML =
        '<span class="captions-text"><span class="caption-visual-line">other player caption</span></span>';
      otherPlayer.append(otherContainer);
      player.before(otherPlayer);
    });
    let pipWin = await triggerPictureInPicture(browser, "youtube-video");
    ok(pipWin, "Got Picture-in-Picture window.");
    let pipBrowser = pipWin.document.getElementById("browser");

    await SpecialPowers.spawn(pipBrowser, [], async () => {
      let textTracks = content.document.getElementById("texttracks");
      await ContentTaskUtils.waitForCondition(
        () => textTracks.textContent === "first caption",
        `Waiting for the first caption. Got ${textTracks.textContent}`
      );
    });

    await SpecialPowers.spawn(browser, [], async () => {
      let video = content.document.getElementById("youtube-video");
      video.dispatchEvent(new content.Event("emptied"));
      video.dispatchEvent(new content.Event("resize"));
    });

    await TestUtils.waitForCondition(
      () => pipWin.document.getElementById("closed-caption").disabled,
      "Waiting for the subtitle button to be disabled after emptied."
    );

    await SpecialPowers.spawn(browser, [playerId], async id => {
      let container = content.document.querySelector(
        `#${id} #ytp-caption-window-container`
      );
      container.remove();
    });

    await SpecialPowers.spawn(pipBrowser, [], async () => {
      let textTracks = content.document.getElementById("texttracks");
      await ContentTaskUtils.waitForCondition(
        () => !textTracks.textContent,
        "Waiting for captions to clear while the container is absent."
      );
    });

    await SpecialPowers.spawn(browser, [playerId], async id => {
      let container = content.document.createElement("div");
      container.id = "ytp-caption-window-container";
      let text = content.document.createElement("span");
      text.className = "captions-text";
      let line = content.document.createElement("span");
      line.className = "caption-visual-line";
      line.textContent = "first caption";
      text.append(line);
      container.append(text);
      content.document.getElementById(id).append(container);
    });

    await TestUtils.waitForCondition(
      () => !pipWin.document.getElementById("closed-caption").disabled,
      "Waiting for the subtitle button to be re-enabled by the new container."
    );

    await SpecialPowers.spawn(pipBrowser, [], async () => {
      let textTracks = content.document.getElementById("texttracks");
      await ContentTaskUtils.waitForCondition(
        () => textTracks.textContent === "first caption",
        `Waiting for the unchanged replacement caption. Got ${textTracks.textContent}`
      );
    });

    await SpecialPowers.spawn(browser, [playerId], async id => {
      content.document.querySelector(
        `#${id} .caption-visual-line`
      ).textContent = "second caption";
    });

    await SpecialPowers.spawn(pipBrowser, [], async () => {
      let textTracks = content.document.getElementById("texttracks");
      await ContentTaskUtils.waitForCondition(
        () => textTracks.textContent === "second caption",
        `Waiting for the next caption. Got ${textTracks.textContent}`
      );
    });

    let pipClosed = BrowserTestUtils.domWindowClosed(pipWin);
    EventUtils.synthesizeMouseAtCenter(
      pipWin.document.getElementById("close"),
      {},
      pipWin
    );
    await pipClosed;
  });
}

add_task(async function test_captions_survive_container_replacement() {
  await testCaptionContainerReplacement("movie_player");
});

add_task(async function test_shorts_captions_survive_container_replacement() {
  await testCaptionContainerReplacement("shorts-player");
});
