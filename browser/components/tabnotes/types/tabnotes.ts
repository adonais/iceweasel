/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

type MozTabbrowserTab = EventTarget & { canonicalUrl: string };

type CanonicalURLSource = "link" | "opengraph" | "jsonLd" | "fallback";
type CanonicalURLSourceResults = {
  [source in CanonicalURLSource]: string | null;
};

interface CanonicalURLIdentifiedEvent {
  type: "CanonicalURL:Identified";
  target: MozBrowser;
  detail: {
    canonicalUrl: string;
    canonicalUrlSources: CanonicalURLSource[];
  };
}

interface TabNoteRecord {
  id: number;
  canonicalUrl: string;
  created: Temporal.Instant;
  text: string;
}

interface TabNoteCreatedEvent extends CustomEvent {
  type: "TabNote:Created";
  target: MozTabbrowserTab;
  detail: {
    note: TabNoteRecord;
    telemetrySource?: TabNoteTelemetrySource;
  };
}

interface TabNoteEditedEvent extends CustomEvent {
  type: "TabNote:Edited";
  target: MozTabbrowserTab;
  detail: {
    note: TabNoteRecord;
    telemetrySource?: TabNoteTelemetrySource;
  };
}

interface TabNoteRemovedEvent extends CustomEvent {
  type: "TabNote:Removed";
  target: MozTabbrowserTab;
  detail: {
    note: TabNoteRecord;
    telemetrySource?: TabNoteTelemetrySource;
  };
}

type TabbrowserWebProgressListener<
  ListenerName extends keyof nsIWebProgressListener,
  F = nsIWebProgressListener[ListenerName],
> = F extends (...args: any) => any
  ? (aBrowser: MozBrowser, ...rest: Parameters<F>) => ReturnType<F>
  : never;

/**
 * Constant values used to record the UI surface when a user interacted
 * with tab notes.
 */
type TabNoteTelemetrySource =
  | "context_menu" // tab context menu
  | "hover_menu"; // tab hover preview panel
