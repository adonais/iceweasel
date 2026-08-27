/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @typedef {object} AgentUpdateData
 * @property {string} messageId - Id of the chat message carrying the agent card
 * @property {string} toolCallId - Correlation id stamped on the card's toolUIData
 * @property {string} updateType - One of AGENT_UPDATE_TYPES
 * @property {object} updateData - Payload from the card's action event
 *
 * @typedef {object} AgentHandlerContext
 * @property {object} message - The chat message the card is attached to
 * @property {object} updateData - The card action payload
 * @property {object} conversation - The active ChatConversation
 * @property {ChromeWindow} window - The browser window
 *
 * @typedef {object} AgentCommandContext
 * @property {string} [text] - The user's prompt text accompanying the command
 * @property {string} [contextPageUrl] - Current page URL to seed the agent with
 * @property {object} conversation - The active ChatConversation
 * @property {ChromeWindow} [window] - The browser window
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  MonitorAgent:
    "moz-src:///browser/components/aiwindow/models/agents/MonitorAgent.sys.mjs",
  MonitorUIUtils:
    "moz-src:///browser/components/aiwindow/ui/modules/MonitorUIUtils.sys.mjs",
  IntervalSchedule:
    "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs",
  DailySchedule:
    "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs",
  WeeklySchedule:
    "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs",
  MONITOR_AGENTS_CHANGED_TOPIC:
    "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs",
  TOTAL_NUM_MONITORS:
    "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs",
  isAllowedWatchUrl:
    "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "AgentUI",
    maxLogLevelPref: "browser.smartwindow.agentUI.logLevel",
  })
);

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["preview/aiWindow.ftl"], true)
);

/**
 * uiType values rendered as agent cards in chat
 * Kept in sync with the UI_TYPES map in ai-chat-content.mjs
 */
export const AGENT_UI_TYPES = Object.freeze({
  MONITOR_ITEM: "agent-monitor-item",
});

/**
 * updateType values dispatched by agent cards
 * Kept in sync with the UI_UPDATE_TYPES map in ai-chat-content.mjs
 */
export const AGENT_UPDATE_TYPES = Object.freeze({
  CREATE_WATCH: "create-watch",
  CANCEL_WATCH: "cancel-watch",
  UPDATE_WATCH: "update-watch",
  DELETE_WATCH: "delete-watch",
  PAUSE_WATCH: "pause-watch",
  CHECK_WATCH: "check-watch",
  SAVE_WATCH_DRAFT: "save-watch-draft",
});

export const AGENT_COMMANDS = Object.freeze({
  WATCH: "watch",
});

// Default cadence for a newly created monitor
const DEFAULT_MONITOR_CHECK_MINUTES = 60;
const PREF_AGENT_ENABLED = "browser.smartwindow.agent.enabled";
// Address of the tasks page, passed to chat messages as the $url variable.
const TASKS_PAGE_URL = "about:smartwindowtasks";

/**
 * Handles interactive updates from agent cards embedded in chat
 */
export class AgentUI {
  /**
   * Routes an agent card update to its handler
   *
   * @param {AgentUpdateData} data
   * @param {object} conversation - The active ChatConversation
   * @param {ChromeWindow} window - The browser window
   * @returns {Promise<boolean>} True when the update was handled
   */
  static async handleUpdate(data, conversation, window) {
    const { messageId, toolCallId, updateType, updateData } = data ?? {};

    if (!messageId) {
      return false;
    }

    const message = conversation?.messages?.find(m => m.id === messageId);
    //  Agents aren't tool calls, but the card reuses 'toolCallId' as its correlation handle
    if (message?.toolUIData?.toolCallId !== toolCallId) {
      return false;
    }

    const handler = this.#UPDATE_TYPE_HANDLERS[updateType];
    if (typeof handler !== "function") {
      lazy.console.error(`AgentUI: unknown updateType "${updateType}"`);
      return false;
    }

    return handler({ message, updateData, conversation, window });
  }

  /**
   *  New agents register their update types here
   *
   * @private
   */
  static #UPDATE_TYPE_HANDLERS = {
    /* TODO: Bug 2060609 - match naming monitor -> watch */
    [AGENT_UPDATE_TYPES.CREATE_WATCH]: this.handleCreateMonitor.bind(this),
    [AGENT_UPDATE_TYPES.CANCEL_WATCH]: this.#handleCancelMonitor.bind(this),
    [AGENT_UPDATE_TYPES.UPDATE_WATCH]: this.#handleUpdateMonitor.bind(this),
    [AGENT_UPDATE_TYPES.DELETE_WATCH]: this.#handleDeleteMonitor.bind(this),
    [AGENT_UPDATE_TYPES.PAUSE_WATCH]: this.#handlePauseMonitor.bind(this),
    [AGENT_UPDATE_TYPES.CHECK_WATCH]: this.#handleCheckMonitor.bind(this),
    [AGENT_UPDATE_TYPES.SAVE_WATCH_DRAFT]:
      this.#handleSaveMonitorDraft.bind(this),
  };

  /**
   *  New agents register their smartbar commands here
   *
   * @private
   */
  static #COMMAND_HANDLERS = {
    [AGENT_COMMANDS.WATCH]: this.#handleMonitorCommand.bind(this),
  };

  /**
   * Handles the monitor create card for the current page
   *
   * @param {AgentCommandContext} context
   * @param {string} context.text - The command argument text, with the `/monitor` prefix stripped
   * @param {string} [context.contextPageUrl] - Url of the page the command was issued from
   * @param {Conversation} context.conversation - The conversation the command was submitted in
   */
  static async #handleMonitorCommand({ text, contextPageUrl, conversation }) {
    if (!conversation) {
      return;
    }
    const { prompt: condition, raw } = text;
    const url = contextPageUrl || "";
    if (raw) {
      const userMessage = conversation.addUserMessage(raw);
      conversation.emit("chat-conversation:message-update", userMessage);
    }

    if (!lazy.isAllowedWatchUrl(url)) {
      conversation.addAssistantWithL10nMessage(
        "smartwindow-agent-monitor-page-not-watchable"
      );
      return;
    }

    const monitors = await lazy.MonitorAgent.listMonitors();
    if (monitors.length >= lazy.TOTAL_NUM_MONITORS) {
      conversation.addAssistantWithL10nMessage(
        "smartwindow-agent-monitor-limit-reached",
        { count: lazy.TOTAL_NUM_MONITORS },
        { l10nName: "tasks", href: TASKS_PAGE_URL }
      );
      return;
    }

    conversation.addAssistantMessage(
      "text",
      lazy.l10n.formatValueSync("smartwindow-agent-monitor-setup")
    );
    conversation.addUIToolToCurrentMessage(`monitor-${crypto.randomUUID()}`, {
      uiType: AGENT_UI_TYPES.MONITOR_ITEM,
      properties: {
        agent: {
          condition,
          url,
          watchUrls: url ? [url] : [],
        },
      },
    });
  }

  /**
   * Creates a monitor from the card's submitted condition
   * plus the page context that seeded the card
   *
   * @param {AgentHandlerContext} context
   * @returns {Promise<boolean>}
   */
  static async handleCreateMonitor({ message, updateData, conversation }) {
    const agent = message?.toolUIData?.properties?.agent ?? {};
    const args = this.#buildMonitorArgs(updateData, agent);

    if (!args.prompt || !args.watchUrls.length) {
      lazy.console.warn(
        "AgentUI: cannot create a monitor without a prompt and at least one URL"
      );
      return false;
    }

    let monitorId;
    try {
      monitorId = await lazy.MonitorAgent.createMonitor(args);
    } catch (error) {
      lazy.console.error("AgentUI: failed to create monitor", error);
      return false;
    }

    const monitorName =
      args.pageTitle ||
      lazy.l10n.formatValueSync("smartwindow-agent-monitor-default-name");
    message.content.body = "";
    message.content.l10nId = "smartwindow-agent-monitor-watching";
    message.content.l10nArgs = {
      monitorName,
      schedule: this.#formatScheduleSummary(updateData?.schedule),
    };
    message.content.link = { l10nName: "tasks", href: TASKS_PAGE_URL };
    message.toolUIDraft = null;
    message.toolUIData = {
      ...message.toolUIData,
      properties: {
        mode: "display",
        agent: {
          id: monitorId,
          monitorName,
          url: args.watchUrls[0] ?? "",
          watchUrls: args.watchUrls,
          condition: args.prompt,
          status: this.#statusForKind("watching"),
          schedule: updateData?.schedule,
          expanded: updateData?.autoExpandAndCheck === true, // Auto-expand if requested
        },
      },
    };
    conversation.emit("chat-conversation:message-update", message);
    // Mark the message complete so it renders the assistant footer
    conversation.emit("chat-conversation:message-complete", message);

    // If auto-expand and check was requested, trigger a check-now after a short delay
    if (updateData?.autoExpandAndCheck) {
      // Wait for the UI to update
      Services.tm.dispatchToMainThread(async () => {
        try {
          await lazy.MonitorAgent.runNow(monitorId);
          // The check will trigger a MONITOR_AGENTS_CHANGED_TOPIC notification
          // which will update the card's history automatically
        } catch (error) {
          lazy.console.error(
            "AgentUI: failed to run initial monitor check",
            error
          );
        }
      });
    }

    return true;
  }

  /**
   * Dismisses the "create" card without persisting anything
   *
   * @param {AgentHandlerContext} context
   * @returns {Promise<boolean>}
   */
  static async #handleCancelMonitor({ message, conversation }) {
    message.toolUIDraft = null;
    await conversation.updateToolUI(message, null, null);
    return true;
  }

  /**
   * Mirrors the card's in-progress form state onto the message so it survives
   * the card being torn down and rebuilt.
   *
   * @param {AgentHandlerContext} context
   * @returns {boolean}
   */
  static #handleSaveMonitorDraft({ message, updateData }) {
    message.toolUIDraft = updateData?.draft ?? null;
    return true;
  }

  /**
   * Saves edits from the display card back to an existing monitor
   *
   * @param {AgentHandlerContext} context
   * @returns {Promise<boolean>}
   */
  static async #handleUpdateMonitor({ message, updateData, conversation }) {
    const id = updateData?.id;
    if (!id) {
      lazy.console.warn("AgentUI: cannot update a monitor without an id");
      return false;
    }

    try {
      await lazy.MonitorAgent.updateMonitor(id, {
        monitorPrompt: updateData.condition,
        watchUrls: updateData.watchUrls,
        title: updateData.monitorName,
        schedule: this.#buildSchedule(updateData.schedule),
      });
    } catch (error) {
      lazy.console.error("AgentUI: failed to update monitor", error);
      return false;
    }

    const agent = message?.toolUIData?.properties?.agent ?? {};
    message.toolUIDraft = null;
    message.toolUIData = {
      ...message.toolUIData,
      properties: {
        mode: "display",
        agent: {
          ...agent,
          monitorName: updateData.monitorName || agent.monitorName,
          condition: updateData.condition,
          url: updateData.watchUrls?.[0] ?? agent.url,
          watchUrls: updateData.watchUrls,
          schedule: updateData.schedule,
        },
      },
    };
    conversation.emit("chat-conversation:message-update", message);
    return true;
  }

  /**
   * Deletes an existing monitor and removes its card
   *
   * @param {AgentHandlerContext} context
   * @returns {Promise<boolean>}
   */
  static async #handleDeleteMonitor({
    message,
    updateData,
    conversation,
    window,
  }) {
    const id = updateData?.id;
    if (!id) {
      lazy.console.warn("AgentUI: cannot delete a monitor without an id");
      return false;
    }

    // Get the browsing context from the window
    const browsingContext = window?.gBrowser?.selectedBrowser?.browsingContext;
    if (!browsingContext) {
      lazy.console.warn(
        "AgentUI: cannot get browsing context for confirmation dialog"
      );
      return false;
    }

    const result = await lazy.MonitorUIUtils.deleteMonitorWithConfirmation(
      browsingContext,
      id
    );

    if (!result.success) {
      lazy.console.error("AgentUI: failed to delete monitor", result.error);
      return false;
    }

    if (result.cancelled) {
      // User cancelled, don't remove the card
      return true;
    }

    const agent = message?.toolUIData?.properties?.agent ?? {};
    const monitorName =
      agent.monitorName ||
      lazy.l10n.formatValueSync("smartwindow-agent-monitor-default-name");
    message.content.body = "";
    message.content.l10nId = "smartwindow-agent-monitor-deleted";
    message.content.l10nArgs = { monitorName };
    message.content.link = null;

    // User confirmed and deletion succeeded, remove the card
    await conversation.updateToolUI(message, null, null);
    return true;
  }

  /**
   * Toggles an existing monitor between paused (disabled) and watching
   * (enabled)
   *
   * @param {AgentHandlerContext} context
   * @returns {Promise<boolean>}
   */
  static async #handlePauseMonitor({ message, updateData, conversation }) {
    const id = updateData?.id;
    if (!id) {
      lazy.console.warn("AgentUI: cannot pause a monitor without an id");
      return false;
    }

    const paused = !!updateData?.paused;

    try {
      await lazy.MonitorAgent.updateMonitor(id, { enabled: !paused });
    } catch (error) {
      lazy.console.error("AgentUI: failed to pause monitor", error);
      return false;
    }

    const agent = message?.toolUIData?.properties?.agent ?? {};
    const status = this.#statusForKind(paused ? "paused" : "watching");
    message.toolUIData = {
      ...message.toolUIData,
      properties: {
        ...message.toolUIData.properties,
        agent: { ...agent, status },
      },
    };
    conversation.emit("chat-conversation:message-update", message);
    return true;
  }

  /**
   * Runs an existing monitor's check immediately then reconciles the card's
   * history with the monitor's notification events
   *
   * @param {AgentHandlerContext} context
   * @returns {Promise<boolean>}
   */
  static async #handleCheckMonitor({ conversation, updateData }) {
    const id = updateData?.id;
    if (!id) {
      lazy.console.warn("AgentUI: cannot check a monitor without an id");
      return false;
    }

    try {
      await lazy.MonitorAgent.runNow(id);
    } catch (error) {
      lazy.console.error("AgentUI: failed to run monitor", error);
      return false;
    }

    // The manual run fires MONITOR_AGENTS_CHANGED_TOPIC but sync this
    // conversation directly so the card updates even when it is not observed
    const byId = await this.#loadMonitorsById();
    this.#syncConversationHistory(conversation, byId);
    return true;
  }

  /**
   * Registers a conversation to have its monitor cards kept in sync with
   * MonitorAgent's notification history
   *
   * @param {object} conversation - The active ChatConversation
   */
  static observeMonitorChanges(conversation) {
    if (!conversation) {
      return;
    }
    this.#observedConversations.add(conversation);

    if (!this.#monitorObserver) {
      this.#monitorObserver = () => {
        this.#syncAllMonitorHistories().catch(error =>
          lazy.console.error("AgentUI: failed to sync monitor histories", error)
        );
      };
      Services.obs.addObserver(
        this.#monitorObserver,
        lazy.MONITOR_AGENTS_CHANGED_TOPIC
      );
    }

    this.#syncAllMonitorHistories().catch(error =>
      lazy.console.error("AgentUI: failed to sync monitor histories", error)
    );
  }

  /**
   * Stops syncing a conversation's monitor cards
   *
   * @param {object} conversation - The ChatConversation to stop observing
   */
  static unobserveMonitorChanges(conversation) {
    if (!conversation) {
      return;
    }
    this.#observedConversations.delete(conversation);

    if (!this.#observedConversations.size && this.#monitorObserver) {
      Services.obs.removeObserver(
        this.#monitorObserver,
        lazy.MONITOR_AGENTS_CHANGED_TOPIC
      );
      this.#monitorObserver = null;
    }
  }

  /** @type {Set<object>} Conversations whose monitor cards we keep in sync */
  static #observedConversations = new Set();

  /** @type {?Function} Shared MONITOR_AGENTS_CHANGED_TOPIC observer */
  static #monitorObserver = null;

  static async #loadMonitorsById() {
    const monitors = await lazy.MonitorAgent.listMonitors();
    return new Map(monitors.map(monitor => [monitor.id, monitor]));
  }

  static async #syncAllMonitorHistories() {
    if (!this.#observedConversations.size) {
      return;
    }
    const byId = await this.#loadMonitorsById();
    for (const conversation of this.#observedConversations) {
      this.#syncConversationHistory(conversation, byId);
    }
  }

  /**
   * Rebuilds each monitor card's history from its monitor's notification
   * entries and re-renders when it changed
   *
   * @param {object} conversation - The ChatConversation to reconcile
   * @param {Map<string, object>} byId - Serialized monitors keyed by id
   * @private
   */
  static #syncConversationHistory(conversation, byId) {
    for (const message of conversation?.messages ?? []) {
      if (message?.toolUIData?.uiType !== AGENT_UI_TYPES.MONITOR_ITEM) {
        continue;
      }
      const agent = message.toolUIData.properties?.agent;
      const monitor = byId.get(agent?.id);
      if (!monitor) {
        continue;
      }

      // Pass raw history data - let the component handle formatting
      const history = (monitor.history ?? [])
        .filter(entry => entry.status === "success" || entry.status === "error")
        .reverse();

      if (JSON.stringify(history) === JSON.stringify(agent.history ?? [])) {
        continue;
      }

      message.toolUIData = {
        ...message.toolUIData,
        properties: {
          ...message.toolUIData.properties,
          agent: { ...agent, history },
        },
      };
      conversation.emit("chat-conversation:message-update", message);
    }
  }

  /**
   * Builds a card status chip for a monitor state
   *
   * @param {"watching"|"paused"} kind
   * @returns {{ label: string, kind: string }}
   * @private
   */
  static #statusForKind(kind) {
    return {
      label: lazy.l10n.formatValueSync(
        `smartwindow-agent-monitor-status-${kind}`
      ),
      kind,
    };
  }

  /**
   * Maps a monitor card's submit payload plus the page context that seeded it
   * to createMonitor arguments
   *
   * @param {object} updateData - '{ condition, ... }' from the card submit event
   * @param {object} agent - The agent data that seeded the card
   * @returns {{ prompt: string, watchUrls: string[], pageTitle: string, schedule: object }}
   * @private
   */
  static #buildMonitorArgs(updateData, agent) {
    const watchUrls = updateData?.watchUrls?.length
      ? updateData.watchUrls
      : (agent.watchUrls ?? (agent.url ? [agent.url] : []));
    return {
      prompt: updateData?.condition ?? agent.condition ?? "",
      watchUrls,
      pageTitle:
        updateData?.monitorName || agent.monitorName || agent.pageTitle || "",
      schedule: this.#buildSchedule(updateData?.schedule),
      // AgentUI is primarily a chat feature, so we can use this as the source for now
      source: "in_line_chat",
    };
  }

  /**
   * Builds a Schedule from the card's
   *
   * @param {object} [schedule] - '{ frequency: "daily"|"weekly", time: "HH:MM",
   *   weekday: string }' from the card submit event
   * @returns {object} An IntervalSchedule, DailySchedule or WeeklySchedule
   * @private
   */
  static #buildSchedule(schedule) {
    const [hour, minute] = String(schedule?.time ?? "")
      .split(":")
      .map(Number);
    switch (schedule?.frequency) {
      case "daily":
        return new lazy.DailySchedule(hour, minute);
      case "weekly":
        return new lazy.WeeklySchedule(Number(schedule.weekday), hour, minute);
      default:
        return new lazy.IntervalSchedule(DEFAULT_MONITOR_CHECK_MINUTES);
    }
  }

  /**
   * Formats a localized, readable cadence for a schedule (e.g.
   * "daily at 9:00 AM" or "weekly on Monday at 9:00 AM")
   *
   * @param {object} [schedule] - '{ frequency: "daily"|"weekly", time: "HH:MM",
   *   weekday: string }' from the card submit event
   * @returns {string} The localized cadence
   * @private
   */
  static #formatScheduleSummary(schedule) {
    const [hour, minute] = String(schedule?.time ?? "")
      .split(":")
      .map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return "";
    }
    const when = new Date();
    when.setHours(hour, minute, 0, 0);
    if (schedule.frequency === "weekly") {
      const offset = (Number(schedule.weekday) - when.getDay() + 7) % 7;
      when.setDate(when.getDate() + offset);
      return lazy.l10n.formatValueSync(
        "smartwindow-agent-monitor-schedule-weekly",
        // DATETIME needs a numeric timestamp
        { time: when.getTime() }
      );
    }
    return lazy.l10n.formatValueSync(
      "smartwindow-agent-monitor-schedule-daily",
      // DATETIME needs a numeric timestamp
      { time: when.getTime() }
    );
  }

  /**
   * Parses a leading command keyword from chat classified smartbar input as an
   * interim stand in for the "/" command palette
   *
   * @param {string} value - Raw chat input
   * @returns {?{command: string, prompt: string, raw: string}} The lowercased
   *  command keyword, the text following the command, and the raw chat input,
   *  or null when there is no leading command
   * @private
   */
  static #parseCommand(value) {
    const raw = String(value ?? "").trim();
    const match = /^\/(\w+)\b\s*(.*)$/s.exec(raw);
    if (!match) {
      return null;
    }
    return {
      command: match[1].toLowerCase(),
      prompt: match[2].trim(),
      raw,
    };
  }

  /**
   * Routes a smartbar submission to an agent when it is an agent command

   * @param {object} context
   * @param {string} [context.command] - Explicit command id from the palette
   * @param {string} context.value - Raw smartbar input
   * @param {string} [context.contextPageUrl] - Current page URL to seed the agent
   * @param {object} context.conversation - The active ChatConversation
   * @param {ChromeWindow} [context.window] - The browser window
   * @returns {boolean} True when the input was recognized and handled as a command
   */
  static tryHandleCommand({
    command,
    value,
    contextPageUrl,
    conversation,
    window,
  }) {
    if (
      !lazy.MonitorUIUtils.isMonitorRegionSupported() ||
      !Services.prefs.getBoolPref(PREF_AGENT_ENABLED, false)
    ) {
      return false;
    }

    // An explicit command from the palette takes priority
    const parsed = this.#parseCommand(value);
    const parsedCommand = command
      ? {
          command,
          prompt: parsed?.prompt ?? "",
          raw: String(value ?? "").trim(),
        }
      : parsed;

    if (!parsedCommand) {
      return false;
    }

    const handler = this.#COMMAND_HANDLERS[parsedCommand.command];

    if (typeof handler !== "function") {
      return false;
    }

    handler({
      text: parsedCommand,
      contextPageUrl,
      conversation,
      window,
    });

    return true;
  }

  /**
   * Route the given tool-UI update targets an agent card
   *
   * @param {AgentUpdateData} data - The tool-UI update payload
   * @returns {boolean} True when AgentUI has a handler for this update type
   */
  static isAgentUpdate(data) {
    return typeof this.#UPDATE_TYPE_HANDLERS[data?.updateType] === "function";
  }
}
