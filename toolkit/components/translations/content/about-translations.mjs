/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The following globals are injected via the AboutTranslationsChild actor.
// about-translations.mjs is running in an unprivileged context, and these injected functions
// allow for the page to get access to additional privileged features.

/* global AT_getAppLocale, AT_getSupportedLanguages, AT_log, AT_getScriptDirection,
   AT_getDisplayName, AT_logError, AT_createTranslationsPort, AT_isHtmlTranslation,
   AT_isTranslationEngineSupported, AT_identifyLanguage, AT_openSupportPage, AT_telemetry */

import { Translator } from "chrome://global/content/translations/Translator.mjs";

/**
 * Allows tests to override the delay milliseconds so that they can run faster.
 */
window.DEBOUNCE_DELAY = 200;

/**
 * Limits how long the "text" parameter can be in the URL.
 */
const URL_MAX_TEXT_LENGTH = 5000;

/**
 * @typedef {import("../translations").LanguagePair} LanguagePair
 * @typedef {import("../translations").SupportedLanguages} SupportedLanguages
 */

class AboutTranslations {
  /**
   * The set of languages that are supported by the Translations feature.
   *
   * @type {SupportedLanguages}
   */
  #supportedLanguages;

  /**
   * A monotonically increasing number that represents a unique ID
   * for each translation request.
   *
   * @type {number}
   */
  #translationId = 0;

  /**
   * The previous source text that was translated.
   *
   * This is used to calculate the difference of lengths in the texts,
   * which informs whether we should display a translating placeholder.
   *
   * @type {string}
   */
  #previousSourceText = "";

  /**
   * The BCP-47 language tag of the currently detected language.
   *
   * Defaults to an empty string if the detect-language option is not selected,
   * or if the detector was not confident enough to determine a language tag.
   *
   * @type {string}
   */
  #detectedLanguage = "";

  /**
   * The translator for the current language pair.
   *
   * @type {null | Translator}
   */
  #translator = null;

  /**
   * The elements that comprise the about:translations UI.
   *
   * Use the {@link AboutTranslations#elements} getter to instantiate and retrieve them.
   *
   * @type {Record<string, Element>}
   */
  #lazyElements;

  /**
   * The localized placeholder text to display when translating.
   *
   * @type {string}
   */
  #translatingPlaceholderText;

  /**
   * A promise that resolves when the about:translations UI has successfully initialized,
   * or rejects if the UI failed to initialize.
   *
   * @type {PromiseWithResolvers}
   */
  #readyPromiseWithResolvers = Promise.withResolvers();

  /**
   * The orientation of the page's content.
   *
   * When the page orientation is horizontal the source and target text areas
   * are displayed side by side with the source text area at the inline start
   * and the target text area at the inline end.
   *
   * When the page orientation is vertical the source text area is displayed
   * above the target text area, independent of locale bidirectionality.
   *
   * When the page orientation is vertical, each text area spans the full width
   * of the content, and resizing the window width or changing the zoom level
   * must trigger text-area resizing, where as resizing the text areas is not
   * necessary for these scenarios when the page orientation is horizontal.
   *
   * @type {("vertical"|"horizontal")}
   */
  #pageOrientation = "horizontal";

  /**
   * A timeout id that gets set when a pending callback is scheduled
   * to synchronize the heights of the source and target text areas.
   *
   * This helps ensure that we do not make repeated calls to this function
   * that would cause unnecessary and excessive reflow.
   *
   * @type {number | null}
   */
  #synchronizeTextAreaHeightsTimeoutId = null;

  /**
   * Constructs a new {@link AboutTranslations} instance.
   *
   * @param {boolean} isTranslationsEngineSupported
   *        Whether the translations engine is supported by the current system.
   */
  constructor(isTranslationsEngineSupported) {
    AT_telemetry("onOpen", {
      maintainFlow: false,
    });

    if (!isTranslationsEngineSupported) {
      this.#readyPromiseWithResolvers.reject();
      this.#showUnsupportedInfoMessage();
      return;
    }

    this.#setup()
      .then(() => {
        this.#readyPromiseWithResolvers.resolve();
      })
      .catch(error => {
        AT_logError(error);
        this.#readyPromiseWithResolvers.reject(error);
        this.#showLanguageLoadErrorMessage();
      });
  }

  /**
   * Resolves when the about:translations page has successfully initialized.
   *
   * @returns {Promise<void>}
   */
  async ready() {
    await this.#readyPromiseWithResolvers.promise;
  }

  /**
   * Instantiates and returns the elements that comprise the UI.
   *
   * @returns {{
   *   mainUserInterface: HTMLElement,
   *   unsupportedInfoMessage: HTMLElement,
   *   languageLoadErrorMessage: HTMLElement,
   *   learnMoreLink: HTMLAnchorElement,
   *   detectLanguageOption: HTMLOptionElement,
   *   sourceLanguageSelector: HTMLSelectElement,
   *   targetLanguageSelector: HTMLSelectElement,
   *   swapLanguagesButton: HTMLElement,
   *   sourceTextArea: HTMLTextAreaElement,
   *   targetTextArea: HTMLTextAreaElement,
   * }}
   */
  get elements() {
    if (this.#lazyElements) {
      return this.#lazyElements;
    }

    this.#lazyElements = {
      mainUserInterface: /** @type {HTMLElement} */ (
        document.getElementById("about-translations-main-user-interface")
      ),
      unsupportedInfoMessage: /** @type {HTMLElement} */ (
        document.getElementById("about-translations-unsupported-info-message")
      ),
      languageLoadErrorMessage: /** @type {HTMLElement} */ (
        document.getElementById(
          "about-translations-language-load-error-message"
        )
      ),
      learnMoreLink: /** @type {HTMLAnchorElement} */ (
        document.getElementById("about-translations-learn-more-link")
      ),
      detectLanguageOption: /** @type {HTMLOptionElement} */ (
        document.getElementById("about-translations-detect-language-option")
      ),
      sourceLanguageSelector: /** @type {HTMLSelectElement} */ (
        document.getElementById("about-translations-source-select")
      ),
      targetLanguageSelector: /** @type {HTMLSelectElement} */ (
        document.getElementById("about-translations-target-select")
      ),
      swapLanguagesButton: /** @type {HTMLElement} */ (
        document.getElementById("about-translations-swap-languages-button")
      ),
      sourceTextArea: /** @type {HTMLTextAreaElement} */ (
        document.getElementById("about-translations-source-textarea")
      ),
      targetTextArea: /** @type {HTMLTextAreaElement} */ (
        document.getElementById("about-translations-target-textarea")
      ),
    };

    return this.#lazyElements;
  }

  /**
   * Sets the internal data member for which orientation the page is in.
   *
   * This information is important for performance regarding in which situations
   * we need to dynamically resize the <textarea> elements on the page.
   *
   * @returns {boolean} True if the page orientation changed, otherwise false.
   */
  #updatePageOrientation() {
    const orientationAtStart = this.#pageOrientation;

    // Keep this value up to date with the media query rule in about-translations.css
    this.#pageOrientation =
      window.innerWidth > 1200 ? "horizontal" : "vertical";

    const orientationChanged = orientationAtStart !== this.#pageOrientation;

    if (orientationChanged) {
      document.dispatchEvent(
        new CustomEvent("AboutTranslationsTest:PageOrientationChanged", {
          detail: { orientation: this.#pageOrientation },
        })
      );
    }

    return orientationChanged;
  }

  /**
   * An async setup function to initialize the about:translations page.
   *
   * Performs all initialization steps and finally reveals the main UI.
   */
  async #setup() {
    this.#initializeEventListeners();
    this.#updatePageOrientation();

    this.#translatingPlaceholderText = await document.l10n.formatValue(
      "about-translations-translating-message"
    );

    await this.#setupLanguageSelectors();
    await this.#updateUIFromURL();

    // Even though we just updated the UI from the URL, this will
    // clear any invalid parameters that may have been passed in the URL.
    this.#updateURLFromUI();

    this.#updateSourceScriptDirection();
    this.#updateTargetScriptDirection();

    this.#showMainUserInterface();
    this.#setInitialFocus();
  }

  /**
   * Populates the language selector elements with supported languages.
   *
   * This is a one-time operation performed during initialization.
   */
  async #populateLanguageSelectors() {
    this.#supportedLanguages = await AT_getSupportedLanguages();

    const { sourceLanguageSelector, targetLanguageSelector } = this.elements;

    for (const { langTagKey, displayName } of this.#supportedLanguages
      .sourceLanguages) {
      const option = document.createElement("option");
      option.value = langTagKey;
      option.text = displayName;
      sourceLanguageSelector.add(option);
    }

    for (const { langTagKey, displayName } of this.#supportedLanguages
      .targetLanguages) {
      const option = document.createElement("option");
      option.value = langTagKey;
      option.text = displayName;
      targetLanguageSelector.add(option);
    }
  }

  /**
   * Sets up the language selectors during initialization.
   */
  async #setupLanguageSelectors() {
    await this.#populateLanguageSelectors();

    const { sourceLanguageSelector, targetLanguageSelector } = this.elements;
    sourceLanguageSelector.disabled = false;
    targetLanguageSelector.disabled = false;
  }

  /**
   * Initializes all relevant event listeners for the UI elements.
   */
  #initializeEventListeners() {
    const {
      learnMoreLink,
      swapLanguagesButton,
      sourceLanguageSelector,
      targetLanguageSelector,
      sourceTextArea,
    } = this.elements;

    learnMoreLink.addEventListener("click", this);
    swapLanguagesButton.addEventListener("click", this);
    sourceLanguageSelector.addEventListener("input", this);
    targetLanguageSelector.addEventListener("input", this);
    sourceTextArea.addEventListener("input", this);
    window.addEventListener("resize", this);
    window.visualViewport.addEventListener("resize", this);
  }

  /**
   * The event handler for all UI interactions.
   *
   * @param {Event} event
   */
  handleEvent = ({ type, target }) => {
    const {
      learnMoreLink,
      swapLanguagesButton,
      sourceLanguageSelector,
      targetLanguageSelector,
      sourceTextArea,
    } = this.elements;

    switch (type) {
      case "click": {
        if (target.id === swapLanguagesButton.id) {
          this.#disableSwapLanguagesButton();

          this.#maybeSwapLanguages();
          this.#maybeRequestTranslation();
        } else if (target.id === learnMoreLink.id) {
          AT_openSupportPage();
        }

        break;
      }
      case "input": {
        const { id } = target;

        if (id === sourceLanguageSelector.id) {
          if (sourceLanguageSelector.value !== this.#detectedLanguage) {
            this.#resetDetectLanguageOptionText();
            this.#disableSwapLanguagesButton();
          } else {
            // The source-language selector was previously set to "detect", but was
            // explicitly changed to the detected language, so there is no action to take.
            this.#resetDetectLanguageOptionText();
            return;
          }
        }

        if (id === targetLanguageSelector.id) {
          this.#disableSwapLanguagesButton();
        }

        if (
          id === sourceLanguageSelector.id ||
          id === targetLanguageSelector.id ||
          id === sourceTextArea.id
        ) {
          this.#maybeRequestTranslation();
        }

        break;
      }
      case "resize": {
        if (target === window || target === window.visualViewport) {
          const orientationChanged = this.#updatePageOrientation();

          if (orientationChanged) {
            // The page orientation changed, so we need to update the text-area heights immediately.
            this.#ensureTextAreaHeightsMatch({ scheduleCallback: false });
          } else if (this.#pageOrientation === "vertical") {
            // Otherwise we only need to eventually update the text-area heights in vertical orientation.
            this.#ensureTextAreaHeightsMatch({ scheduleCallback: true });
          }
        }

        break;
      }
    }
  };

  /**
   * Shows the main UI and hides any stand-alone message bars.
   */
  #showMainUserInterface() {
    const {
      unsupportedInfoMessage,
      languageLoadErrorMessage,
      mainUserInterface,
    } = this.elements;

    unsupportedInfoMessage.style.display = "none";
    languageLoadErrorMessage.style.display = "none";

    mainUserInterface.style.display = "grid";
  }

  /**
   * Shows the message that translations are not supported in the current environment.
   */
  #showUnsupportedInfoMessage() {
    const {
      unsupportedInfoMessage,
      languageLoadErrorMessage,
      mainUserInterface,
    } = this.elements;

    mainUserInterface.style.display = "none";
    languageLoadErrorMessage.style.display = "none";

    unsupportedInfoMessage.style.display = "flex";
  }

  /**
   * Shows the message that the list of languages could not be loaded.
   */
  #showLanguageLoadErrorMessage() {
    const {
      unsupportedInfoMessage,
      languageLoadErrorMessage,
      mainUserInterface,
    } = this.elements;

    mainUserInterface.style.display = "none";
    unsupportedInfoMessage.style.display = "none";

    languageLoadErrorMessage.style.display = "flex";
  }

  /**
   * Returns the language pair formed by the values of the language selectors.
   * Returns null if one or more of the selectors has no selected value.
   *
   * @returns {null | LanguagePair}
   */
  #getSelectedLanguagePair() {
    const { sourceLanguageSelector, targetLanguageSelector } = this.elements;

    let selectedSourceLanguage;
    if (this.#isDetectLanguageSelected()) {
      selectedSourceLanguage = this.#detectedLanguage;
    } else {
      selectedSourceLanguage = sourceLanguageSelector.value;
    }

    const [sourceLanguage, sourceVariant] = selectedSourceLanguage.split(",");
    const [targetLanguage, targetVariant] =
      targetLanguageSelector.value.split(",");

    if (sourceLanguage === "" || targetLanguage === "") {
      // At least one selector is empty, so we cannot create a language pair.
      return null;
    }

    return {
      sourceLanguage,
      targetLanguage,
      sourceVariant,
      targetVariant,
    };
  }

  /**
   * Returns true if we do not yet support the detected language for Translations,
   * otherwise false.
   *
   * @returns {boolean}
   */
  #isDetectedLanguageUnsupported() {
    if (!this.#isDetectLanguageSelected()) {
      // The detect-language option is not selected so this is not relevant.
      return false;
    }

    return !this.elements.sourceLanguageSelector.querySelector(
      `[value^=${this.#detectedLanguage}]`
    );
  }

  /**
   * Returns true if the source-language selector is set to the detect-language
   * option, otherwise false.
   *
   * @returns {boolean}
   */
  #isDetectLanguageSelected() {
    return this.elements.sourceLanguageSelector.value === "detect";
  }

  /**
   * Updates the display value of the source-language selector with the identified
   * language of the source text, only if the source-language selector is set to
   * the detect-language option.
   */
  async #maybeUpdateDetectedSourceLanguage() {
    if (!this.#isDetectLanguageSelected()) {
      this.#resetDetectLanguageOptionText();
      return;
    }

    const detectedLanguage = await this.#identifySourceLanguage();
    if (!this.#isDetectLanguageSelected()) {
      this.#resetDetectLanguageOptionText();
      return;
    }

    const previousDetectedLanguage = this.#detectedLanguage;
    this.#detectedLanguage = detectedLanguage;

    const { sourceTextArea } = this.elements;

    if (detectedLanguage) {
      const displayName = await AT_getDisplayName(detectedLanguage);
      this.#populateDetectLanguageOption({ detectedLanguage, displayName });
      sourceTextArea.setAttribute(
        "dir",
        AT_getScriptDirection(detectedLanguage)
      );
    } else {
      this.#resetDetectLanguageOptionText();
      sourceTextArea.setAttribute(
        "dir",
        AT_getScriptDirection(AT_getAppLocale())
      );
    }

    if (previousDetectedLanguage !== detectedLanguage) {
      document.dispatchEvent(
        new CustomEvent("AboutTranslationsTest:DetectedLanguageUpdated", {
          detail: { language: detectedLanguage },
        })
      );
    }
  }

  /**
   * Sets the textContent of the about-translations-detect option in the
   * about-translations-source-select dropdown.
   *
   * Passing an empty display name will reset to the default string.
   * Passing a display name will set the text to the given language.
   *
   * @param {object} params
   * @param {string} params.detectedLanguage - The BCP-47 language tag of the detected language.
   * @param {string} params.displayName - The display name of the detected language.
   */
  #populateDetectLanguageOption({ detectedLanguage, displayName }) {
    const { detectLanguageOption } = this.elements;
    detectLanguageOption.setAttribute("language", detectedLanguage);
    document.l10n.setAttributes(
      detectLanguageOption,
      "about-translations-detect-language",
      { language: displayName }
    );
  }

  /**
   * Restores the detect-language option to its default value.
   */
  #resetDetectLanguageOptionText() {
    const { detectLanguageOption } = this.elements;
    this.#detectedLanguage = "";
    detectLanguageOption.removeAttribute("language");
    document.l10n.setAttributes(
      detectLanguageOption,
      "about-translations-detect-default"
    );
  }

  /**
   * Returns true if the source-language selector contains the given language,
   * otherwise false.
   *
   * @param {string} language - A BCP-47 language tag or prefix.
   * @returns {boolean}
   */
  #sourceSelectorHasLanguage(language) {
    return this.elements.sourceLanguageSelector.querySelector(
      `[value^=${language}]`
    );
  }

  /**
   * Returns true if the target-language selector contains the given language,
   * otherwise false.
   *
   * @param {string} language - A BCP-47 language tag or prefix.
   * @returns {boolean}
   */
  #targetSelectorHasLanguage(language) {
    return this.elements.targetLanguageSelector.querySelector(
      `[value^=${language}]`
    );
  }

  /**
   * Determines whether the currently selected source/target languages can be swapped.
   *
   * @returns {boolean}
   */
  #selectedLanguagePairIsSwappable() {
    const selectedLanguagePair = this.#getSelectedLanguagePair();
    return (
      // There is an actively selected language pair.
      selectedLanguagePair &&
      // The source and target languages are different languages.
      selectedLanguagePair.sourceLanguage !==
        selectedLanguagePair.targetLanguage &&
      // The source language list contains the currently selected target language.
      this.#sourceSelectorHasLanguage(selectedLanguagePair.targetLanguage) &&
      // The target language list contains the currently selected source language.
      this.#targetSelectorHasLanguage(selectedLanguagePair.sourceLanguage)
    );
  }

  /**
   * Disables the swap-languages button.
   */
  #disableSwapLanguagesButton() {
    const { swapLanguagesButton } = this.elements;
    if (swapLanguagesButton.disabled === true) {
      return;
    }

    swapLanguagesButton.disabled = true;
    document.dispatchEvent(
      new CustomEvent("AboutTranslationsTest:SwapLanguagesButtonDisabled")
    );
  }

  /**
   * Enables the swap-languages button.
   */
  #enableSwapLanguagesButton() {
    const { swapLanguagesButton } = this.elements;
    if (swapLanguagesButton.disabled === false) {
      return;
    }

    swapLanguagesButton.disabled = false;
    document.dispatchEvent(
      new CustomEvent("AboutTranslationsTest:SwapLanguagesButtonEnabled")
    );
  }

  /**
   * Updates the enabled state of the swap-languages button based on the current
   * values of the language selectors.
   */
  #updateSwapLanguagesButtonEnabledState() {
    if (this.#selectedLanguagePairIsSwappable()) {
      this.#enableSwapLanguagesButton();
    } else {
      this.#disableSwapLanguagesButton();
    }
  }

  /**
   * If the currently selected language pair is determined to be swappable,
   * swaps the active source language with the active target language,
   * and moves the translated output to be the new source text.
   */
  #maybeSwapLanguages() {
    if (!this.#selectedLanguagePairIsSwappable()) {
      return;
    }

    const {
      sourceLanguageSelector,
      targetLanguageSelector,
      sourceTextArea,
      targetTextArea,
    } = this.elements;

    const selectedLanguagePair = this.#getSelectedLanguagePair();

    sourceLanguageSelector.value = selectedLanguagePair.targetLanguage;
    targetLanguageSelector.value = selectedLanguagePair.sourceLanguage;
    sourceTextArea.value = targetTextArea.value;

    this.#updateSourceScriptDirection();
    this.#updateTargetScriptDirection();
    this.#ensureTextAreaHeightsMatch({ scheduleCallback: false });

    if (sourceTextArea.value) {
      this.#displayTranslatingPlaceholder();
    }

    // When swapping languages, the target language will become the source language,
    // therefore the "detect" option is guaranteed to not be selected, and we need
    // to ensure that we reset the option text back to the default in case the user
    // opens the source-text dropdown menu.
    this.#resetDetectLanguageOptionText();
  }

  /**
   * Attempts to identify the BCP-47 language tag of the source text.
   * Returns an empty string if no language could be identified.
   *
   * @returns {string} The BCP-47 language tag of the identified language.
   */
  async #identifySourceLanguage() {
    const sourceText = this.#getSourceText();
    if (!sourceText) {
      return "";
    }

    const { language, confident } = await AT_identifyLanguage(sourceText);
    if (!confident) {
      return "";
    }

    if (language === "zh") {
      // CLD2 detects simplified Chinese as "zh" and traditional Chinese as "zh-Hant".
      // But we need to be explicit about the script tag in both cases.
      return "zh-Hans";
    }

    return language;
  }

  /**
   * Returns the trimmed value of the source <textarea>.
   *
   * @returns {string}
   */
  #getSourceText() {
    return this.elements.sourceTextArea.value.trim();
  }

  /**
   * Sets the value of the source <textarea> and dispatches an input event.
   *
   * @param {string} value
   */
  #setSourceText(value) {
    const { sourceTextArea } = this.elements;

    sourceTextArea.value = value;
    sourceTextArea.dispatchEvent(new Event("input"));

    this.#updateSourceScriptDirection();
    this.#ensureTextAreaHeightsMatch({ scheduleCallback: false });
  }

  /**
   * Sets the value of the target <textarea>.
   *
   * @param {string} value
   */
  #setTargetText(value) {
    this.elements.targetTextArea.value = value;

    if (!value) {
      document.dispatchEvent(
        new CustomEvent("AboutTranslationsTest:ClearTargetText")
      );
    }

    this.#updateTargetScriptDirection();
    this.#ensureTextAreaHeightsMatch({ scheduleCallback: false });
  }

  /**
   * Displays the translating placeholder text if the conditions are correct to do so.
   * We do this when switching to a new language pair, when rebuilding the translator,
   * or if the text is long enough that translating may incur a significant wait time.
   */
  #maybeDisplayTranslatingPlaceholder() {
    const sourceText = this.#getSourceText();

    if (
      // We will need to request a new translator, which will take time.
      !this.#translatorMatchesSelectedLanguagePair() ||
      // The current translator matches, but we need to request a new port, which takes time.
      this.#translator?.portClosed ||
      // The source text is long enough to take noticeable time to translate,
      // and has changed enough from the previous source text to warrant a placeholder.
      (sourceText.length > 5000 &&
        Math.abs(sourceText.length - this.#previousSourceText.length) > 500)
    ) {
      this.#displayTranslatingPlaceholder();
    }

    this.#previousSourceText = sourceText;
  }

  /**
   * Shows the translating placeholder in the target textarea and disables
   * the swap-languages button while translation is in progress.
   */
  #displayTranslatingPlaceholder() {
    const { targetTextArea } = this.elements;

    this.#setTargetText(this.#translatingPlaceholderText);
    this.#disableSwapLanguagesButton();

    targetTextArea.setAttribute(
      "dir",
      AT_getScriptDirection(AT_getAppLocale())
    );

    document.dispatchEvent(
      new CustomEvent("AboutTranslationsTest:ShowTranslatingPlaceholder")
    );
  }

  /**
   * Returns true if the current {@link Translator} instance is sufficient
   * to translate the actively selected language pair, otherwise false.
   *
   * @returns {boolean}
   */
  #translatorMatchesSelectedLanguagePair() {
    if (!this.#translator) {
      // There is no active translator, therefore the language pair cannot match it.
      return false;
    }

    const selectedLanguagePair = this.#getSelectedLanguagePair();
    if (!selectedLanguagePair) {
      // No valid language pair is selected, therefore it cannot match the translator.
      return false;
    }

    return this.#translator.matchesLanguagePair(selectedLanguagePair);
  }

  /**
   * Sets the initial focus on the most appropriate UI element based on the context.
   */
  #setInitialFocus() {
    const { targetLanguageSelector, sourceTextArea } = this.elements;

    if (targetLanguageSelector.value === "") {
      targetLanguageSelector.focus();
    } else {
      sourceTextArea.focus();
    }
  }

  /**
   * Reads the current URL hash and updates the UI to reflect the parameters.
   * Invalid parameters are ignored.
   */
  async #updateUIFromURL() {
    const supportedLanguages = this.#supportedLanguages;
    const urlParams = new URLSearchParams(window.location.href.split("#")[1]);
    const sourceLanguage = urlParams.get("src");
    const targetLanguage = urlParams.get("trg");
    const sourceText = urlParams.get("text") ?? "";
    const { sourceLanguageSelector, targetLanguageSelector } = this.elements;

    if (sourceLanguage === "detect") {
      await this.#maybeUpdateDetectedSourceLanguage();
    } else if (
      supportedLanguages.sourceLanguages.some(
        ({ langTagKey }) => langTagKey === sourceLanguage
      )
    ) {
      sourceLanguageSelector.value = sourceLanguage;
    }

    if (
      supportedLanguages.targetLanguages.some(
        ({ langTagKey }) => langTagKey === targetLanguage
      )
    ) {
      targetLanguageSelector.value = targetLanguage;
    }

    this.#setSourceText(sourceText);
  }

  /**
   * Updates the URL hash to reflect the current state of the UI.
   */
  #updateURLFromUI() {
    const { sourceLanguageSelector, targetLanguageSelector } = this.elements;

    const params = new URLSearchParams();

    const sourceLanguage = sourceLanguageSelector.value;
    if (sourceLanguage) {
      params.append("src", sourceLanguage);
    }

    const targetLanguage = targetLanguageSelector.value;
    if (targetLanguage) {
      params.append("trg", targetLanguage);
    }

    const sourceText = this.#getSourceText().substring(0, URL_MAX_TEXT_LENGTH);
    if (sourceText) {
      params.append("text", sourceText);
    }

    window.location.hash = params;

    document.dispatchEvent(
      new CustomEvent("AboutTranslationsTest:URLUpdatedFromUI", {
        detail: { sourceLanguage, targetLanguage, sourceText },
      })
    );
  }

  /**
   * Sets the text direction ("dir" attribute) of the source text area
   * based on its content and the currently selected source language.
   */
  #updateSourceScriptDirection() {
    const appLocale = AT_getAppLocale();
    const selectedLanguagePair = this.#getSelectedLanguagePair();
    const selectedSourceLanguage = selectedLanguagePair?.sourceLanguage;
    const { sourceTextArea } = this.elements;

    if (selectedSourceLanguage && sourceTextArea.value) {
      sourceTextArea.setAttribute(
        "dir",
        AT_getScriptDirection(selectedSourceLanguage)
      );
    } else {
      sourceTextArea.setAttribute("dir", AT_getScriptDirection(appLocale));
    }
  }

  /**
   * Sets the text direction ("dir" attribute) of the target text area
   * based on its content and the currently selected target language.
   */
  #updateTargetScriptDirection() {
    const appLocale = AT_getAppLocale();
    const selectedLanguagePair = this.#getSelectedLanguagePair();
    const selectedTargetLanguage = selectedLanguagePair?.targetLanguage;
    const { targetTextArea } = this.elements;

    if (selectedTargetLanguage && targetTextArea.value) {
      targetTextArea.setAttribute(
        "dir",
        AT_getScriptDirection(selectedTargetLanguage)
      );
    } else {
      targetTextArea.setAttribute("dir", AT_getScriptDirection(appLocale));
    }
  }

  /**
   * Ensures that the translator matches the selected language pair,
   * destroying the previous non-matching translator if needed, and
   * creating a new translator.
   *
   * @returns {Promise<boolean>} true if the translator was reassigned, otherwise false.
   */
  async #ensureTranslatorMatchesSelectedLanguagePair() {
    if (this.#translatorMatchesSelectedLanguagePair()) {
      return false;
    }

    this.#translator?.destroy();

    const selectedLanguagePair = this.#getSelectedLanguagePair();

    this.#translator = await Translator.create({
      languagePair: selectedLanguagePair,
      requestTranslationsPort,
      allowSameLanguage: true,
      activeRequestCapacity: 1,
    });

    return true;
  }

  /**
   * Destroys the active {@link Translator} instance, if any.
   */
  #destroyTranslator() {
    if (this.#translator) {
      this.#translator.destroy();
      this.#translator = null;
    }
  }

  /**
   * Rebuilds the translator unconditionally and immediately re-evaluates whether
   * a translation request should be made.
   */
  rebuildTranslator() {
    this.#destroyTranslator();
    this.#maybeRequestTranslation();
  }

  /**
   * Requests translation on a debounce timer, only if the UI conditions are correct to do so.
   */
  #maybeRequestTranslation = debounce({
    /**
     * Debounce the translation requests so that the worker doesn't fire for every
     * single keyboard input, but instead the keyboard events are ignored until
     * there is a short break, or enough events have happened that it's worth sending
     * in a new translation request.
     */
    onDebounce: async () => {
      try {
        this.#updateURLFromUI();
        this.#ensureTextAreaHeightsMatch({ scheduleCallback: false });

        await this.#maybeUpdateDetectedSourceLanguage();

        const sourceText = this.#getSourceText();
        const selectedLanguagePair = this.#getSelectedLanguagePair();

        if (!sourceText || !selectedLanguagePair) {
          // The conditions for translation are not met.
          this.#setTargetText("");
          this.#destroyTranslator();
          this.#updateSwapLanguagesButtonEnabledState();
          this.elements.targetTextArea.setAttribute(
            "dir",
            AT_getScriptDirection(AT_getAppLocale())
          );
          return;
        }

        if (this.#isDetectedLanguageUnsupported()) {
          this.#updateSwapLanguagesButtonEnabledState();
          this.#setTargetText("");
          return;
        }

        const translationId = ++this.#translationId;
        this.#maybeDisplayTranslatingPlaceholder();

        await this.#ensureTranslatorMatchesSelectedLanguagePair();
        if (translationId !== this.#translationId) {
          // This translation request is no longer relevant.
          return;
        }

        document.dispatchEvent(
          new CustomEvent("AboutTranslationsTest:TranslationRequested", {
            detail: { translationId },
          })
        );

        const startTime = performance.now();
        const translationRequest = this.#translator.translate(
          sourceText,
          AT_isHtmlTranslation()
        );

        const translatedText = await translationRequest;
        if (translationId !== this.#translationId) {
          // This translation request is no longer relevant.
          return;
        }

        performance.measure(
          `AboutTranslations: Translate ${selectedLanguagePair.sourceLanguage} → ${selectedLanguagePair.targetLanguage} with ${sourceText.length} characters.`,
          {
            start: startTime,
            end: performance.now(),
          }
        );

        this.#setTargetText(translatedText);
        this.#updateSwapLanguagesButtonEnabledState();
        document.dispatchEvent(
          new CustomEvent("AboutTranslationsTest:TranslationComplete", {
            detail: { translationId },
          })
        );

        const duration = performance.now() - startTime;
        AT_log(`Translation done in ${duration / 1000} seconds`);
      } catch (error) {
        AT_logError(error);
      }
    },

    // Mark the events so that they show up in the Firefox Profiler. This makes it handy
    // to visualize the debouncing behavior.
    doEveryTime: () => {
      const sourceText = this.#getSourceText();
      performance.mark(
        `Translations: input changed to ${sourceText.length} code units.`
      );

      if (!sourceText) {
        this.#setTargetText("");
      }

      this.#updateSourceScriptDirection();
    },
  });

  /**
   * Ensures that the heights of the source and target text areas match by syncing
   * them to the maximum height of either of their content.
   *
   * There are many situations in which this function needs to be called:
   *   - Every time the source text is updated
   *   - Every time a translation occurs
   *   - Every time the window is resized
   *   - Every time the zoom level is changed
   *   - Etc.
   *
   * Some of these events happen infrequently, or are already debounced, such as
   * each time a translation occurs. In these situations it is okay to synchronize
   * the text-area heights immediately.
   *
   * Some of these events can trigger quite rapidly, such as resizing the window
   * via click-and-drag semantics. In this case, a single callback should be scheduled
   * to synchronize the text-area heights to prevent unnecessary and excessive reflow.
   *
   * @param {object} params
   * @param {boolean} params.scheduleCallback
   */
  #ensureTextAreaHeightsMatch({ scheduleCallback }) {
    if (scheduleCallback) {
      if (this.#synchronizeTextAreaHeightsTimeoutId) {
        // There is already a pending callback: no need to schedule another.
        return;
      }

      this.#synchronizeTextAreaHeightsTimeoutId = setTimeout(
        this.#synchronizeTextAreasToMaxContentHeight,
        100
      );

      return;
    }

    this.#synchronizeTextAreasToMaxContentHeight();
  }

  /**
   * Calculates the heights of the content in both the source and target text areas,
   * then syncs them both to the maximum calculated content height among the two.
   *
   * This function is intentionally written as a lambda so that it can be passed
   * as a callback without the need to explicitly bind `this` to the function object.
   *
   * Prefer calling #ensureTextAreaHeightsMatch to make it clear whether this function
   * needs to run immediately, or is okay to be scheduled as a callback.
   *
   * @see {AboutTranslations#ensureTextAreaHeightsMatch}
   */
  #synchronizeTextAreasToMaxContentHeight = () => {
    const { sourceTextArea, targetTextArea } = this.elements;

    // This will be the same for both the source and target text areas.
    const textAreaRatioBefore =
      parseFloat(sourceTextArea.style.height) / sourceTextArea.scrollWidth;

    sourceTextArea.style.height = "auto";
    targetTextArea.style.height = "auto";

    const maxContentHeight = Math.ceil(
      Math.max(sourceTextArea.scrollHeight, targetTextArea.scrollHeight)
    );
    const maxContentHeightPixels = `${maxContentHeight}px`;

    sourceTextArea.style.height = maxContentHeightPixels;
    targetTextArea.style.height = maxContentHeightPixels;

    const textAreaRatioAfter = maxContentHeight / sourceTextArea.scrollWidth;
    const ratioDelta = textAreaRatioAfter - textAreaRatioBefore;
    const changeThreshold = 0.001;

    if (
      // The text-area heights were not 0px prior to growing.
      textAreaRatioBefore > changeThreshold &&
      // The text-area aspect ratio changed beyond typical floating-point error.
      Math.abs(ratioDelta) > changeThreshold
    ) {
      document.dispatchEvent(
        new CustomEvent("AboutTranslationsTest:TextAreaHeightsChanged", {
          detail: {
            textAreaHeights: ratioDelta < 0 ? "decreased" : "increased",
          },
        })
      );
    }

    this.#synchronizeTextAreaHeightsTimeoutId = null;
  };
}

/**
 * Listen for events coming from the AboutTranslations actor.
 */
window.addEventListener("AboutTranslationsChromeToContent", ({ detail }) => {
  switch (detail.type) {
    case "enable": {
      if (window.aboutTranslations) {
        throw new Error(
          "Attempt to initialize about:translations page more than once."
        );
      }

      AT_isTranslationEngineSupported()
        .then(async isTranslationsEngineSupported => {
          window.aboutTranslations = new AboutTranslations(
            isTranslationsEngineSupported
          );
          await window.aboutTranslations.ready();
        })
        .catch(error => {
          AT_logError(error);
        })
        .finally(() => {
          // This lets test cases know that they can start making assertions.
          document.body.setAttribute("ready-for-testing", "");
          document.body.style.visibility = "visible";
        });

      break;
    }
    case "rebuild-translator": {
      window.aboutTranslations.rebuildTranslator();
      break;
    }
    default: {
      throw new Error("Unknown AboutTranslationsChromeToContent event.");
    }
  }
});

/**
 * Creates a new message port to handle translation requests for the given
 * language pair.
 *
 * @param {LanguagePair} languagePair
 * @returns {Promise<MessagePort>}
 */
function requestTranslationsPort(languagePair) {
  const { promise, resolve } = Promise.withResolvers();

  /** @param {{data: {type:string, languagePair: LanguagePair, port: MessagePort}}} */
  const getResponse = ({ data }) => {
    if (
      data.type == "GetTranslationsPort" &&
      data.languagePair.sourceLanguage === languagePair.sourceLanguage &&
      data.languagePair.targetLanguage === languagePair.targetLanguage &&
      data.languagePair.sourceVariant == languagePair.sourceVariant &&
      data.languagePair.targetVariant == languagePair.targetVariant
    ) {
      window.removeEventListener("message", getResponse);
      resolve(data.port);
    }
  };

  window.addEventListener("message", getResponse);
  AT_createTranslationsPort(languagePair);

  return promise;
}

/**
 * Debounce a function so that it is only called after some wait time with no activity.
 * This is good for grouping text entry via keyboard.
 *
 * @param {object} settings
 * @param {Function} settings.onDebounce
 * @param {Function} settings.doEveryTime
 * @returns {Function}
 */
function debounce({ onDebounce, doEveryTime }) {
  /** @type {number | null} */
  let timeoutId = null;
  let lastDispatch = null;

  return (...args) => {
    doEveryTime(...args);

    const now = Date.now();
    if (lastDispatch === null) {
      // This is the first call to the function.
      lastDispatch = now;
    }

    const timeLeft = lastDispatch + window.DEBOUNCE_DELAY - now;

    // Always discard the old timeout, either the function will run, or a new
    // timer will be scheduled.
    clearTimeout(timeoutId);

    if (timeLeft <= 0) {
      // It's been long enough to go ahead and call the function.
      timeoutId = null;
      lastDispatch = null;
      onDebounce(...args);
      return;
    }

    // Re-set the timeout with the current time left.
    clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      // Timeout ended, call the function.
      timeoutId = null;
      lastDispatch = null;
      onDebounce(...args);
    }, timeLeft);
  };
}
