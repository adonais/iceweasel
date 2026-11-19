/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AsyncPrefs } from "resource://gre/modules/AsyncPrefs.sys.mjs";
import { Narrator } from "resource://gre/modules/narrate/Narrator.sys.mjs";
import { VoiceSelect } from "resource://gre/modules/narrate/VoiceSelect.sys.mjs";

const NARRATE_SHORTCUT = "N";
// Arrow direction also hardcoded for RTL in order to be
// consistent with playback arrows in UI panel
const SKIP_PREVIOUS_SHORTCUT = "←";
const SKIP_NEXT_SHORTCUT = "→";

export function NarrateControls(win, languagePromise) {
  this._winRef = Cu.getWeakReference(win);
  this._languagePromise = languagePromise;

  win.addEventListener("unload", this);

  // Append content style sheet in document head
  let style = win.document.createElement("link");
  style.rel = "stylesheet";
  style.href = "chrome://global/skin/narrate.css";
  win.document.head.appendChild(style);

  let dropdown = win.document.createElement("ul");
  dropdown.className = "dropdown narrate-dropdown";

  let toggle = win.document.createElement("li");
  let toggleButton = win.document.createElement("button");
  toggleButton.className = "dropdown-toggle toolbar-button narrate-toggle";
  toggleButton.dataset.telemetryId = "reader-listen";
  toggleButton.setAttribute("aria-labelledby", "narrate-toggle-label");
  let tip = win.document.createElement("span");
  tip.className = "hover-label";
  tip.id = "narrate-toggle-label";
  win.document.l10n.setAttributes(tip, "narrate-toggle-label", {
    shortcut: NARRATE_SHORTCUT,
  });
  toggleButton.append(tip);
  toggleButton.hidden = true;
  dropdown.appendChild(toggle);
  toggle.appendChild(toggleButton);

  let dropdownList = win.document.createElement("li");
  dropdownList.className = "dropdown-popup";
  dropdown.appendChild(dropdownList);

  let narrateHeader = win.document.createElement("h2");
  narrateHeader.id = "narrate-header";
  win.document.l10n.setAttributes(narrateHeader, "narrate-header");
  dropdownList.appendChild(narrateHeader);

  let narrateControl = win.document.createElement("div");
  narrateControl.className = "narrate-row narrate-control";
  dropdownList.appendChild(narrateControl);

  let narrateRate = win.document.createElement("div");
  narrateRate.className = "narrate-row narrate-rate";
  dropdownList.appendChild(narrateRate);

  let hr = win.document.createElement("hr");
  let voiceHeader = win.document.createElement("h2");
  voiceHeader.id = "voice-header";
  win.document.l10n.setAttributes(voiceHeader, "narrate-voice-header");
  dropdownList.appendChild(hr);
  dropdownList.appendChild(voiceHeader);

  let narrateVoices = win.document.createElement("div");
  narrateVoices.className = "narrate-row narrate-voices";
  dropdownList.appendChild(narrateVoices);

  let narrateSkipPrevious = win.document.createElement("button");
  narrateSkipPrevious.className = "narrate-skip-previous";
  narrateSkipPrevious.disabled = true;
  narrateSkipPrevious.ariaKeyShortcuts = "ArrowLeft";
  win.document.l10n.setAttributes(
    narrateSkipPrevious,
    "narrate-skip-previous",
    {
      shortcut: SKIP_PREVIOUS_SHORTCUT,
    }
  );
  narrateControl.appendChild(narrateSkipPrevious);

  let narrateStartStop = win.document.createElement("button");
  narrateStartStop.className = "narrate-start-stop";
  narrateStartStop.ariaKeyShortcuts = NARRATE_SHORTCUT;
  win.document.l10n.setAttributes(narrateStartStop, "narrate-start", {
    shortcut: NARRATE_SHORTCUT,
  });
  narrateControl.appendChild(narrateStartStop);

  let narrateSkipNext = win.document.createElement("button");
  narrateSkipNext.className = "narrate-skip-next";
  narrateSkipNext.disabled = true;
  narrateSkipNext.ariaKeyShortcuts = "ArrowRight";
  win.document.l10n.setAttributes(narrateSkipNext, "narrate-skip-next", {
    shortcut: SKIP_NEXT_SHORTCUT,
  });
  narrateControl.appendChild(narrateSkipNext);

  win.document.addEventListener("keydown", function (event) {
    if (
      win.document.hasFocus() &&
      event.key === "n" &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      narrateStartStop.click();
    }
    //Arrow key direction also hardcoded for RTL in order to be
    //consistent with playback arrows in UI panel
    if (win.document.hasFocus() && event.key === "ArrowLeft") {
      narrateSkipPrevious.click();
    }
    if (win.document.hasFocus() && event.key === "ArrowRight") {
      narrateSkipNext.click();
    }
  });

  let narrateRateInput = win.document.createElement("input");
  narrateRateInput.className = "narrate-rate-input";
  narrateRateInput.setAttribute("value", "0");
  narrateRateInput.setAttribute("step", "5");
  narrateRateInput.setAttribute("max", "100");
  narrateRateInput.setAttribute("min", "-100");
  narrateRateInput.setAttribute("type", "range");
  win.document.l10n.setAttributes(narrateRateInput, "narrate-rate-input");

  let narrateRateSlowIcon = win.document.createElement("span");
  narrateRateSlowIcon.className = "narrate-rate-icon slow";
  win.document.l10n.setAttributes(narrateRateSlowIcon, "narrate-rate-slow");

  let narrateRateFastIcon = win.document.createElement("span");
  narrateRateFastIcon.className = "narrate-rate-icon fast";
  win.document.l10n.setAttributes(narrateRateFastIcon, "narrate-rate-fast");

  narrateRate.appendChild(narrateRateSlowIcon);
  narrateRate.appendChild(narrateRateInput);
  narrateRate.appendChild(narrateRateFastIcon);

  this.narrator = new Narrator(win, languagePromise);

  let branch = Services.prefs.getBranch("narrate.");
  this.voiceSelect = new VoiceSelect(win);
  this.voiceSelect.element.addEventListener("change", this);
  this.voiceSelect.element.classList.add("voice-select");
  this.voiceSelect.selectToggle.setAttribute("aria-labelledby", "voice-header");
  win.speechSynthesis.addEventListener("voiceschanged", this);
  dropdown
    .querySelector(".narrate-voices")
    .appendChild(this.voiceSelect.element);

  dropdown.addEventListener("click", this, true);
  dropdown.addEventListener("keydown", this, true);

  let rateRange = dropdown.querySelector(".narrate-rate > input");
  rateRange.addEventListener("change", this);

  // The rate is stored as an integer.
  rateRange.value = branch.getIntPref("rate");

  this._setupVoices();

  let tb = win.document.querySelector(".reader-controls");
  tb.appendChild(dropdown);
}

NarrateControls.prototype = {
  handleEvent(evt) {
    switch (evt.type) {
      case "change":
        if (evt.target.classList.contains("narrate-rate-input")) {
          this._onRateInput(evt);
        } else {
          this._onVoiceChange();
        }
        break;
      case "click":
        this._onButtonClick(evt);
        break;
      case "keydown": {
        let popup = this._doc.querySelector(
          ".narrate-dropdown > .dropdown-popup"
        );
        if (evt.key === "Tab" && popup.contains(evt.target)) {
          this._handleFocus(evt);
        }
        break;
      }
      case "voiceschanged":
        this._setupVoices();
        break;
      case "unload":
        this.narrator.stop();
        break;
    }
  },

  /**
   * Returns true if synth voices are available.
   */
  _setupVoices() {
    return this._languagePromise.then(async language => {
      let win = this._win;
      let voicePrefs = this._getVoicePref();
      let selectedVoice = voicePrefs[language || "default"];
      let comparer = new Services.intl.Collator().compare;
      let filter = !Services.prefs.getBoolPref("narrate.filter-voices");
      let voices = win.speechSynthesis.getVoices().filter(v => {
        return filter || !language || v.lang.split("-")[0] == language;
      });
      let [defaultLabel, ...voiceLabels] = await Promise.all([
        win.document.l10n.formatValue("narrate-voice-default"),
        ...voices.map(v => this._createVoiceLabel(v)),
      ]);
      let options = voices
        .map((v, i) => {
          return {
            label: voiceLabels[i],
            value: v.voiceURI,
            selected: selectedVoice == v.voiceURI,
          };
        })
        .sort((a, b) => comparer(a.label, b.label));

      this.voiceSelect.clear();
      if (options.length) {
        options.unshift({
          label: defaultLabel,
          value: "automatic",
          selected: selectedVoice == "automatic",
        });
        this.voiceSelect.addOptions(options);
      }

      let narrateToggle = win.document.querySelector(".narrate-toggle");
      // We disable this entire feature if there are no available voices.
      narrateToggle.hidden = !options.length;
    });
  },

  _getVoicePref() {
    let voicePref = Services.prefs.getCharPref("narrate.voice");
    try {
      return JSON.parse(voicePref);
    } catch (e) {
      return { default: voicePref };
    }
  },

  _onRateInput(evt) {
    AsyncPrefs.set("narrate.rate", parseInt(evt.target.value, 10));
    this.narrator.setRate(this._convertRate(evt.target.value));
  },

  _onVoiceChange() {
    let voice = this.voice;
    this.narrator.setVoice(voice);
    this._languagePromise.then(language => {
      if (language) {
        let voicePref = this._getVoicePref();
        voicePref[language || "default"] = voice;
        AsyncPrefs.set("narrate.voice", JSON.stringify(voicePref));
      }
    });
  },

  _onButtonClick(evt) {
    let classList = evt.target.classList;
    if (classList.contains("narrate-skip-previous")) {
      this.narrator.skipPrevious();
    } else if (classList.contains("narrate-skip-next")) {
      this.narrator.skipNext();
    } else if (classList.contains("narrate-start-stop")) {
      if (this.narrator.speaking) {
        this.narrator.stop();
      } else {
        this._updateSpeechControls(true);
        let options = { rate: this.rate, voice: this.voice };
        this.narrator
          .start(options)
          .catch(err => {
            console.error("Narrate failed:", err);
          })
          .then(() => {
            this._updateSpeechControls(false);
          });
      }
    }
  },

  _updateSpeechControls(speaking) {
    let dropdown = this._doc.querySelector(".narrate-dropdown");
    if (!dropdown) {
      // Elements got destroyed, but window lingers on for a bit.
      return;
    }

    dropdown.classList.toggle("keep-open", speaking);
    dropdown.classList.toggle("speaking", speaking);

    let startStopButton = this._doc.querySelector(".narrate-start-stop");
    let skipPreviousButton = this._doc.querySelector(".narrate-skip-previous");
    let skipNextButton = this._doc.querySelector(".narrate-skip-next");

    skipPreviousButton.disabled = !speaking;
    skipNextButton.disabled = !speaking;

    this._doc.l10n.setAttributes(
      startStopButton,
      speaking ? "narrate-stop" : "narrate-start",
      { shortcut: NARRATE_SHORTCUT }
    );
  },

  async _createVoiceLabel(voice) {
    // This is a highly imperfect method of making human-readable labels
    // for system voices. Because each platform has a different naming scheme
    // for voices, we use a different method for each platform.
    switch (Services.appinfo.OS) {
      case "WINNT":
        // On windows the language is included in the name, so just use the name
        return voice.name;
      case "Linux":
        // On Linux, the name is usually the unlocalized language name.
        // Use a localized language name, and have the language tag in
        // parenthisis. This is to avoid six languages called "English".
        return this._doc.l10n.formatValue("narrate-voice-label", {
          name: this._getLanguageName(voice.lang) || voice.name,
          language: voice.lang,
        });
      default:
        // On Mac the language is not included in the name, find a localized
        // language name or show the tag if none exists.
        // This is the ideal naming scheme so it is also the "default".
        return this._doc.l10n.formatValue("narrate-voice-label", {
          name: voice.name,
          language: this._getLanguageName(voice.lang) || voice.lang,
        });
    }
  },

  _getLanguageName(lang) {
    try {
      // This may throw if the lang can't be parsed.
      let langCode = new Services.intl.Locale(lang).language;

      return Services.intl.getLanguageDisplayNames(undefined, [langCode]);
    } catch {
      return "";
    }
  },

  _convertRate(rate) {
    // We need to convert a relative percentage value to a fraction rate value.
    // eg. -100 is half the speed, 100 is twice the speed in percentage,
    // 0.5 is half the speed and 2 is twice the speed in fractions.
    return Math.pow(Math.abs(rate / 100) + 1, rate < 0 ? -1 : 1);
  },

  get _win() {
    return this._winRef.get();
  },

  get _doc() {
    return this._win.document;
  },

  get rate() {
    return this._convertRate(
      this._doc.querySelector(".narrate-rate-input").value
    );
  },

  get voice() {
    return this.voiceSelect.value;
  },

  _handleFocus(e) {
    let classList = e.target.classList;
    let narrateDropdown = this._doc.querySelector(".narrate-dropdown");
    if (!e.shiftKey) {
      if (classList.contains("option") || classList.contains("select-toggle")) {
        e.preventDefault();
      } else {
        return;
      }
      if (narrateDropdown.classList.contains("speaking")) {
        let skipPrevious = this._doc.querySelector(".narrate-skip-previous");
        skipPrevious.focus();
      } else {
        let startStop = this._doc.querySelector(".narrate-start-stop");
        startStop.focus();
      }
    }
    let firstFocusableButton = narrateDropdown.querySelector("button:enabled");
    if (e.target === firstFocusableButton) {
      e.preventDefault();
      narrateDropdown.querySelector(".select-toggle").focus();
    }
  },
};
