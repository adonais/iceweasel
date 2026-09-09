/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

export const ActionSchemas = {
  "show-heartbeat": {
    $schema: "http://json-schema.org/draft-04/schema#",
    title: "Show a Heartbeat survey.",
    description: "This action shows a single survey.",

    type: "object",
    required: [
      "surveyId",
      "message",
      "thanksMessage",
      "postAnswerUrl",
      "learnMoreMessage",
      "learnMoreUrl",
    ],
    properties: {
      repeatOption: {
        type: "string",
        enum: ["once", "xdays", "nag"],
        description: "Determines how often a prompt is shown executes.",
        default: "once",
      },
      repeatEvery: {
        description:
          "For repeatOption=xdays, how often (in days) the prompt is displayed.",
        default: null,
        type: ["number", "null"],
      },
      includeTelemetryUUID: {
        type: "boolean",
        description: "Include unique user ID in post-answer-url and Telemetry",
        default: false,
      },
      surveyId: {
        type: "string",
        description: "Slug uniquely identifying this survey in telemetry",
      },
      message: {
        description: "Message to show to the user",
        type: "string",
      },
      engagementButtonLabel: {
        description:
          "Text for the engagement button. If specified, this button will be shown instead of rating stars.",
        default: null,
        type: ["string", "null"],
      },
      thanksMessage: {
        description:
          "Thanks message to show to the user after they've rated Firefox",
        type: "string",
      },
      postAnswerUrl: {
        description:
          "URL to redirect the user to after rating Firefox or clicking the engagement button",
        default: null,
        type: ["string", "null"],
      },
      learnMoreMessage: {
        description: "Message to show to the user to learn more",
        default: null,
        type: ["string", "null"],
      },
      learnMoreUrl: {
        description: "URL to show to the user when they click Learn More",
        default: null,
        type: ["string", "null"],
      },
    },
  },
};

// If running in Node.js, export the schemas.
if (typeof module !== "undefined") {
  /* globals module */
  module.exports = ActionSchemas;
}
