/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Global browser interface with graphics utilities.
 */
var gGfxUtils = {
  _isRecording: false,
  _isTransactionLogging: false,
  _isCapturingFrames: false,

  init() {
    if (Services.prefs.getBoolPref("gfx.webrender.debug.enable-capture")) {
      this.registerCaptureShortcuts();
    }
  },

  /**
   * Registers the keyboard shortcuts triggering WebRender captures. This is only
   * done when captures are enabled: as long as a key element exists, the
   * shortcut counts as a system shortcut and can't be assigned to anything else
   * (a WebExtension command for example), even if the command it is bound to is
   * disabled.
   */
  registerCaptureShortcuts() {
    // A key element only takes effect if it is added to the document as part of
    // a keyset, since the handlers of a keyset are built when it is inserted.
    let keyset = document.createXULElement("keyset");
    keyset.id = "gfxDebugKeyset";

    for (let [command, macKey, key] of [
      ["wrCaptureCmd", "3", "#"],
      ["wrToggleCaptureSequenceCmd", "6", "^"],
    ]) {
      let keyElement = document.createXULElement("key");
      keyElement.id = `key_${command}`;
      keyElement.setAttribute("command", command);
      if (AppConstants.platform == "macosx") {
        keyElement.setAttribute("key", macKey);
        keyElement.setAttribute("modifiers", "control,shift");
      } else {
        keyElement.setAttribute("key", key);
        keyElement.setAttribute("modifiers", "control");
      }
      keyset.appendChild(keyElement);
    }

    document.documentElement.appendChild(keyset);
  },

  /**
   * Toggle composition recording for the current window.
   */
  toggleWindowRecording() {
    window.windowUtils.setCompositionRecording(!this._isRecording);
    this._isRecording = !this._isRecording;
  },
  /**
   * Trigger a WebRender capture of the current state into a local folder.
   */
  webrenderCapture() {
    window.windowUtils.wrCapture();
  },

  captureSequencePath: "wr-capture-sequence",
  captureSequenceFlags:
    window.windowUtils.WR_CAPTURE_SCENE |
    window.windowUtils.WR_CAPTURE_EXTERNALS,

  /**
   * Trigger a WebRender capture of the current state and future state
   * into a local folder. If called again, it will stop capturing.
   */
  toggleWebrenderCaptureSequence() {
    this._isCapturingFrames = !this._isCapturingFrames;
    if (this._isCapturingFrames) {
      window.windowUtils.wrStartCaptureSequence(
        this.captureSequencePath,
        this.captureSequenceFlags
      );
    } else {
      window.windowUtils.wrStopCaptureSequence();
    }
  },
};
