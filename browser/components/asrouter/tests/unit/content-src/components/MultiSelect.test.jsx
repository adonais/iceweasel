import React from "react";
import { mount } from "enzyme";
import { MultiSelect } from "content-src/components/MultiSelect";

describe("MultiSelect component", () => {
  let sandbox;
  let MULTISELECT_SCREEN_PROPS;
  let setScreenMultiSelects;
  let setActiveMultiSelect;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    setScreenMultiSelects = sandbox.stub();
    setActiveMultiSelect = sandbox.stub();
    MULTISELECT_SCREEN_PROPS = {
      id: "multiselect-screen",
      content: {
        position: "split",
        split_narrow_bkg_position: "-60px",
        image_alt_text: {
          string_id: "mr2022-onboarding-default-image-alt",
        },
        background:
          "url('chrome://activity-stream/content/data/content/assets/mr-settodefault.svg') var(--mr-secondary-position) no-repeat var(--mr-screen-background-color)",
        progress_bar: true,
        logo: {},
        title: "Test Title",
        tiles: {
          type: "multiselect",
          label: "Test Subtitle",
          data: [
            {
              id: "checkbox-1",
              defaultValue: true,
              label: {
                string_id: "mr2022-onboarding-set-default-primary-button-label",
              },
              action: {
                type: "SET_DEFAULT_BROWSER",
              },
            },
            {
              id: "checkbox-2",
              defaultValue: true,
              label: "Test Checkbox 2",
              action: {
                type: "SHOW_MIGRATION_WIZARD",
                data: {},
              },
            },
            {
              id: "checkbox-3",
              defaultValue: false,
              label: "Test Checkbox 3",
              action: {
                type: "SHOW_MIGRATION_WIZARD",
                data: {},
              },
            },
          ],
        },
        primary_button: {
          label: "Save and Continue",
          action: {
            type: "MULTI_ACTION",
            collectSelect: true,
            navigate: true,
            data: { actions: [] },
          },
        },
        secondary_button: {
          label: "Skip",
          action: {
            navigate: true,
          },
          has_arrow_icon: true,
        },
      },
      setScreenMultiSelects,
      setActiveMultiSelect,
    };
  });
  afterEach(() => {
    sandbox.restore();
  });

  it("should call setScreenMultiSelects with all ids of checkboxes", () => {
    mount(<MultiSelect {...MULTISELECT_SCREEN_PROPS} />);

    assert.calledOnce(setScreenMultiSelects);
    assert.calledWith(setScreenMultiSelects, [
      "checkbox-1",
      "checkbox-2",
      "checkbox-3",
    ]);
  });

  it("should not call setScreenMultiSelects if it's already set", () => {
    let map = sandbox
      .stub()
      .returns(MULTISELECT_SCREEN_PROPS.content.tiles.data);

    mount(
      <MultiSelect screenMultiSelects={{ map }} {...MULTISELECT_SCREEN_PROPS} />
    );

    assert.notCalled(setScreenMultiSelects);
    assert.calledOnce(map);
    assert.calledWith(map, sinon.match.func);
  });

  it("should call setActiveMultiSelect with ids of checkboxes with defaultValue true", () => {
    const wrapper = mount(<MultiSelect {...MULTISELECT_SCREEN_PROPS} />);

    wrapper.setProps({ activeMultiSelect: null });
    assert.calledOnce(setActiveMultiSelect);
    assert.calledWith(setActiveMultiSelect, ["checkbox-1", "checkbox-2"]);
  });

  it("should use activeMultiSelect ids to set checked state for respective checkbox", () => {
    const wrapper = mount(<MultiSelect {...MULTISELECT_SCREEN_PROPS} />);

    wrapper.setProps({ activeMultiSelect: ["checkbox-1", "checkbox-2"] });
    const checkBoxes = wrapper.find(".checkbox-container input");
    assert.strictEqual(checkBoxes.length, 3);

    assert.strictEqual(checkBoxes.first().props().checked, true);
    assert.strictEqual(checkBoxes.at(1).props().checked, true);
    assert.strictEqual(checkBoxes.last().props().checked, false);
  });

  it("cover the randomize property", async () => {
    MULTISELECT_SCREEN_PROPS.content.tiles.data.forEach(
      item => (item.randomize = true)
    );

    const wrapper = mount(<MultiSelect {...MULTISELECT_SCREEN_PROPS} />);

    const checkBoxes = wrapper.find(".checkbox-container input");
    assert.strictEqual(checkBoxes.length, 3);

    // We don't want to actually test the randomization, just that it doesn't
    // throw. We _could_ render the component until we get a different order,
    // and that should work the vast majority of the time, but it's
    // theoretically possible that we get the same order over and over again
    // until we hit the 2 second timeout. That would be an extremely low failure
    // rate, but we already know Math.random() works, so we don't really need to
    // test it anyway. It's not worth the added risk of false failures.
  });

  it("should filter out id when checkbox is unchecked", () => {
    const wrapper = mount(<MultiSelect {...MULTISELECT_SCREEN_PROPS} />);
    wrapper.setProps({ activeMultiSelect: ["checkbox-1", "checkbox-2"] });

    const ckbx1 = wrapper.find(".checkbox-container input").at(0);
    assert.strictEqual(ckbx1.prop("value"), "checkbox-1");
    ckbx1.getDOMNode().checked = false;
    ckbx1.simulate("change");
    assert.calledWith(setActiveMultiSelect, ["checkbox-2"]);
  });

  it("should add id when checkbox is checked", () => {
    const wrapper = mount(<MultiSelect {...MULTISELECT_SCREEN_PROPS} />);
    wrapper.setProps({ activeMultiSelect: ["checkbox-1", "checkbox-2"] });

    const ckbx3 = wrapper.find(".checkbox-container input").at(2);
    assert.strictEqual(ckbx3.prop("value"), "checkbox-3");
    ckbx3.getDOMNode().checked = true;
    ckbx3.simulate("change");
    assert.calledWith(setActiveMultiSelect, [
      "checkbox-1",
      "checkbox-2",
      "checkbox-3",
    ]);
  });

  it("should render radios and checkboxes with correct styles", async () => {
    const SCREEN_PROPS = { ...MULTISELECT_SCREEN_PROPS };
    SCREEN_PROPS.content.tiles.style = { flexDirection: "row", gap: "24px" };
    SCREEN_PROPS.content.tiles.data = [
      {
        id: "checkbox-1",
        defaultValue: true,
        label: { raw: "Test1" },
        action: { type: "OPEN_PROTECTION_REPORT" },
        style: { color: "red" },
        icon: { style: { color: "blue" } },
      },
      {
        id: "radio-1",
        type: "radio",
        group: "radios",
        defaultValue: true,
        label: { raw: "Test3" },
        action: { type: "OPEN_PROTECTION_REPORT" },
        style: { color: "purple" },
        icon: { style: { color: "yellow" } },
      },
    ];
    const wrapper = mount(<MultiSelect {...SCREEN_PROPS} />);

    // wait for effect hook
    await new Promise(resolve => queueMicrotask(resolve));
    // activeMultiSelect was called on effect hook with default values
    assert.calledWith(setActiveMultiSelect, ["checkbox-1", "radio-1"]);

    const container = wrapper.find(".multi-select-container");
    assert.strictEqual(container.prop("style").flexDirection, "row");
    assert.strictEqual(container.prop("style").gap, "24px");

    // checkboxes/radios are rendered with correct styles
    const checkBoxes = wrapper.find(".checkbox-container");
    assert.strictEqual(checkBoxes.length, 2);
    assert.strictEqual(checkBoxes.first().prop("style").color, "red");
    assert.strictEqual(checkBoxes.at(1).prop("style").color, "purple");

    const checks = wrapper.find(".checkbox-container input");
    assert.strictEqual(checks.length, 2);
    assert.strictEqual(checks.first().prop("style").color, "blue");
    assert.strictEqual(checks.at(1).prop("style").color, "yellow");
  });

  it("should render picker elements when multiSelectItemDesign is 'picker'", () => {
    const PICKER_PROPS = { ...MULTISELECT_SCREEN_PROPS };
    PICKER_PROPS.content.tiles.multiSelectItemDesign = "picker";
    PICKER_PROPS.content.tiles.data = [
      {
        id: "picker-option-1",
        defaultValue: true,
        label: "Picker Option 1",
        pickerEmoji: "🙃",
        pickerEmojiBackgroundColor: "#c3e0ff",
      },
      {
        id: "picker-option-2",
        defaultValue: false,
        label: "Picker Option 2",
        pickerEmoji: "✨",
        pickerEmojiBackgroundColor: "#ffebcc",
      },
    ];

    const wrapper = mount(<MultiSelect {...PICKER_PROPS} />);
    wrapper.setProps({ activeMultiSelect: ["picker-option-1"] });

    // Container should have picker class
    const container = wrapper.find(".multi-select-container");
    assert.strictEqual(container.hasClass("picker"), true);

    const pickerIcons = wrapper.find(".picker-icon");
    assert.strictEqual(pickerIcons.length, 2);

    // First icon should be checked (no emoji, no background color)
    const firstIcon = pickerIcons.at(0);
    assert.strictEqual(firstIcon.hasClass("picker-checked"), true);
    assert.strictEqual(firstIcon.text(), "");
    assert.strictEqual(firstIcon.prop("style").backgroundColor, undefined);

    // Second icon should not be checked (should have emoji and background color)
    const secondIcon = pickerIcons.at(1);
    assert.strictEqual(secondIcon.hasClass("picker-checked"), false);
    assert.strictEqual(secondIcon.text(), "✨");
    assert.strictEqual(secondIcon.prop("style").backgroundColor, "#ffebcc");
  });

  // The picker design adds functionality for checkbox to be checked
  // even when click events occur on the container itself, instead of just
  // the label or input
  it("should handle click events for picker design", () => {
    const PICKER_PROPS = { ...MULTISELECT_SCREEN_PROPS };
    PICKER_PROPS.content.tiles.multiSelectItemDesign = "picker";
    PICKER_PROPS.content.tiles.data = [
      {
        id: "picker-option-1",
        defaultValue: true,
        label: "Picker Option 1",
        pickerEmoji: "🙃",
      },
      {
        id: "picker-option-2",
        defaultValue: false,
        label: "Picker Option 2",
        pickerEmoji: "✨",
      },
    ];

    const wrapper = mount(<MultiSelect {...PICKER_PROPS} />);
    wrapper.setProps({ activeMultiSelect: ["picker-option-1"] });

    // check the container of the second item
    const checkboxContainers = wrapper.find(".checkbox-container");
    const secondContainer = checkboxContainers.at(1);
    secondContainer.simulate("click");

    // setActiveMultiSelect should be called with both ids
    assert.calledWith(setActiveMultiSelect, [
      "picker-option-1",
      "picker-option-2",
    ]);

    // uncheck the first item
    const firstContainer = checkboxContainers.at(0);
    firstContainer.simulate("click");

    // setActiveMultiSelect should be called with just the second id
    assert.calledWith(setActiveMultiSelect, ["picker-option-2"]);
  });

  it("should handle keyboard events for picker design", () => {
    const PICKER_PROPS = { ...MULTISELECT_SCREEN_PROPS };
    PICKER_PROPS.content.tiles.multiSelectItemDesign = "picker";
    PICKER_PROPS.content.tiles.data = [
      {
        id: "picker-option-1",
        defaultValue: false,
        label: "Picker Option 1",
      },
    ];

    const wrapper = mount(<MultiSelect {...PICKER_PROPS} />);
    wrapper.setProps({ activeMultiSelect: [] });

    const checkboxContainer = wrapper.find(".checkbox-container").first();

    // Test spacebar press
    checkboxContainer.simulate("keydown", {
      key: " ",
    });
    assert.calledWith(setActiveMultiSelect, ["picker-option-1"]);

    // Test Enter press
    checkboxContainer.simulate("keydown", {
      key: "Enter",
    });
    assert.calledWith(setActiveMultiSelect, []);

    // Test other key press
    setActiveMultiSelect.reset();
    checkboxContainer.simulate("keydown", {
      key: "Tab",
    });
    assert.notCalled(setActiveMultiSelect);
  });

  it("should not use handleCheckboxContainerInteraction when multiSelectItemDesign is not 'picker'", () => {
    const wrapper = mount(<MultiSelect {...MULTISELECT_SCREEN_PROPS} />);
    wrapper.setProps({ activeMultiSelect: ["checkbox-1"] });

    const checkboxContainer = wrapper.find(".checkbox-container").first();

    assert.strictEqual(checkboxContainer.prop("tabIndex"), null);
    assert.strictEqual(checkboxContainer.prop("onClick"), null);
    assert.strictEqual(checkboxContainer.prop("onKeyDown"), null);
    // Likewise, the extra accessibility attributes should not be present on the container
    assert.strictEqual(checkboxContainer.prop("role"), null);
    assert.strictEqual(checkboxContainer.prop("aria-checked"), null);
  });

  it("should set proper accessibility attributes for picker design when multiSelectItemDesign is 'picker' ", () => {
    const PICKER_PROPS = { ...MULTISELECT_SCREEN_PROPS };
    PICKER_PROPS.content.tiles.multiSelectItemDesign = "picker";
    PICKER_PROPS.content.tiles.data = [
      {
        id: "picker-option-1",
        defaultValue: true,
        label: "Picker Option 1",
      },
    ];

    const wrapper = mount(<MultiSelect {...PICKER_PROPS} />);
    wrapper.setProps({ activeMultiSelect: ["picker-option-1"] });

    const checkboxContainer = wrapper.find(".checkbox-container").first();

    // the checkbox-container should have appropriate accessibility attributes
    assert.strictEqual(checkboxContainer.prop("tabIndex"), "0");
    assert.strictEqual(checkboxContainer.prop("role"), "checkbox");
    assert.strictEqual(checkboxContainer.prop("aria-checked"), true);

    // the actual (hidden) checkbox should have tabIndex="-1" (to avoid double focus)
    const checkbox = wrapper.find("input[type='checkbox']").first();
    assert.strictEqual(checkbox.prop("tabIndex"), "-1");
  });

  describe("card item designs", () => {
    // Both card designs pair a label with a description beneath it. The layout
    // is CSS-only, so what the component has to get right is the container
    // class and the description's association with its checkbox.
    const CARD_DATA = [
      {
        id: "interaction-data",
        type: "checkbox",
        defaultValue: true,
        label: "Send technical and interaction data to Mozilla",
        description: "Data about your device, hardware configuration...",
      },
      {
        id: "crash-data",
        type: "checkbox",
        defaultValue: false,
        label: "Automatically send crash reports",
        description: "Crash reports allow us to diagnose and fix issues...",
      },
    ];

    function assertCardDesign(design) {
      const CARD_PROPS = { ...MULTISELECT_SCREEN_PROPS };
      CARD_PROPS.content.tiles.multiSelectItemDesign = design;
      CARD_PROPS.content.tiles.data = CARD_DATA;

      const wrapper = mount(<MultiSelect {...CARD_PROPS} />);
      wrapper.setProps({ activeMultiSelect: ["interaction-data"] });

      const container = wrapper.find(".multi-select-container");
      assert.strictEqual(container.hasClass(design), true);
      assert.strictEqual(
        container.hasClass("picker"),
        false,
        "Card designs are not pickers"
      );

      const descriptions = wrapper.find("p#interaction-data-description");
      assert.lengthOf(descriptions, 1);

      // The description is what the checkbox is described by, so screen
      // readers announce the second line with the item.
      const checkbox = wrapper.find("input#interaction-data");
      assert.strictEqual(
        checkbox.prop("aria-describedby"),
        "interaction-data-description"
      );

      wrapper.unmount();
    }

    it("should put select-card on the container and describe each item", () => {
      assertCardDesign("select-card");
    });

    it("should put grouped-card on the container and describe each item", () => {
      assertCardDesign("grouped-card");
    });
  });

  describe("unchecked notices", () => {
    let NOTICE_PROPS;

    beforeEach(() => {
      NOTICE_PROPS = { ...MULTISELECT_SCREEN_PROPS };
      NOTICE_PROPS.content = { ...MULTISELECT_SCREEN_PROPS.content };
      NOTICE_PROPS.content.tiles = {
        type: "multiselect",
        data: [
          {
            id: "checkbox-with-notice",
            defaultValue: true,
            label: "Add Firefox to your taskbar",
            action: { type: "PIN_FIREFOX_TO_TASKBAR" },
            uncheckedNotice: {
              title: "Keep Firefox a click away",
              subtitle: "Quickly jump back in to your favorite sites.",
            },
          },
          {
            id: "checkbox-without-notice",
            defaultValue: true,
            label: "Open all links with Firefox",
            action: { type: "SET_DEFAULT_BROWSER" },
          },
        ],
      };
    });

    it("should not render a notice region for items without uncheckedNotice", () => {
      const wrapper = mount(<MultiSelect {...NOTICE_PROPS} />);
      assert.lengthOf(wrapper.find(".multi-select-notice-region"), 1);
      assert.lengthOf(wrapper.find(".multi-select-item-group"), 1);
    });

    it("should keep the live region mounted but empty while the item is checked", () => {
      const wrapper = mount(
        <MultiSelect
          {...NOTICE_PROPS}
          activeMultiSelect={["checkbox-with-notice"]}
        />
      );

      const region = wrapper.find(".multi-select-notice-region");
      assert.strictEqual(region.prop("role"), "status");
      assert.lengthOf(wrapper.find(".multi-select-notice"), 0);
    });

    it("should render the notice when the item is unchecked", () => {
      const wrapper = mount(
        <MultiSelect {...NOTICE_PROPS} activeMultiSelect={[]} />
      );

      const notice = wrapper.find(".multi-select-notice");
      assert.lengthOf(notice, 1);
      assert.include(notice.text(), "Keep Firefox a click away");
      assert.include(
        notice.text(),
        "Quickly jump back in to your favorite sites."
      );
    });

    it("should hide the notice again when the item is re-checked", () => {
      const wrapper = mount(
        <MultiSelect {...NOTICE_PROPS} activeMultiSelect={[]} />
      );
      assert.lengthOf(wrapper.find(".multi-select-notice"), 1);

      wrapper.setProps({ activeMultiSelect: ["checkbox-with-notice"] });
      assert.lengthOf(wrapper.find(".multi-select-notice"), 0);
    });

    it("should apply a configured icon URL", () => {
      NOTICE_PROPS.content.tiles.data[0].uncheckedNotice.iconURL =
        "chrome://global/skin/icons/shield.svg";
      const wrapper = mount(
        <MultiSelect {...NOTICE_PROPS} activeMultiSelect={[]} />
      );

      assert.deepEqual(
        wrapper.find(".multi-select-notice-icon").prop("style"),
        {
          backgroundImage: 'url("chrome://global/skin/icons/shield.svg")',
        }
      );
    });
  });
});
