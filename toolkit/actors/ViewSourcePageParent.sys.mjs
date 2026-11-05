/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * ViewSourcePageParent manages the view source <browser> from the chrome side.
 */
export class ViewSourcePageParent extends JSWindowActorParent {
  constructor() {
    super();

    /**
     * Holds the value of the last line found via the "Go to line"
     * command, to pre-populate the prompt the next time it is
     * opened.
     */
    this.lastLineFound = null;
  }

  /**
   * Anything added to the messages array will get handled here, and should
   * get dispatched to a specific function for the message name.
   */
  receiveMessage(message) {
    let data = message.data;

    switch (message.name) {
      case "ViewSource:PromptAndGoToLine":
        this.promptAndGoToLine();
        break;
      case "ViewSource:GoToLine:Success":
        this.onGoToLineSuccess(data.lineNumber);
        break;
      case "ViewSource:GoToLine:Failed":
        this.onGoToLineFailed();
        break;
    }
  }

  /**
   * A getter for the view source localization.
   */
  get l10n() {
    if (this._l10n) {
      return this._l10n;
    }
    return (this._l10n = new Localization(["toolkit/global/viewSource.ftl"]));
  }

  /**
   * Opens the "Go to line" prompt for a user to hop to a particular line
   * of the source code they're viewing. This will keep prompting until the
   * user either cancels out of the prompt, or enters a valid line number.
   */
  async promptAndGoToLine() {
    let input = { value: this.lastLineFound };
    let window = Services.wm.getMostRecentWindow(null);

    let [title, text] = await this.l10n.formatValues([
      "view-source-go-to-line-title",
      "view-source-go-to-line-text",
    ]);
    let ok = Services.prompt.prompt(window, title, text, input, null, {
      value: 0,
    });

    if (!ok) {
      return;
    }

    let line = parseInt(input.value, 10);

    if (!(line > 0)) {
      let [invalidTitle, invalidText] = await this.l10n.formatValues([
        "view-source-invalid-input-title",
        "view-source-invalid-input-text",
      ]);
      Services.prompt.alert(window, invalidTitle, invalidText);
      this.promptAndGoToLine();
    } else {
      this.goToLine(line);
    }
  }

  /**
   * Go to a particular line of the source code. This act is asynchronous.
   *
   * @param lineNumber
   *        The line number to try to go to to.
   */
  goToLine(lineNumber) {
    this.sendAsyncMessage("ViewSource:GoToLine", { lineNumber });
  }

  /**
   * Called when the frame script reports that a line was successfully gotten
   * to.
   *
   * @param lineNumber
   *        The line number that we successfully got to.
   */
  onGoToLineSuccess(lineNumber) {
    // We'll pre-populate the "Go to line" prompt with this value the next
    // time it comes up.
    this.lastLineFound = lineNumber;
  }

  /**
   * Called when the child reports that we failed to go to a particular
   * line. This informs the user that their selection was likely out of range,
   * and then reprompts the user to try again.
   */
  async onGoToLineFailed() {
    let window = Services.wm.getMostRecentWindow(null);
    let [title, text] = await this.l10n.formatValues([
      "view-source-out-of-range-title",
      "view-source-out-of-range-text",
    ]);
    Services.prompt.alert(window, title, text);
    this.promptAndGoToLine();
  }
}
