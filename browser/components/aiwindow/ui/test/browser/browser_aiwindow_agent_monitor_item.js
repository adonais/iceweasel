/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_agent_monitor_item_page.html";

const AGENT = {
  id: "agent-1",
  productName: "Sony WH-1000XM5 price",
  url: "soundnest.com/audio/sony-wh-1000xm5",
  condition: "the price drops below $270",
  conditionPresets: ["Any drop", "Below $270", "Below $250"],
  status: { label: "Watching", kind: "watching" },
  cadence: "Auto · on-device",
};

async function openTestPage() {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_PAGE);
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.customElements.whenDefined("agent-monitor-item");
  });
  return { tab, browser: tab.linkedBrowser };
}

async function withTestPage(fn) {
  const { tab, browser } = await openTestPage();
  try {
    await fn(browser);
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
}

async function setProps(browser, props) {
  await SpecialPowers.spawn(browser, [props], async properties => {
    const el = content.document.getElementById("test-agent-monitor-item");
    Object.assign(el, properties);
    await el.updateComplete;
  });
}

add_task(async function test_display_collapsed_and_expanded() {
  await withTestPage(async browser => {
    await setProps(browser, { agent: AGENT, mode: "display", expanded: false });

    await SpecialPowers.spawn(browser, [], async () => {
      const el = content.document.getElementById("test-agent-monitor-item");
      const shadow = el.shadowRoot;

      Assert.ok(
        shadow.querySelector(".monitor-card.chatcard"),
        "Display mode renders a collapsible monitor card"
      );
      Assert.equal(
        shadow.querySelector(".monitor-card-name").textContent.trim(),
        "Sony WH-1000XM5 price",
        "Head shows the product name from the agent property"
      );
      Assert.ok(
        !shadow.querySelector(".watch-expand"),
        "Expanded body is absent when collapsed"
      );

      el.expanded = true;
      await el.updateComplete;

      Assert.ok(
        shadow.querySelector(".watch-expand"),
        "Expanded body appears when expanded is true"
      );
    });
  });
});

add_task(async function test_toggle_dispatches_and_expands() {
  await withTestPage(async browser => {
    await setProps(browser, { agent: AGENT, mode: "display", expanded: false });

    await SpecialPowers.spawn(browser, [], async () => {
      const el = content.document.getElementById("test-agent-monitor-item");
      const shadow = el.shadowRoot;

      const events = [];
      el.addEventListener("agent-monitor-item:toggle", e =>
        events.push(e.detail?.expanded)
      );

      shadow.querySelector(".chatcard").click();
      await el.updateComplete;

      Assert.equal(el.expanded, true, "Clicking the card expands it");
      Assert.deepEqual(
        events,
        [true],
        "toggle event fires with the new expanded value"
      );
    });
  });
});

add_task(async function test_edit_toggle_expands_and_shows_field() {
  await withTestPage(async browser => {
    await setProps(browser, { agent: AGENT, mode: "display", expanded: false });

    await SpecialPowers.spawn(browser, [], async () => {
      const el = content.document.getElementById("test-agent-monitor-item");
      const shadow = el.shadowRoot;

      const events = [];
      el.addEventListener("agent-monitor-item:edit-toggle", e =>
        events.push(e.detail?.editing)
      );

      shadow.querySelector(".page-action.edit").click();
      await el.updateComplete;

      Assert.equal(el.editing, true, "Edit button turns on editing");
      Assert.equal(
        el.expanded,
        true,
        "Opening edit while collapsed also expands the card"
      );
      Assert.ok(
        shadow.querySelector("moz-input-text.monitor-condition-input"),
        "Editable condition field is shown while editing"
      );
      Assert.deepEqual(events, [true], "edit-toggle event fires with editing");
    });
  });
});

add_task(async function test_preset_updates_condition() {
  await withTestPage(async browser => {
    await setProps(browser, {
      agent: AGENT,
      mode: "display",
      expanded: true,
      editing: true,
    });

    await SpecialPowers.spawn(browser, [], async () => {
      const el = content.document.getElementById("test-agent-monitor-item");
      const shadow = el.shadowRoot;

      const chips = shadow.querySelectorAll(".chip");
      chips[2].click(); // "Below $250"
      await el.updateComplete;

      Assert.equal(
        shadow.querySelector("moz-input-text.monitor-condition-input").value,
        "Below $250",
        "Selecting a preset chip updates the condition field"
      );
    });
  });
});

add_task(async function test_submit_and_delete_dispatch_detail() {
  await withTestPage(async browser => {
    await setProps(browser, {
      agent: AGENT,
      mode: "display",
      expanded: true,
      editing: true,
    });

    await SpecialPowers.spawn(browser, [], async () => {
      const el = content.document.getElementById("test-agent-monitor-item");
      const shadow = el.shadowRoot;

      let submitDetail = null;
      let deleteDetail = null;
      el.addEventListener(
        "agent-monitor-item:submit",
        e => (submitDetail = e.detail)
      );
      el.addEventListener(
        "agent-monitor-item:delete",
        e => (deleteDetail = e.detail)
      );

      // Save dispatches submit
      shadow.querySelector(".save").click();
      await el.updateComplete;
      Assert.deepEqual(
        submitDetail,
        {
          mode: "display",
          id: "agent-1",
          productName: "Sony WH-1000XM5 price",
          value: "",
          condition: "the price drops below $270",
          watchUrls: ["soundnest.com/audio/sony-wh-1000xm5"],
        },
        "submit carries mode, id, product name, value, condition and watch URLs"
      );

      shadow.querySelector(".page-action.delete").click();
      await el.updateComplete;
      Assert.deepEqual(
        deleteDetail,
        { id: "agent-1" },
        "delete carries the agent id"
      );
    });
  });
});

add_task(async function test_create_mode_renders_form() {
  await withTestPage(async browser => {
    await setProps(browser, { agent: AGENT, mode: "create" });

    await SpecialPowers.spawn(browser, [], async () => {
      const el = content.document.getElementById("test-agent-monitor-item");
      const shadow = el.shadowRoot;

      Assert.ok(
        shadow.querySelector(".monitor-card"),
        "Create mode renders a monitor card"
      );
      Assert.ok(
        !shadow.querySelector(".chatcard"),
        "Create mode is not the collapsible chat card"
      );
      Assert.ok(
        shadow.querySelector("moz-input-text.monitor-condition-input"),
        "Create mode shows the condition field"
      );

      let submitDetail = null;
      el.addEventListener(
        "agent-monitor-item:submit",
        e => (submitDetail = e.detail)
      );
      // Start monitoring
      shadow.querySelector(".btn-primary").click();
      await el.updateComplete;

      Assert.equal(
        submitDetail?.mode,
        "create",
        "submit from create mode reports mode 'create'"
      );
    });
  });
});

add_task(async function test_create_mode_empty_state_inputs() {
  await withTestPage(async browser => {
    // when no productName or value is available the card should offer editable inputs instead
    await setProps(browser, {
      agent: { conditionPresets: ["Any drop"] },
      mode: "create",
    });

    await SpecialPowers.spawn(browser, [], async () => {
      const el = content.document.getElementById("test-agent-monitor-item");
      const shadow = el.shadowRoot;

      const nameInput = shadow.querySelector(
        "moz-input-text.monitor-name-input"
      );
      const priceInput = shadow.querySelector(
        "moz-input-text.monitor-price-input"
      );
      Assert.ok(nameInput, "Name input is shown when there is no product name");
      Assert.ok(priceInput, "Price input is shown when there is no value");

      let submitDetail = null;
      el.addEventListener(
        "agent-monitor-item:submit",
        e => (submitDetail = e.detail)
      );

      nameInput.value = "Sony Headphone";
      nameInput.dispatchEvent(new content.Event("change", { bubbles: true }));
      priceInput.value = "$233.99";
      priceInput.dispatchEvent(new content.Event("change", { bubbles: true }));
      await el.updateComplete;

      shadow.querySelector(".btn-primary").click();
      await el.updateComplete;

      Assert.equal(
        submitDetail?.productName,
        "Sony Headphone",
        "submit carries the typed product name"
      );
      Assert.equal(
        submitDetail?.value,
        "$233.99",
        "submit carries the typed current value"
      );
    });
  });
});
