/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* import-globals-from head.js */

const PAGE_CONFIG = {
  component: "Page",
  children: [
    {
      id: "hdr",
      component: "Header",
      eyebrow: "From your open tabs",
      title: "Hotels in Lisbon",
      subhead: "4 options gathered from your open tabs",
    },
    {
      id: "note",
      component: "TextBlock",
      lead: "What you are comparing",
      paragraphs: [],
    },
    { id: "plan", component: "Timeline", title: "Booking plan", items: [] },
    { id: "unknown", component: "NotAComponent", title: "Unknown component" },
    { id: "untyped", title: "A block with no component" },
  ],
};
