# Sidebar Chatbot Promo

`sidebar_chatbot_promo` renders a promotional card in the genai chat sidebar,
above the summarize button in the sidebar footer.

The `chatbot-promo` custom element only renders and reports interactions. All
messaging-system behavior — content resolution, impressions, button actions and
teardown — lives in
[`SidebarChatBotPromo.sys.mjs`](https://searchfox.org/mozilla-central/source/browser/components/asrouter/modules/SidebarChatBotPromo.sys.mjs),
which ASRouter dispatches to based on the message `template`.

## Content

| Field | Purpose |
|-------|---------|
| `type` | Visual style, passed through to `moz-promo` |
| `heading` | Card heading |
| `message` | Card body text |
| `primary_button` | Label plus the action to run when clicked |
| `additional_button` | Label plus the action to run when dismissed |

Use `additional_button`, not `secondary_button`. The onboarding provider
pre-translates `secondary_button` labels via Fluent, which breaks on labels that
aren't `{ string_id }`.

Text fields use the `localizableText` shared definition: either a plain string
or `{ "string_id": "..." }`. The `{ "raw": "..." }` form used by multistage
screen content is **not** valid here.

Messages deployed from a Nimbus experiment usually use
[experiment localization](https://experimenter.info/workflow/localization/):
an `$l10n` object carrying `id`, `text`, and `comment`. The schema doesn't need
to account for this — Nimbus substitutes the localized string before the message
is validated.

A message whose content resolves to nothing at all is a no-op — the surface is
wired up, but nothing renders.

## Dismissal and blocking

This surface does not block messages on its own. Both buttons run whatever
action the message specifies and then hide the card; the message remains
eligible until its frequency cap is exhausted.

If the promo should never return once the user has interacted with it, the
message must say so with
[`BLOCK_MESSAGE`](/toolkit/components/messaging-system/docs/SpecialMessageActionSchemas/index.md).
Use `MULTI_ACTION` on the primary button to both run the real action and block:

```json
"primary_button": {
  "label": { "string_id": "some-fluent-id" },
  "action": {
    "type": "MULTI_ACTION",
    "data": {
      "actions": [
        { "type": "FXA_AIWINDOW_SIGNIN_FLOW" },
        { "type": "BLOCK_MESSAGE", "data": { "id": "MY_PROMO_ID" } }
      ]
    }
  }
},
"additional_button": {
  "label": { "string_id": "some-other-fluent-id" },
  "action": { "type": "BLOCK_MESSAGE", "data": { "id": "MY_PROMO_ID" } }
}
```

## Targeting

The message is routed by the
[`sidebarToolOpened`](/toolkit/components/messaging-system/docs/TriggerActionSchemas/index.md)
trigger, which fires for **every** sidebar tool. Targeting must narrow it to the
chat sidebar:

```
view == 'viewGenaiChatSidebar' && 'browser.ml.chat.provider'|preferenceValue != ''
```

The `browser.ml.chat.provider` clause keeps the promo from showing during
onboarding, before a chatbot has been selected — otherwise it would render over
the onboarding overlay and count impressions the user never really saw.
`SidebarChatBotPromo.showPromo` also returns early when that pref is empty, so
test providers that override targeting stay gated too.

`sidebarToolOpened` is fired from `sidebar-main.mjs` when the user opens a tool.
The promo appears the next time the chat sidebar view is opened.

Targeting is also rewritten automatically: an expression that doesn't mention
`isAIWindow` becomes `((<your expression>) && !isAIWindow)`, so a message is
Classic-window-only unless it opts in explicitly.

## Example JSON

```json
{
  "id": "EXAMPLE_SIDEBAR_CHATBOT_PROMO",
  "template": "sidebar_chatbot_promo",
  "groups": [],
  "targeting": "view == 'viewGenaiChatSidebar' && 'browser.ml.chat.provider'|preferenceValue != ''",
  "trigger": { "id": "sidebarToolOpened" },
  "frequency": {
    "custom": [{ "period": 604800000, "cap": 3 }]
  },
  "content": {
    "type": "default",
    "heading": { "string_id": "example-promo-heading" },
    "message": { "string_id": "example-promo-message" },
    "primary_button": {
      "label": { "string_id": "example-promo-primary-button" },
      "action": { "type": "FXA_AIWINDOW_SIGNIN_FLOW" }
    },
    "additional_button": {
      "label": { "string_id": "example-promo-dismiss-button" },
      "action": { "type": "BLOCK_MESSAGE", "data": { "id": "EXAMPLE_SIDEBAR_CHATBOT_PROMO" } }
    }
  }
}
```

## Schema

[SidebarChatBotPromo.schema.json](https://searchfox.org/mozilla-central/source/browser/components/asrouter/content-src/templates/OnboardingMessage/SidebarChatBotPromo.schema.json)

## Testing

No `sidebar_chatbot_promo` message ships enabled.

### Development

Set `browser.newtabpage.activity-stream.asrouter.devtoolsEnabled` to `true`,
open `about:asrouter`, find (or edit) a `sidebar_chatbot_promo` message, and
click **Show**. "Show" passes `force`, so it opens the chat sidebar to the right
tool for you. The **Share** button copies an `about:messagepreview` URL that
renders the promo for anyone who also has the devtools pref enabled.

### QA verification

A test message is available through `PanelTestProvider`:

1. Set `browser.newtabpage.activity-stream.asrouter.devtoolsEnabled` to `true`.
2. Set
   `browser.newtabpage.activity-stream.asrouter.providers.panel_local_testing`
   to:
   ```json
   {"id":"panel_local_testing","type":"local","localProvider":"PanelTestProvider","enabled":true,"cohort":"SHOW_TEST"}
   ```
3. Select a chatbot provider — the promo is gated on `browser.ml.chat.provider`
   and won't show during onboarding.
4. Open the sidebar and click the chatbot icon. The promo appears the next time
   the chat sidebar view is opened.

Supply a real message via a Nimbus experiment for production.

## Related Docs

- [Targeting attributes](./targeting-attributes.md)
- [Guide to targeting with JEXL](./targeting-guide.md)
- [Frequency and Frequency Caps](./frequency-caps.md)
- [User actions](/toolkit/components/messaging-system/docs/SpecialMessageActionSchemas/index.md)
- [Triggers](/toolkit/components/messaging-system/docs/TriggerActionSchemas/index.md)
