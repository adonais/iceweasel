/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getNotificationIdsForUrl,
  isWebNotificationsEnabled,
  notificationKeyForUrl,
  originFromUrl,
} from "content-src/lib/web-notification-match.mjs";

describe("web-notification-match", () => {
  describe("originFromUrl", () => {
    it("returns the http(s) origin", () => {
      expect(originFromUrl("https://mail.google.com/mail/u/0")).toBe(
        "https://mail.google.com"
      );
    });
    it("returns null for non-http(s) schemes", () => {
      expect(originFromUrl("about:newtab")).toBeNull();
      expect(originFromUrl("chrome://browser/content")).toBeNull();
    });
    it("returns null for malformed input", () => {
      expect(originFromUrl("not a url")).toBeNull();
    });
  });

  describe("notificationKeyForUrl", () => {
    it("redirects a known apex to its app origin", () => {
      expect(notificationKeyForUrl("https://gmail.com")).toBe(
        "https://mail.google.com"
      );
      expect(notificationKeyForUrl("https://www.slack.com/")).toBe(
        "https://app.slack.com"
      );
    });
    it("passes unknown origins through unchanged", () => {
      expect(notificationKeyForUrl("https://example.com/x")).toBe(
        "https://example.com"
      );
    });
    it("does not merge sibling subdomains onto one key", () => {
      expect(notificationKeyForUrl("https://calendar.google.com")).toBe(
        "https://calendar.google.com"
      );
    });
    it("returns null for non-http(s) urls", () => {
      expect(notificationKeyForUrl("about:blank")).toBeNull();
    });
  });

  describe("getNotificationIdsForUrl", () => {
    const state = {
      WebNotifications: {
        byOrigin: {
          "https://mail.google.com": ["a", "b"],
          "https://example.com": ["c"],
        },
      },
    };
    it("resolves ids through the apex alias", () => {
      expect(getNotificationIdsForUrl(state, "https://gmail.com")).toEqual([
        "a",
        "b",
      ]);
    });
    it("resolves ids for an exact origin", () => {
      expect(
        getNotificationIdsForUrl(state, "https://example.com/path")
      ).toEqual(["c"]);
    });
    it("returns a stable empty array for an unmatched url", () => {
      const first = getNotificationIdsForUrl(state, "https://nobody.example");
      expect(first).toEqual([]);
      expect(first).toBe(
        getNotificationIdsForUrl(state, "https://other.example")
      );
    });
    it("returns empty for a non-http(s) url", () => {
      expect(getNotificationIdsForUrl(state, "about:newtab")).toEqual([]);
    });
  });

  describe("isWebNotificationsEnabled", () => {
    const stateWith = values => ({ Prefs: { values } });

    it("is enabled when the system and user prefs are set", () => {
      expect(
        isWebNotificationsEnabled(
          stateWith({
            "system.showWebNotifications": true,
            showWebNotifications: true,
          })
        )
      ).toBe(true);
    });

    it("is enabled via trainhop with the system pref off", () => {
      expect(
        isWebNotificationsEnabled(
          stateWith({
            "system.showWebNotifications": false,
            showWebNotifications: true,
            trainhopConfig: { webNotifications: { enabled: true } },
          })
        )
      ).toBe(true);
    });

    it("is disabled when the user pref is off even if trainhop enables it", () => {
      expect(
        isWebNotificationsEnabled(
          stateWith({
            "system.showWebNotifications": false,
            showWebNotifications: false,
            trainhopConfig: { webNotifications: { enabled: true } },
          })
        )
      ).toBe(false);
    });

    it("is disabled when neither the system pref nor trainhop enable it", () => {
      expect(
        isWebNotificationsEnabled(
          stateWith({
            "system.showWebNotifications": false,
            showWebNotifications: true,
          })
        )
      ).toBe(false);
    });
  });
});
