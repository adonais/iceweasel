/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { countryName } from "chrome://browser/content/ipprotection/ipprotection-utils.mjs";

/**
 * A custom element that renders the single-select list of egress locations.
 */
export default class LocationsList extends MozLitElement {
  static properties = {
    locations: { type: Array },
    selectedLocation: { type: String, state: true },
    focusedLocation: { type: String, state: true },
    premium: { type: Boolean },
  };

  static defaultLocation = "REC";

  static collator = new Intl.Collator(undefined, { sensitivity: "base" });

  get #sortedLocations() {
    let locations = Array.from(this.locations ?? []);
    if (!this.premium) {
      locations = locations.filter(aLocation => !aLocation.locked);
    }
    return locations.sort((a, b) => {
      const nameA = countryName(a.code) ?? a.code;
      const nameB = countryName(b.code) ?? b.code;
      return LocationsList.collator.compare(nameA, nameB);
    });
  }

  /**
   * The full list of options in render order: the recommended option followed
   * by the sorted, filtered locations.
   */
  get #renderedLocations() {
    const recommendedLocation = {
      code: LocationsList.defaultLocation,
      available: true,
    };
    return [recommendedLocation, ...this.#sortedLocations];
  }

  /**
   * The country code of the option that should be the list's single tab stop.
   *
   * Implements roving tabindex: the tab stop starts on the selected option
   * every time the subview is shown, then follows whichever option the user
   * focuses while the subview stays open.
   *
   * @returns {string}
   */
  #focusableLocation() {
    const hasFocusedLocation = this.#renderedLocations.some(
      aLocation => aLocation.code === this.focusedLocation
    );
    return hasFocusedLocation
      ? this.focusedLocation
      : this.getSelectedLocation();
  }

  constructor() {
    super();
    this.selectedLocation = "";
    this.focusedLocation = "";
    this.locations = [];
    this.premium = false;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // PanelMultiView moves the subview between its view stacks, which reconnects
    // this element every time the subview is shown. Clear the focused option so
    // the roving tabindex resets to the selected option on each showing.
    if (this.focusedLocation) {
      this.focusedLocation = "";
    }
  }

  getSelectedLocation() {
    const selected = this.locations?.find(
      l => l.code === this.selectedLocation
    );
    if (
      !this.selectedLocation ||
      (this.selectedLocation !== LocationsList.defaultLocation && !selected) ||
      (selected?.locked && !this.premium)
    ) {
      return LocationsList.defaultLocation;
    }
    return this.selectedLocation;
  }

  handleSelectLocation(selectedLocation) {
    if (
      this.selectedLocation === selectedLocation.code ||
      !selectedLocation.available
    ) {
      return;
    }
    this.selectedLocation = selectedLocation.code;
    this.dispatchEvent(
      new CustomEvent("IPProtection:UserSelectLocation", {
        bubbles: true,
        composed: true,
        detail: { code: selectedLocation.code },
      })
    );
  }

  #handleOptionKeydown(event, aLocation) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.handleSelectLocation(aLocation);
    }
  }

  #handleOptionFocus(aLocation) {
    this.focusedLocation = aLocation.code;
  }

  #locationRow(aLocation, tabStopCode) {
    const isSelected = aLocation.code === this.getSelectedLocation();
    const isTabStop = aLocation.code === tabStopCode;
    // Use aria-disabled instead of the native disabled attribute so that unavailable locations can be reached by keyboard
    // and announced by screen readers. Roving tabindex keeps the list a single tab stop: tabindex starts on the selected
    // option each time the subview is shown and then follows the focused option. Arrow-key navigation between options is
    // handled by the panel's locations key listener.
    return html`
      <li
        class="location-item subviewbutton"
        role="option"
        id="location-option-${aLocation.code}"
        aria-selected=${isSelected ? "true" : "false"}
        tabindex=${isTabStop ? "0" : "-1"}
        @click=${() => this.handleSelectLocation(aLocation)}
        @keydown=${e => this.#handleOptionKeydown(e, aLocation)}
        @focus=${() => this.#handleOptionFocus(aLocation)}
        ?aria-disabled=${!aLocation.available}
      >
        <img
          class="location-check"
          src="chrome://global/skin/icons/check.svg"
          aria-hidden="true"
        />
        <span class="location-label-group">
          ${aLocation.code === LocationsList.defaultLocation
            ? html`<span
                  id="location-label-recommended"
                  class="location-label"
                  data-l10n-id="ipprotecion-locations-subview-recommended-label"
                ></span>
                <span
                  class="location-description"
                  data-l10n-id="ipprotection-locations-subview-recommended-description"
                ></span>`
            : html`<span class="location-label"
                >${countryName(aLocation.code)}</span
              >`}
        </span>
        ${!aLocation.available
          ? html`
              <span
                class="location-unavailable-label"
                data-l10n-id="ipprotection-locations-unavailable-label-1"
              ></span>
            `
          : null}
      </li>
    `;
  }

  render() {
    const tabStopCode = this.#focusableLocation();

    return html`
      <div id="locations-list-wrapper">
        <span
          id="locations-list-description"
          data-l10n-id="ipprotection-locations-subview-description"
        ></span>
        <ul
          id="locations-list"
          role="listbox"
          aria-labelledby="locations-list-description"
        >
          ${this.#renderedLocations.map(aLocation =>
            this.#locationRow(aLocation, tabStopCode)
          )}
        </ul>
      </div>
    `;
  }
}

customElements.define("locations-list", LocationsList);
