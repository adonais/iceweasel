/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
const { topChromeWindow } = window.browsingContext;

ChromeUtils.defineESModuleGetters(lazy, {
  AboutWelcomeParent: "resource:///actors/AboutWelcomeParent.sys.mjs",
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
});
const MODEL_PREF = "browser.smartwindow.firstrun.modelChoice";
const AUTO_ADVANCE_PREF = "browser.smartwindow.firstrun.autoAdvanceMS";
const FIRST_RUN_COMPLETE_PREF = "browser.smartwindow.firstrun.hasCompleted";
const EXPLAINER_PAGE_PREF = "browser.smartwindow.firstrun.explainerURL";

const autoAdvanceMS = Services.prefs.getIntPref(AUTO_ADVANCE_PREF);

const AI_WINDOW_CONFIG = {
  id: "AI_WINDOW_WELCOME",
  template: "spotlight",
  transitions: true,
  modal: "tab",
  backdrop: "transparent",
  screens: [
    {
      id: "AI_WINDOW_INTRO",
      auto_advance: {
        actionEl: "primary_button",
        actionTimeMS: autoAdvanceMS,
      },
      force_hide_steps_indicator: true,
      content: {
        fullscreen: true,
        hide_secondary_section: "responsive",
        position: "center",
        paddingBottom: "0px",
        background: "transparent",
        screen_style: {
          overflow: "hidden",
        },
        title: {
          fontWeight: 350,
          fontSize: "39px",
          letterSpacing: 0,
          lineHeight: "56px",
          textAlign: "center",
          string_id: "aiwindow-firstrun-title",
        },
        primary_button: {
          label: "",
          action: {
            navigate: true,
          },
        },
      },
    },
    {
      id: "AI_WINDOW_CHOOSE_MODEL",
      force_hide_steps_indicator: true,
      content: {
        position: "center",
        background: "transparent",
        screen_style: {
          width: "750px",
        },
        title: {
          string_id: "aiwindow-firstrun-model-title",
          fontSize: "40px",
          fontWeight: "350",
          letterSpacing: 0,
          lineHeight: "normal",
        },
        subtitle: {
          string_id: "aiwindow-firstrun-model-subtitle",
          fontSize: "17px",
          fontWeight: 320,
        },
        tiles: {
          type: "single-select",
          selected: "none",
          autoTrigger: false,
          action: {
            picker: "<event>",
          },
          data: [
            {
              id: "model_1",
              label: {
                string_id: "aiwindow-firstrun-model-fast-label",
                fontSize: "20px",
                fontWeight: 613,
              },
              icon: {
                background:
                  'center / contain no-repeat url("chrome://browser/content/aiwindow/assets/model-choice-1.svg")',
              },
              body: {
                string_id: "aiwindow-firstrun-model-fast-body",
                fontSize: "15px",
                fontWeight: 320,
              },
              subtitle: {
                string_id: "aiwindow-firstrun-model-chip-subtitle",
                args: { modelName: "gemini-flash-lite", ownerName: "Google" },
              },
              action: {
                type: "SET_PREF",
                data: {
                  pref: {
                    name: MODEL_PREF,
                    value: "1",
                  },
                },
              },
            },
            {
              id: "model_2",
              label: {
                string_id: "aiwindow-firstrun-model-allpurpose-label",
                fontSize: "20px",
                fontWeight: 613,
              },
              icon: {
                background:
                  'center / contain no-repeat url("chrome://browser/content/aiwindow/assets/model-choice-2.svg")',
              },
              body: {
                string_id: "aiwindow-firstrun-model-allpurpose-body",
                fontSize: "15px",
                fontWeight: 320,
              },
              subtitle: {
                string_id: "aiwindow-firstrun-model-chip-subtitle",
                args: { modelName: "Qwen3-235B-A22B", ownerName: "Alibaba" },
              },
              action: {
                type: "SET_PREF",
                data: {
                  pref: {
                    name: MODEL_PREF,
                    value: "2",
                  },
                },
              },
            },
            {
              id: "model_3",
              label: {
                string_id: "aiwindow-firstrun-model-personal-label",
                fontSize: "20px",
                fontWeight: 613,
              },
              icon: {
                background:
                  'center / contain no-repeat url("chrome://browser/content/aiwindow/assets/model-choice-3.svg")',
              },
              body: {
                string_id: "aiwindow-firstrun-model-personal-body",
                fontSize: "15px",
                fontWeight: 320,
              },
              subtitle: {
                string_id: "aiwindow-firstrun-model-chip-subtitle",
                args: { modelName: "gpt-oss-120B", ownerName: "OpenAI" },
              },
              action: {
                type: "SET_PREF",
                data: {
                  pref: {
                    name: MODEL_PREF,
                    value: "3",
                  },
                },
              },
            },
          ],
        },
        primary_button: {
          label: {
            string_id: "aiwindow-firstrun-button",
          },
          action: {
            type: "SET_PREF",
            data: {
              pref: {
                name: FIRST_RUN_COMPLETE_PREF,
                value: true,
              },
            },
            navigate: true,
          },
        },
      },
    },
  ],
};

function renderFirstRun() {
  const AWParent = new lazy.AboutWelcomeParent();
  const receive = name => data =>
    AWParent.onContentMessage(
      `AWPage:${name}`,
      data,
      topChromeWindow.gBrowser.selectedBrowser
    );

  window.AWGetFeatureConfig = () => AI_WINDOW_CONFIG;
  window.AWEvaluateScreenTargeting = screens => screens;
  window.AWGetSelectedTheme = () => ({});
  window.AWGetInstalledAddons = () => [];
  window.AWSendToParent = (name, data) => receive(name)(data);
  window.AWSendEventTelemetry = ({
    event,
    message_id,
    event_context: { source },
  }) => {
    switch (event) {
      case "IMPRESSION":
        Glean.smartWindow.onboardingScreenImpression.record({
          message_id,
        });
        break;

      case "CLICK_BUTTON":
        if (["model_1", "model_2", "model_3"].includes(source)) {
          Glean.smartWindow.onboardingModelSelected.record({
            model: source.split("_")[1],
          });
        } else if (
          source === "primary_button" &&
          message_id.includes("AI_WINDOW_CHOOSE_MODEL")
        ) {
          const prefValue = Services.prefs.getStringPref(MODEL_PREF, "");
          Glean.smartWindow.onboardingModelNavigate.record({
            model: prefValue || "",
          });
        }
        break;
    }
  };

  window.AWFinish = () => {
    window.AWSendToParent("SPECIAL_ACTION", {
      type: "OPEN_URL",
      data: {
        args: Services.prefs.getStringPref(
          EXPLAINER_PAGE_PREF,
          "http://www.firefox.com/smart-window/?v=product"
        ),
        where: "tab",
      },
    });
    Glean.smartWindow.onboardingComplete.record();
    window.location.href = lazy.AIWindow.newTabURL;
  };

  window.addEventListener(
    "unload",
    () => {
      AWParent.didDestroy();
    },
    { once: true }
  );

  const script = document.createElement("script");
  script.src = "chrome://browser/content/aboutwelcome/aboutwelcome.bundle.js";
  document.body.appendChild(script);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderFirstRun, { once: true });
} else {
  renderFirstRun();
}
