/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RemotePageChild } from "moz-src:///toolkit/actors/RemotePageChild.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  EnrollmentType: "resource://nimbus/ExperimentAPI.sys.mjs",
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
});

export class AboutPrivateBrowsingChild extends RemotePageChild {
  actorCreated() {
    super.actorCreated();
    let window = this.contentWindow;

    Cu.exportFunction(
      this.PrivateBrowsingIsEnrolledInExperiment.bind(this),
      window,
      { defineAs: "PrivateBrowsingIsEnrolledInExperiment" }
    );
    Cu.exportFunction(
      this.PrivateBrowsingShouldHideDefault.bind(this),
      window,
      {
        defineAs: "PrivateBrowsingShouldHideDefault",
      }
    );
    Cu.exportFunction(
      this.PrivateBrowsingPromoExposureTelemetry.bind(this),
      window,
      { defineAs: "PrivateBrowsingPromoExposureTelemetry" }
    );
    Cu.exportFunction(this.PrivateBrowsingRedesignEnabled.bind(this), window, {
      defineAs: "PrivateBrowsingRedesignEnabled",
    });
    Cu.exportFunction(this.PrivateBrowsingRedesignExposure.bind(this), window, {
      defineAs: "PrivateBrowsingRedesignExposure",
    });
    Cu.exportFunction(
      this.PrivateBrowsingRecordRedesignClick.bind(this),
      window,
      { defineAs: "PrivateBrowsingRecordRedesignClick" }
    );
    Cu.exportFunction(
      this.PrivateBrowsingRecordIntroAnimation.bind(this),
      window,
      { defineAs: "PrivateBrowsingRecordIntroAnimation" }
    );
  }

  PrivateBrowsingIsEnrolledInExperiment() {
    return !!lazy.NimbusFeatures.pbNewtab.getEnrollmentMetadata(
      lazy.EnrollmentType.EXPERIMENT
    );
  }

  PrivateBrowsingShouldHideDefault() {
    const config = lazy.NimbusFeatures.pbNewtab.getAllVariables() || {};
    return config?.content?.hideDefault;
  }

  PrivateBrowsingPromoExposureTelemetry() {
    lazy.NimbusFeatures.pbNewtab.recordExposureEvent({ once: false });
  }

  PrivateBrowsingRecordRedesignClick(source) {
    Glean.aboutprivatebrowsing["click" + source].record();
  }

  PrivateBrowsingRecordIntroAnimation() {
    Glean.aboutprivatebrowsing.introAnimationPlayed.record();
  }

  // Without this the redesign experiment records enrollment but never records
  // who actually saw the treatment.
  PrivateBrowsingRedesignExposure() {
    lazy.NimbusFeatures.privateWindowRedesign.recordExposureEvent({
      once: true,
    });
  }

  PrivateBrowsingRedesignEnabled() {
    return Services.prefs.getBoolPref(
      "browser.privateWindowRedesign.enabled",
      false
    );
  }
}
