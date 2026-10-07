/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stubGlobals } from "test/jest/test-utils";

const FAKE_CLASSIFIER_DATA = [
  {
    type: "hostname-and-params-match",
    criteria: [
      {
        hostname: "hostnameandparams.com",
        params: [
          {
            key: "param1",
            value: "val1",
          },
        ],
      },
    ],
    weight: 300,
  },
  {
    type: "url-match",
    criteria: [{ url: "https://fullurl.com/must/match" }],
    weight: 400,
  },
  {
    type: "params-match",
    criteria: [
      {
        params: [
          {
            key: "param1",
            value: "val1",
          },
          {
            key: "param2",
            value: "val2",
          },
        ],
      },
    ],
    weight: 200,
  },
  {
    type: "params-prefix-match",
    criteria: [
      {
        params: [
          {
            key: "client",
            prefix: "fir",
          },
        ],
      },
    ],
    weight: 200,
  },
  {
    type: "has-params",
    criteria: [
      {
        params: [{ key: "has-param1" }, { key: "has-param2" }],
      },
    ],
    weight: 100,
  },
  {
    type: "search-engine",
    criteria: [
      { sld: "google" },
      { hostname: "bing.com" },
      { hostname: "duckduckgo.com" },
    ],
    weight: 1,
  },
  {
    type: "news-portal",
    criteria: [
      { hostname: "yahoo.com" },
      { hostname: "aol.com" },
      { hostname: "msn.com" },
    ],
    weight: 1,
  },
  {
    type: "social-media",
    criteria: [{ hostname: "facebook.com" }, { hostname: "twitter.com" }],
    weight: 1,
  },
  {
    type: "ecommerce",
    criteria: [{ sld: "amazon" }, { hostname: "ebay.com" }],
    weight: 1,
  },
];

describe("SiteClassifier", () => {
  let classifySite;
  let restoreGlobals;

  // SiteClassifier.sys.mjs reads its default RemoteSettings client through
  // ChromeUtils.importESModule at load time, so the global has to exist before
  // the module is evaluated.
  beforeAll(async () => {
    restoreGlobals = stubGlobals({
      ChromeUtils: { importESModule: () => ({}) },
    });
    ({ classifySite } = await import("lib/SiteClassifier.sys.mjs"));
  });

  afterAll(() => {
    restoreGlobals();
  });

  function RemoteSettings() {
    return {
      get() {
        return Promise.resolve(FAKE_CLASSIFIER_DATA);
      },
    };
  }

  it("should return the right category", async () => {
    expect(
      await classifySite(
        "https://hostnameandparams.com?param1=val1",
        RemoteSettings
      )
    ).toEqual("hostname-and-params-match");
    expect(
      await classifySite(
        "https://hostnameandparams.com?param1=val",
        RemoteSettings
      )
    ).toEqual("other");
    expect(
      await classifySite(
        "https://hostnameandparams.com?param=val1",
        RemoteSettings
      )
    ).toEqual("other");
    expect(
      await classifySite("https://hostnameandparams.com", RemoteSettings)
    ).toEqual("other");
    expect(
      await classifySite("https://params.com?param1=val1", RemoteSettings)
    ).toEqual("other");

    expect(
      await classifySite("https://fullurl.com/must/match", RemoteSettings)
    ).toEqual("url-match");
    expect(
      // eslint-disable-next-line sdl/no-insecure-url
      await classifySite("http://fullurl.com/must/match", RemoteSettings)
    ).toEqual("other");

    expect(
      await classifySite(
        "https://example.com?param1=val1&param2=val2",
        RemoteSettings
      )
    ).toEqual("params-match");
    expect(
      await classifySite(
        "https://example.com?param1=val1&param2=val2&other=other",
        RemoteSettings
      )
    ).toEqual("params-match");
    expect(
      await classifySite(
        "https://example.com?param1=val2&param2=val1",
        RemoteSettings
      )
    ).toEqual("other");
    expect(
      await classifySite("https://example.com?param1&param2", RemoteSettings)
    ).toEqual("other");

    expect(
      await classifySite("https://search.com?client=firefox", RemoteSettings)
    ).toEqual("params-prefix-match");
    expect(
      await classifySite("https://search.com?client=fir", RemoteSettings)
    ).toEqual("params-prefix-match");
    expect(
      await classifySite(
        "https://search.com?client=mozillafirefox",
        RemoteSettings
      )
    ).toEqual("other");

    expect(
      await classifySite(
        "https://example.com?has-param1=val1&has-param2=val2",
        RemoteSettings
      )
    ).toEqual("has-params");
    expect(
      await classifySite(
        "https://example.com?has-param1&has-param2",
        RemoteSettings
      )
    ).toEqual("has-params");
    expect(
      await classifySite(
        "https://example.com?has-param1&has-param2&other=other",
        RemoteSettings
      )
    ).toEqual("has-params");
    expect(
      await classifySite("https://example.com?has-param1", RemoteSettings)
    ).toEqual("other");
    expect(
      await classifySite("https://example.com?has-param2", RemoteSettings)
    ).toEqual("other");

    expect(await classifySite("https://google.com", RemoteSettings)).toEqual(
      "search-engine"
    );
    expect(await classifySite("https://google.de", RemoteSettings)).toEqual(
      "search-engine"
    );
    expect(
      // eslint-disable-next-line sdl/no-insecure-url
      await classifySite("http://bing.com/?q=firefox", RemoteSettings)
    ).toEqual("search-engine");

    expect(await classifySite("https://yahoo.com", RemoteSettings)).toEqual(
      "news-portal"
    );

    expect(
      // eslint-disable-next-line sdl/no-insecure-url
      await classifySite("http://twitter.com/firefox", RemoteSettings)
    ).toEqual("social-media");

    expect(await classifySite("https://amazon.com", RemoteSettings)).toEqual(
      "ecommerce"
    );
    expect(await classifySite("https://amazon.ca", RemoteSettings)).toEqual(
      "ecommerce"
    );
    expect(await classifySite("https://ebay.com", RemoteSettings)).toEqual(
      "ecommerce"
    );
  });
});
