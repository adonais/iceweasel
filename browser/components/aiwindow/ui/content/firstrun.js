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
const MEMORIES_FROM_CONVERSATION_PREF =
  "browser.smartwindow.memories.generateFromConversation";
const MEMORIES_FROM_HISTORY_PREF =
  "browser.smartwindow.memories.generateFromHistory";
const { getAllModelsData } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AIWindowConstants.sys.mjs"
);

const autoAdvanceMS = Services.prefs.getIntPref(AUTO_ADVANCE_PREF);

function createAIWindowConfig(modelData) {
  return {
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
                  args: modelData["1"],
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
                  args: modelData["2"],
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
                  args: modelData["3"],
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
            disabled: "hasActiveSingleSelect",
            label: {
              string_id: "aiwindow-firstrun-next-button",
            },
            action: {
              navigate: true,
            },
          },
        },
      },
      {
        id: "AI_WINDOW_MEMORIES",
        force_hide_steps_indicator: true,
        content: {
          position: "center",
          background: "transparent",
          screen_style: {
            width: "650px",
          },
          title: {
            string_id: "aiwindow-firstrun-memories-title",
          },
          subtitle: {
            string_id: "aiwindow-firstrun-memories-subtitle",
            width: "460px",
          },
          primary_button: {
            label: {
              string_id: "aiwindow-firstrun-back-button",
            },
            style: "secondary",
            flow: "row",
            action: {
              goBack: true,
              navigate: true,
            },
          },
          additional_button: {
            label: {
              string_id: "aiwindow-firstrun-button",
            },
            flow: "row",
            action: {
              type: "MULTI_ACTION",
              collectSelect: true,
              navigate: true,
              data: {
                actions: [
                  {
                    type: "SET_PREF",
                    data: {
                      pref: {
                        name: FIRST_RUN_COMPLETE_PREF,
                        value: true,
                      },
                    },
                  },
                ],
              },
            },
          },
          tiles: [
            {
              type: "confirmation-checklist",
              data: {
                inert: true,
                items: [
                  {
                    icon: {
                      background:
                        "center / contain no-repeat url('chrome://browser/content/aiwindow/assets/new-chat.svg')",
                      height: "20px",
                      width: "20px",
                    },
                    text: {
                      string_id:
                        "aiwindow-firstrun-memories-conversation-title",
                      fontWeight: "600",
                    },
                    subtext: {
                      string_id: "aiwindow-firstrun-memories-conversation-body",
                    },
                  },
                  {
                    icon: {
                      background:
                        "center / contain no-repeat url('chrome://global/skin/icons/settings.svg')",
                      height: "20px",
                      width: "20px",
                    },
                    text: {
                      string_id: "aiwindow-firstrun-memories-relevance-title",
                      fontWeight: "600",
                    },
                    subtext: {
                      string_id: "aiwindow-firstrun-memories-relevance-body",
                    },
                  },
                  {
                    icon: {
                      background:
                        "center / contain no-repeat url('chrome://global/skin/icons/security.svg')",
                      height: "20px",
                      width: "20px",
                    },
                    text: {
                      string_id: "aiwindow-firstrun-memories-privacy-title",
                      fontWeight: "600",
                    },
                    subtext: {
                      string_id: "aiwindow-firstrun-memories-privacy-body",
                    },
                  },
                ],
              },
            },
            {
              type: "multiselect",
              label: {
                string_id: "aiwindow-firstrun-memories-choose-label",
              },
              footer: {
                unCheckAllLabel: {
                  string_id: "aiwindow-firstrun-memories-no-create",
                },
                checkedLabel: {
                  string_id: "aiwindow-firstrun-memories-update-settings",
                },
              },
              data: [
                {
                  id: "memories-chats",
                  defaultValue: true,
                  label: {
                    string_id: "aiwindow-firstrun-memories-checkbox-chats",
                  },
                  action: {
                    type: "SET_PREF",
                    data: {
                      pref: {
                        name: MEMORIES_FROM_CONVERSATION_PREF,
                        value: true,
                      },
                    },
                  },
                  uncheckedAction: {
                    type: "SET_PREF",
                    data: {
                      pref: {
                        name: MEMORIES_FROM_CONVERSATION_PREF,
                        value: false,
                      },
                    },
                  },
                },
                {
                  id: "memories-browsing",
                  defaultValue: true,
                  label: {
                    string_id: "aiwindow-firstrun-memories-checkbox-browsing",
                  },
                  action: {
                    type: "SET_PREF",
                    data: {
                      pref: {
                        name: MEMORIES_FROM_HISTORY_PREF,
                        value: true,
                      },
                    },
                  },
                  uncheckedAction: {
                    type: "SET_PREF",
                    data: {
                      pref: {
                        name: MEMORIES_FROM_HISTORY_PREF,
                        value: false,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

async function renderFirstRun() {
  // Create config after model data is loaded
  const modelData = await getAllModelsData();
  const AI_WINDOW_CONFIG = createAIWindowConfig(modelData);

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
        } else if (
          source === "additional_button" &&
          message_id.includes("AI_WINDOW_MEMORIES")
        ) {
          Glean.smartWindow.onboardingMemoriesNavigate.record();
        }
        break;

      case "SELECT_CHECKBOX":
        if (
          message_id.includes("AI_WINDOW_MEMORIES") &&
          Array.isArray(source)
        ) {
          Glean.smartWindow.onboardingMemoriesSettings.record({
            source: source.length ? source.join(",") : "",
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
  document.addEventListener(
    "DOMContentLoaded",
    () => renderFirstRun().catch(console.error),
    { once: true }
  );
} else {
  renderFirstRun().catch(console.error);
}
