/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AboutPages: "resource://normandy-content/AboutPages.sys.mjs",
});

export class ShieldFrameParent extends JSWindowActorParent {
  async receiveMessage(msg) {
    let { aboutStudies } = lazy.AboutPages;
    switch (msg.name) {
      case "Shield:AddToWeakSet":
        aboutStudies.addToWeakSet(this.browsingContext);
        break;
      case "Shield:RemoveFromWeakSet":
        aboutStudies.removeFromWeakSet(this.browsingContext);
        break;
      case "Shield:GetMessagingSystemList":
        return aboutStudies.getMessagingSystemList();
      case "Shield:RemoveMessagingSystemExperiment":
        aboutStudies.removeMessagingSystemExperiment(msg.data.slug);
        break;
      case "Shield:OpenDataPreferences":
        aboutStudies.openDataPreferences();
        break;
      case "Shield:GetStudiesEnabled":
        return aboutStudies.getStudiesEnabled();
      case "Shield:ExperimentOptIn":
        return aboutStudies.optInToExperiment(msg.data);
    }

    return null;
  }
}
