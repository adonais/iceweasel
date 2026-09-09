/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var StatusPanel = {
  // This is useful for debugging (set to `true` in the interesting state for
  // the panel to remain in that state).
  _frozen: false,

  get panel() {
    delete this.panel;
    this.panel = document.getElementById("statuspanel");
    this.panel.addEventListener(
      "transitionend",
      this._onTransitionEnd.bind(this)
    );
    this.panel.addEventListener(
      "transitioncancel",
      this._onTransitionEnd.bind(this)
    );
    return this.panel;
  },

  get isVisible() {
    return !this.panel.hasAttribute("inactive");
  },

  update() {
    if (BrowserHandler.kiosk || this._frozen) {
      return;
    }
    let text;
    let type;
    let types = ["overLink"];
    if (XULBrowserWindow.busyUI) {
      types.push("status");
    }
    types.push("defaultStatus");
    for (type of types) {
      if ((text = XULBrowserWindow[type])) {
        break;
      }
    }

    // If it's a long data: URI that uses base64 encoding, truncate to
    // a reasonable length rather than trying to display the entire thing.
    // We can't shorten arbitrary URIs like this, as bidi etc might mean
    // we need the trailing characters for display. But a base64-encoded
    // data-URI is plain ASCII, so this is OK for status panel display.
    // (See bug 1484071.)
    let textCropped = false;
    if (text.length > 500 && text.match(/^data:[^,]+;base64,/)) {
      text = text.substring(0, 500) + "\u2026";
      textCropped = true;
    }

    if (this._labelElement.value != text || (text && !this.isVisible)) {
      this.panel.setAttribute("previoustype", this.panel.getAttribute("type"));
      this.panel.setAttribute("type", type);

      this._label = text;
      this._labelElement.setAttribute(
        "crop",
        type == "overLink" && !textCropped ? "center" : "end"
      );
    }
  },

  get _labelElement() {
    delete this._labelElement;
    return (this._labelElement = document.getElementById("statuspanel-label"));
  },

  set _label(val) {
    if (!this.isVisible) {
      this.panel.removeAttribute("mirror");
      this.panel.removeAttribute("sizelimit");
    }

    if (
      this.panel.getAttribute("type") == "status" &&
      this.panel.getAttribute("previoustype") == "status"
    ) {
      // Before updating the label, set the panel's current width as its
      // min-width to let the panel grow but not shrink and prevent
      // unnecessary flicker while loading pages. We only care about the
      // panel's width once it has been painted, so we can do this
      // without flushing layout.
      this.panel.style.minWidth =
        window.windowUtils.getBoundsWithoutFlushing(this.panel).width + "px";
    } else {
      this.panel.style.minWidth = "";
    }

    if (val) {
      this._labelElement.value = val;
      if (this.panel.hidden) {
        this.panel.hidden = false;
        // This ensures that the "inactive" attribute removal triggers a
        // transition.
        getComputedStyle(this.panel).display;
      }
      this.panel.removeAttribute("inactive");
      MousePosTracker.addListener(this);
    } else {
      this.panel.setAttribute("inactive", "true");
      MousePosTracker.removeListener(this);
    }
  },

  _onTransitionEnd() {
    if (!this.isVisible) {
      this.panel.hidden = true;
    }
  },

  getMouseTargetRect() {
    let container = this.panel.parentNode;
    let panelRect = window.windowUtils.getBoundsWithoutFlushing(this.panel);
    let containerRect = window.windowUtils.getBoundsWithoutFlushing(container);

    return {
      top: panelRect.top,
      bottom: panelRect.bottom,
      left: RTL_UI ? containerRect.right - panelRect.width : containerRect.left,
      right: RTL_UI
        ? containerRect.right
        : containerRect.left + panelRect.width,
    };
  },

  onMouseEnter() {
    this._mirror();
  },

  onMouseLeave() {
    this._mirror();
  },

  _mirror() {
    if (this._frozen) {
      return;
    }
    if (this.panel.hasAttribute("mirror")) {
      this.panel.removeAttribute("mirror");
    } else {
      this.panel.setAttribute("mirror", "true");
    }

    if (!this.panel.hasAttribute("sizelimit")) {
      this.panel.setAttribute("sizelimit", "true");
    }
  },
};
