/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

import { HttpServer } from "resource://testing-common/httpd.sys.mjs";
import { NetUtil } from "resource://gre/modules/NetUtil.sys.mjs";

const SERVER_PATH = "/api/v1/create";
const MOCK_SHARE_URL = "https://share.firefox.com/mockShare001";

/**
 * Mock content sharing server. Handles POST /api/v1/create and returns a
 * mock shareable URL. Overrides browser.contentsharing.server.url while running.
 */
class ContentSharingMockServerClass {
  #httpServer = null;
  #url = null;
  #requests = [];
  #originalServerUrl = null;
  #mockResponse = { url: MOCK_SHARE_URL };
  #mockResponseStatus = 200;

  get url() {
    return this.#url;
  }

  get requests() {
    return this.#requests;
  }

  get mockResponse() {
    return this.#mockResponse;
  }
  set mockResponse(value) {
    this.#mockResponse = value;
  }

  get mockResponseStatus() {
    return this.#mockResponseStatus;
  }
  set mockResponseStatus(value) {
    this.#mockResponseStatus = value;
  }

  constructor() {
    this.#httpServer = new HttpServer();
    this.#httpServer.registerPathHandler(SERVER_PATH, (req, resp) =>
      this.#handleRequest(req, resp)
    );
  }

  async start() {
    if (this.#url) {
      return;
    }

    this.reset();

    this.#httpServer.start(-1);
    const port = this.#httpServer.identity.primaryPort;
    this.#url = `http://localhost:${port}${SERVER_PATH}`;

    this.#originalServerUrl = Services.prefs.getStringPref(
      "browser.contentsharing.server.url",
      ""
    );
    Services.prefs.setStringPref(
      "browser.contentsharing.server.url",
      this.#url
    );
  }

  async stop() {
    if (!this.#url) {
      return;
    }

    await this.#httpServer.stop();
    this.#url = null;

    if (this.#originalServerUrl) {
      Services.prefs.setStringPref(
        "browser.contentsharing.server.url",
        this.#originalServerUrl
      );
    } else {
      Services.prefs.clearUserPref("browser.contentsharing.server.url");
    }
    this.#originalServerUrl = null;
  }

  reset() {
    this.#requests = [];
    this.#mockResponse = { url: MOCK_SHARE_URL };
    this.#mockResponseStatus = 200;
  }

  #handleRequest(httpRequest, httpResponse) {
    const bodyStream = httpRequest.bodyInputStream;
    const bodyText = NetUtil.readInputStreamToString(
      bodyStream,
      bodyStream.available(),
      { charset: "UTF-8" }
    );

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      body = null;
    }

    this.#requests.push({ body });

    httpResponse.processAsync();
    httpResponse.setStatusLine("", this.#mockResponseStatus, "");
    httpResponse.setHeader("Content-Type", "application/json", false);
    httpResponse.write(JSON.stringify(this.#mockResponse));
    httpResponse.finish();
  }
}

export const ContentSharingMockServer = new ContentSharingMockServerClass();
