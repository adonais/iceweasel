/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Arranges the items of one or more related `<menupopup>`s into a declared
 * order. The layout maps a popup id to a list of named sections; each section
 * lists the items it contains, in order, by CSS selector. The same grammar is
 * used at every level, so a submenu is described exactly like the top-level
 * menu.
 *
 * Each selector is resolved anywhere under the root popup and the matched node
 * is moved into the popup that declares it. Because resolution spans the whole
 * subtree, one descriptor can both reorder a popup's own children and relocate
 * items between popups (e.g. flatten a nested submenu's entries up into a
 * sibling). It only moves nodes that already exist (it never creates, removes,
 * or relabels them), so element identity, ids, attributes and event listeners
 * are preserved.
 *
 * A descriptor is expected to be complete over the popups it manages: every
 * non-dynamic child of a managed popup must be claimed by some section, or
 * arrange() throws and leaves the menu untouched. This makes drifting config
 * or markup fail loudly. It also makes re-applying a descriptor idempotent and
 * reversible: applying it from any prior state (e.g. after a different mode's
 * descriptor moved nodes elsewhere) restores the declared structure.
 *
 * An item entry may be:
 *   - a single selector string;
 *   - an array of selectors that should stay contiguous as a unit (e.g.
 *     mutually-exclusive twins like pin/unpin that occupy one logical position
 *     regardless of which one is visible); or
 *   - `{ selector, optional: true }` for an item that may be absent (e.g. a
 *     share submenu created lazily on `popupshowing`). An optional item is
 *     positioned when present and skipped when absent.
 *
 * Runtime-inserted items (e.g. one menuitem per tab group or profile) are
 * positioned against their anchor separators by their own code, not by the
 * layout. Pass their selectors as `dynamicItemSelectors` so they are exempt
 * from the full-coverage check.
 *
 * A section may set `open: true` to mark its popup as accepting a trailing run
 * of items managed outside the layout (e.g. WebExtension menu items appended to
 * the end of the tab context menu). Children after the last placed item are then
 * exempt from coverage, and the declared items are committed ahead of them so
 * they remain at the end. Items before the last placed item still fail coverage.
 *
 * @typedef {string | string[] | {selector: string, optional?: boolean}} MenuItemPlacement
 * @typedef {{ name: string, items: MenuItemPlacement[], open?: boolean }} MenuSection
 * @typedef {{[popupId: string]: MenuSection[]}} MenuLayout
 *   Maps a popup id to its sections, in order. The root popup passed to
 *   arrange() is keyed by its own id; other popups are resolved by id within
 *   the root's subtree.
 */
export class MenuSectionLayout {
  /**
   * @param {MenuLayout} layout
   *   Maps each managed popup id to its sections.
   * @param {object} [options]
   * @param {string[]} [options.dynamicItemSelectors]
   *   Selectors matching runtime-inserted items, exempt from the coverage check.
   */
  constructor(layout, { dynamicItemSelectors = [] } = {}) {
    this.layout = layout;
    this.dynamicItemSelectors = dynamicItemSelectors;
  }

  /**
   * Normalized placements for one popup's sections, in order. A bare string or
   * a member of a twin array is required; an object entry may set
   * `optional: true`.
   *
   * @param {MenuSection[]} sections
   * @returns {{selector: string, optional: boolean}[]}
   */
  static placementsFor(sections) {
    let result = [];
    for (let section of sections) {
      for (let entry of section.items) {
        if (typeof entry === "string") {
          result.push({ selector: entry, optional: false });
        } else if (Array.isArray(entry)) {
          for (let selector of entry) {
            result.push({ selector, optional: false });
          }
        } else {
          result.push({
            selector: entry.selector,
            optional: entry.optional === true,
          });
        }
      }
    }
    return result;
  }

  /**
   * Move every managed popup's items into it, in declared order.
   *
   * @param {Element} rootPopup
   *   The top-level `<menupopup>`. Other managed popups are resolved by id
   *   within its subtree, and selectors are matched anywhere under it.
   */
  arrange(rootPopup) {
    if (!rootPopup) {
      throw new Error("MenuSectionLayout: rootPopup is required");
    }

    // Resolve each managed popup id to its element.
    let popups = new Map();
    for (let popupId of Object.keys(this.layout)) {
      let popup =
        rootPopup.id === popupId
          ? rootPopup
          : rootPopup.querySelector(`#${popupId}`);
      if (!popup) {
        throw new Error(
          `MenuSectionLayout: no popup "#${popupId}" under #${rootPopup.id}`
        );
      }
      popups.set(popupId, popup);
    }

    // Resolve placements to nodes (found anywhere under rootPopup) and record
    // the ordered node list per popup. Resolve everything before moving so the
    // matches reflect the pristine DOM, and a single claimed set forbids
    // double-claims across popups.
    let claimed = new Set();
    let orderedByPopup = new Map();

    for (let [popupId, sections] of Object.entries(this.layout)) {
      let ordered = [];
      for (let { selector, optional } of MenuSectionLayout.placementsFor(
        sections
      )) {
        let matches = [...rootPopup.querySelectorAll(selector)].filter(
          node => !claimed.has(node)
        );
        if (!matches.length) {
          if (optional) {
            continue;
          }
          throw new Error(
            `MenuSectionLayout: no unclaimed node matching "${selector}" under #${rootPopup.id}`
          );
        }
        if (matches.length > 1) {
          throw new Error(
            `MenuSectionLayout: "${selector}" matches ${matches.length} nodes under #${rootPopup.id}; selectors must be unique`
          );
        }
        claimed.add(matches[0]);
        ordered.push(matches[0]);
      }
      orderedByPopup.set(popupId, ordered);
    }

    // A popup with an `open` section accepts a trailing run of externally
    // managed items (e.g. WebExtension menu items appended to the end of the
    // tab context menu). Those are exempt from coverage; items that fall before
    // the last placed item still fail loudly, so a forgotten entry in the middle
    // is caught.
    let openPopups = new Set(
      Object.entries(this.layout)
        .filter(([, sections]) => sections.some(section => section.open))
        .map(([popupId]) => popupId)
    );

    // Full coverage: every non-dynamic child of a managed popup must be claimed,
    // or it would be silently left behind.
    for (let [popupId, popup] of popups) {
      let children = [...popup.children];
      let lastPlaced = children.reduce(
        (last, node, index) => (claimed.has(node) ? index : last),
        -1
      );
      let unplaced = children.filter(
        (node, index) =>
          !claimed.has(node) &&
          !this.dynamicItemSelectors.some(sel => node.matches(sel)) &&
          !(openPopups.has(popupId) && index > lastPlaced)
      );
      if (unplaced.length) {
        let names = unplaced
          .map(node => (node.id ? "#" + node.id : node.localName))
          .join(", ");
        throw new Error(
          `MenuSectionLayout: ${unplaced.length} child(ren) of #${popupId} not placed by any section: ${names}`
        );
      }
    }

    // Commit: insert each popup's nodes, in order, ahead of any remaining
    // children. This moves a node out of its current parent (possibly another
    // managed popup); since every node is claimed exactly once, the end state is
    // each popup holding its declared nodes in order regardless of commit order.
    // Inserting at the front (rather than appending) keeps externally managed
    // trailing items (open section) and runtime-inserted items after the
    // declared skeleton.
    for (let [popupId, ordered] of orderedByPopup) {
      let popup = popups.get(popupId);
      let fragment = popup.ownerDocument.createDocumentFragment();
      for (let node of ordered) {
        fragment.appendChild(node);
      }
      popup.insertBefore(fragment, popup.firstChild);
    }
  }
}
