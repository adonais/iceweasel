import React from "react";
import { mount, shallow } from "enzyme";
import {
  ActionChecklist,
  ActionChecklistItem,
  ActionChecklistProgressBar,
} from "content-src/components/ActionChecklist";
import { GlobalOverrider } from "tests/unit/utils";

describe("Action Checklist component", () => {
  let globals;

  describe("<ActionChecklist>", () => {
    let sandbox;
    const mockContent = {
      action_checklist_subtitle: {
        raw: "Test subtitle",
      },
      tiles: {
        type: "action_checklist",
        data: [
          {
            id: "action-checklist-test",
            targeting: "false",
            label: {
              raw: "Test label",
            },
            action: {
              data: {
                pref: {
                  name: "messaging-system-action.test1",
                  value: "false",
                },
              },
              type: "SET_PREF",
            },
          },
          {
            id: "action-checklist-test2",
            targeting: "false",
            label: {
              raw: "Test label 2",
            },
            action: {
              data: {
                pref: {
                  name: "messaging-system-action.test2",
                  value: "false",
                },
              },
              type: "SET_PREF",
            },
          },
        ],
      },
    };

    beforeEach(async () => {
      sandbox = sinon.createSandbox();
      globals = new GlobalOverrider();
      globals.set({
        AWEvaluateAttributeTargeting: () => Promise.resolve(),
        AWSendEventTelemetry: () => {},
      });
    });

    afterEach(async () => {
      globals.restore();
      sandbox.restore();
    });

    it("should render", async () => {
      const wrapper = mount(<ActionChecklist content={mockContent} />);
      assert.ok(wrapper.exists());
    });

    it("should render a subtitle when the action_checklist_subtitle property is present", () => {
      const wrapper = mount(<ActionChecklist content={mockContent} />);
      let subtitle = wrapper.find(".action-checklist-subtitle");
      assert.ok(subtitle);
      assert.equal(subtitle.text(), mockContent.action_checklist_subtitle.raw);
    });

    it("should render a number of action checklist items equal to the number of items in its configuration", async () => {
      const wrapper = mount(<ActionChecklist content={mockContent} />);

      assert.equal(
        wrapper.find(".action-checklist-items").children().length,
        mockContent.tiles.data.length
      );
    });

    const mockRemoveButton = {
      label: { raw: "Remove checklist" },
      source_id: "remove_checklist_button",
      action: {
        type: "MULTI_ACTION",
        dismiss: true,
        data: {
          actions: [
            { type: "BLOCK_MESSAGE", data: { id: "FINISH_SETUP_CHECKLIST" } },
            {
              type: "DESTROY_UIWIDGET",
              data: { widget_id: "fxms-bmb-button" },
            },
          ],
        },
      },
    };

    const mockContentWithRemoveButton = {
      ...mockContent,
      remove_checklist_button: mockRemoveButton,
    };

    describe("remove checklist button", () => {
      it("should not render when no actions are complete", async () => {
        const wrapper = mount(
          <ActionChecklist
            content={mockContentWithRemoveButton}
            message_id="TEST"
          />
        );
        await new Promise(resolve => setTimeout(resolve, 0));
        wrapper.update();
        assert.isFalse(
          wrapper.find(".action-checklist-complete-button").exists()
        );
      });

      it("should not render when actions are only partially complete", async () => {
        // AWEvaluateAttributeTargeting is called in two places when ActionChecklist
        // mounts: once per ActionChecklistItem useEffect (calls 0 and 1, children run
        // before parent), then once per tile inside evaluateAllActionsTargeting (calls 2
        // and 3). Only the latter set drives numberOfCompletedActions, so to simulate
        // one of two tiles complete we target call index 2.
        sandbox
          .stub(window, "AWEvaluateAttributeTargeting")
          .resolves(false)
          .onCall(2)
          .resolves(true);
        const wrapper = mount(
          <ActionChecklist
            content={mockContentWithRemoveButton}
            message_id="TEST"
          />
        );
        await new Promise(resolve => setTimeout(resolve, 0));
        wrapper.update();
        assert.isFalse(
          wrapper.find(".action-checklist-complete-button").exists()
        );
      });

      it("should render when all actions are complete", async () => {
        sandbox.stub(window, "AWEvaluateAttributeTargeting").resolves(true);
        const wrapper = mount(
          <ActionChecklist
            content={mockContentWithRemoveButton}
            message_id="TEST"
          />
        );
        await new Promise(resolve => setTimeout(resolve, 0));
        wrapper.update();
        assert.isTrue(
          wrapper.find(".action-checklist-complete-button").exists()
        );
      });

      it("should call handleAction with the remove button action when clicked", async () => {
        sandbox.stub(window, "AWEvaluateAttributeTargeting").resolves(true);
        const handleAction = sandbox.stub();
        const wrapper = mount(
          <ActionChecklist
            content={mockContentWithRemoveButton}
            message_id="TEST"
            handleAction={handleAction}
          />
        );
        await new Promise(resolve => setTimeout(resolve, 0));
        wrapper.update();
        wrapper.find(".action-checklist-complete-button").simulate("click");
        assert.calledOnce(handleAction);
        assert.calledWith(
          handleAction,
          sinon.match({ source: mockRemoveButton.source_id }),
          mockRemoveButton.action
        );
      });
    });
  });

  describe("<ActionChecklistItem>", () => {
    let sandbox;

    beforeEach(async () => {
      globals = new GlobalOverrider();
      globals.set({
        AWEvaluateAttributeTargeting: () => Promise.resolve(),
      });
      sandbox = sinon.createSandbox();
    });

    afterEach(async () => {
      globals.restore();
      sandbox.restore();
    });

    const mockItem = {
      id: "test-item",
      targeting: "true",
      label: {
        raw: "test",
      },
    };

    const handleAction = sinon.spy();

    it("should render with a button", async () => {
      const wrapper = shallow(
        <ActionChecklistItem
          item={mockItem}
          index={0}
          handleAction={handleAction}
        />
      );
      assert.ok(wrapper.find("button").exists());
    });

    it("should render with a label", async () => {
      const wrapper = mount(
        <ActionChecklistItem
          item={mockItem}
          index={0}
          handleAction={handleAction}
        />
      );
      assert.ok(wrapper.find("span").exists());
      assert.equal(wrapper.find("span").text(), mockItem.label.raw);
    });

    it("should call handleAction when clicked", async () => {
      const wrapper = shallow(
        <ActionChecklistItem
          item={mockItem}
          index={0}
          handleAction={handleAction}
        />
      );
      await wrapper.find("button").simulate("click");
      assert.calledOnce(handleAction);
    });

    it("should display an action arrow when targeting is false", async () => {
      sandbox.stub(window, "AWEvaluateAttributeTargeting").resolves(false);
      const wrapper = mount(
        <ActionChecklistItem
          item={mockItem}
          index={0}
          handleAction={handleAction}
        />
      );
      await new Promise(resolve => setTimeout(resolve, 0));
      wrapper.update();
      assert.ok(wrapper.find(".action-arrow").exists());
    });

    it("should display a filled checkbox when targeting is true", async () => {
      sandbox.stub(window, "AWEvaluateAttributeTargeting").resolves(true);
      const wrapper = mount(
        <ActionChecklistItem
          item={mockItem}
          index={0}
          handleAction={handleAction}
        />
      );
      await new Promise(resolve => setTimeout(resolve, 0));
      wrapper.update();
      assert.ok(wrapper.find(".check-filled").exists());
    });

    it("should be disabled when targeting is true", async () => {
      sandbox.stub(window, "AWEvaluateAttributeTargeting").resolves(true);
      const wrapper = shallow(
        <ActionChecklistItem
          item={mockItem}
          index={0}
          handleAction={handleAction}
        />
      );
      assert.ok(wrapper.find("button").prop("disabled"));
    });

    it("should be disabled when clicked", async () => {
      const wrapper = shallow(
        <ActionChecklistItem
          item={mockItem}
          index={0}
          handleAction={handleAction}
        />
      );
      await wrapper.find("button").simulate("click");
      assert.ok(wrapper.find("button").prop("disabled"));
    });
  });

  describe("<ActionChecklistProgressbar>", () => {
    it("should render the progress bar container", async () => {
      const wrapper = shallow(<ActionChecklistProgressBar progress={0} />);
      assert.ok(
        wrapper.find(".action-checklist-progress-bar-container").exists()
      );
    });

    it("should render the progress bar", async () => {
      const wrapper = shallow(<ActionChecklistProgressBar progress={0} />);
      assert.ok(wrapper.find(".action-checklist-progress-bar").exists());
    });

    it("should render the progress bar indicator with a width based on the progress", async () => {
      const progressPercent = 25;
      const wrapper = shallow(
        <ActionChecklistProgressBar progress={progressPercent} />
      );
      const indicatorElement = wrapper.find(".indicator");
      const indicatorWidth =
        indicatorElement.prop("style")[
          "--action-checklist-progress-bar-progress"
        ];
      assert.equal(indicatorWidth, `${progressPercent}%`);
    });

    it("should display the progress percentage", async () => {
      const progressPercent = 75;
      const wrapper = shallow(
        <ActionChecklistProgressBar progress={progressPercent} />
      );
      const progressText = wrapper.find(".action-checklist-progress-text");
      assert.ok(progressText.exists());
      assert.equal(progressText.text(), `${progressPercent}%`);
    });

    it("should round the progress percentage", async () => {
      const progressPercent = 66.7;
      const wrapper = shallow(
        <ActionChecklistProgressBar progress={progressPercent} />
      );
      const progressText = wrapper.find(".action-checklist-progress-text");
      assert.equal(progressText.text(), "67%");
    });
  });
});
