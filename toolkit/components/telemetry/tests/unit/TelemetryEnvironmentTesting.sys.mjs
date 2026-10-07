/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  Assert: "resource://testing-common/Assert.sys.mjs",
  // AttributionCode is only needed for Firefox
  AttributionCode:
    "moz-src:///browser/components/attribution/AttributionCode.sys.mjs",

  MockRegistrar: "resource://testing-common/MockRegistrar.sys.mjs",
});

const gIsWindows = AppConstants.platform == "win";
const gIsMac = AppConstants.platform == "macosx";
const gIsAndroid = AppConstants.platform == "android";
const gIsLinux = AppConstants.platform == "linux";

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

const DISTRIBUTION_ID = "distributor-id";
const DISTRIBUTION_VERSION = "4.5.6b";
const DISTRIBUTOR_NAME = "Some Distributor";
const DISTRIBUTOR_CHANNEL = "A Channel";
const PARTNER_NAME = "test";
const PARTNER_ID = "NicePartner-ID-3785";

// The profile reset date, in milliseconds (Today)
const PROFILE_RESET_DATE_MS = Date.now();
// The profile creation date, in milliseconds (Yesterday).
const PROFILE_FIRST_USE_MS = PROFILE_RESET_DATE_MS - MILLISECONDS_PER_DAY;
const PROFILE_CREATION_DATE_MS = PROFILE_FIRST_USE_MS - MILLISECONDS_PER_DAY;
const PROFILE_RECOVERED_FROM_BACKUP =
  PROFILE_RESET_DATE_MS - MILLISECONDS_PER_HOUR;
const PROFILE_SOURCE = "telemetry-tests";

const GFX_VENDOR_ID = "0xabcd";
const GFX_DEVICE_ID = "0x1234";

// Valid attribution code to write so that settings.attribution can be tested.
const ATTRIBUTION_CODE = [
  ["source", "%3D", "google.com"],
  ["medium", "%3D", "referral"],
  ["campaign", "%3D", "Firefox-Brand-US-Chrome"],
  ["content", "%3D", "(not set)"],
  ["experiment", "%3D", "(not set)"],
  ["variation", "%3D", "(not set)"],
  ["ua", "%3D", "chrome"],
  ["dltoken", "%3D", "(not set)"],
  ["msstoresignedin", "%3D", "false"],
  ["storeBingAd", "_", "(not set)"], // `storeBingAd` uniquely uses `_` as a seperator.
  ["dlsource", "%3D", "unittest"],
]
  .map(attr => attr.join(""))
  .join("%26");

function truncateToDays(aMsec) {
  return Math.floor(aMsec / MILLISECONDS_PER_DAY);
}

var SysInfo = {
  overrides: {},

  _genuine: Cc["@mozilla.org/system-info;1"].createInstance(Ci.nsISupports),

  getProperty(name) {
    // Assert.ok(false, "Mock SysInfo: " + name + ", " + JSON.stringify(this.overrides));
    if (name in this.overrides) {
      return this.overrides[name];
    }

    return this._genuine.QueryInterface(Ci.nsIPropertyBag).getProperty(name);
  },

  getPropertyAsACString(name) {
    return this.get(name);
  },

  getPropertyAsUint32(name) {
    return this.get(name);
  },

  get(name) {
    return this._genuine.QueryInterface(Ci.nsIPropertyBag2).get(name);
  },

  get diskInfo() {
    return this._genuine.QueryInterface(Ci.nsISystemInfo).diskInfo;
  },

  get osInfo() {
    return this._genuine.QueryInterface(Ci.nsISystemInfo).osInfo;
  },

  get processInfo() {
    return this._genuine.QueryInterface(Ci.nsISystemInfo).processInfo;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIPropertyBag2", "nsISystemInfo"]),
};

/**
 * TelemetryEnvironmentTesting - tools for testing the telemetry environment
 * reporting.
 */
export var TelemetryEnvironmentTesting = {
  init(appInfo) {
    this.appInfo = appInfo;
  },

  setSysInfoOverrides(overrides) {
    SysInfo.overrides = overrides;
  },

  spoofGfxAdapter() {
    try {
      let gfxInfo = Cc["@mozilla.org/gfx/info;1"].getService(
        Ci.nsIGfxInfoDebug
      );
      gfxInfo.spoofVendorID(GFX_VENDOR_ID);
      gfxInfo.spoofDeviceID(GFX_DEVICE_ID);
    } catch (x) {
      // If we can't test gfxInfo, that's fine, we'll note it later.
    }
  },

  spoofProfileReset() {
    return IOUtils.writeJSON(
      PathUtils.join(PathUtils.profileDir, "times.json"),
      {
        created: PROFILE_CREATION_DATE_MS,
        reset: PROFILE_RESET_DATE_MS,
        firstUse: PROFILE_FIRST_USE_MS,
        recoveredFromBackup: PROFILE_RECOVERED_FROM_BACKUP,
        source: PROFILE_SOURCE,
      }
    );
  },

  spoofPartnerInfo() {
    let prefsToSpoof = {};
    prefsToSpoof["distribution.id"] = DISTRIBUTION_ID;
    prefsToSpoof["distribution.version"] = DISTRIBUTION_VERSION;
    prefsToSpoof["app.distributor"] = DISTRIBUTOR_NAME;
    prefsToSpoof["app.distributor.channel"] = DISTRIBUTOR_CHANNEL;
    prefsToSpoof["app.partner.test"] = PARTNER_NAME;
    prefsToSpoof["mozilla.partner.id"] = PARTNER_ID;

    // Spoof the preferences.
    for (let pref in prefsToSpoof) {
      Services.prefs
        .getDefaultBranch(null)
        .setStringPref(pref, prefsToSpoof[pref]);
    }
  },

  async spoofAttributionData() {
    if (gIsWindows) {
      lazy.AttributionCode._clearCache();
      await lazy.AttributionCode.writeAttributionFile(ATTRIBUTION_CODE);
    } else if (gIsMac) {
      lazy.AttributionCode._clearCache();
      const { MacAttribution } = ChromeUtils.importESModule(
        "moz-src:///browser/components/attribution/MacAttribution.sys.mjs"
      );
      await MacAttribution.setAttributionString(ATTRIBUTION_CODE);
    }
  },

  async cleanupAttributionData() {
    if (gIsWindows) {
      lazy.AttributionCode.attributionFile.remove(false);
      lazy.AttributionCode._clearCache();
    } else if (gIsMac) {
      const { MacAttribution } = ChromeUtils.importESModule(
        "moz-src:///browser/components/attribution/MacAttribution.sys.mjs"
      );
      await MacAttribution.delAttributionString();
    }
  },

  registerFakeSysInfo() {
    lazy.MockRegistrar.register("@mozilla.org/system-info;1", SysInfo);
  },

  /**
   * Check that a value is a string and not empty.
   *
   * @param aValue The variable to check.
   * @return True if |aValue| has type "string" and is not empty, False otherwise.
   */
  checkString(aValue) {
    return typeof aValue == "string" && aValue != "";
  },

  /**
   * If value is non-null, check if it's a valid string.
   *
   * @param aValue The variable to check.
   * @return True if it's null or a valid string, false if it's non-null and an invalid
   *         string.
   */
  checkNullOrString(aValue) {
    if (aValue) {
      return this.checkString(aValue);
    } else if (aValue === null) {
      return true;
    }

    return false;
  },

  /**
   * If value is non-null, check if it's a boolean.
   *
   * @param aValue The variable to check.
   * @return True if it's null or a valid boolean, false if it's non-null and an invalid
   *         boolean.
   */
  checkNullOrBool(aValue) {
    return aValue === null || typeof aValue == "boolean";
  },

  checkBuildSection(data) {
    const expectedInfo = {
      applicationId: "",
      applicationName: "",
      buildId: this.appInfo.appBuildID,
      version: "00.",
      vendor: null,
      platformVersion: "00.",
      xpcomAbi: "noarch-spidermonkey",
    };

    lazy.Assert.ok(
      "build" in data,
      "There must be a build section in Environment."
    );

    for (let f in expectedInfo) {
      lazy.Assert.equal(
        data.build[f],
        expectedInfo[f],
        f + " must have the correct value."
      );
    }

    // Make sure architecture is in the environment.
    lazy.Assert.ok(this.checkString(data.build.architecture));

    // Check Glean's values
    lazy.Assert.equal(Glean.xpcom.abi.testGetValue(), expectedInfo.xpcomAbi);
    lazy.Assert.equal(
      Glean.updater.available.testGetValue(),
      AppConstants.MOZ_UPDATER
    );
  },

  checkSettingsSection(data) {
    const EXPECTED_FIELDS_TYPES = {
      locale: "string",
      update: "object",
      userPrefs: "object",
    };

    lazy.Assert.ok(
      "settings" in data,
      "There must be a settings section in Environment."
    );

    for (let f in EXPECTED_FIELDS_TYPES) {
      lazy.Assert.equal(
        typeof data.settings[f],
        EXPECTED_FIELDS_TYPES[f],
        f + " must have the correct type."
      );
    }
    lazy.Assert.equal(typeof Glean.blocklist.enabled.testGetValue(), "boolean");
    lazy.Assert.equal(typeof Glean.e10s.enabled.testGetValue(), "boolean");
    lazy.Assert.equal(
      typeof Glean.e10s.multiProcesses.testGetValue(),
      "number"
    );
    lazy.Assert.equal(typeof Glean.fission.enabled.testGetValue(), "boolean");
    lazy.Assert.equal(
      typeof Glean.preferences.userPrefs.testGetValue(),
      "object"
    );

    // Check "addonCompatibilityCheckEnabled" separately.
    lazy.Assert.equal(
      Glean.addonsManager.compatibilityCheckEnabled.testGetValue(),
      lazy.AddonManager.checkCompatibility
    );

    // Check "isDefaultBrowser" separately, as it is not available on Android an can either be
    // null or boolean on other platforms.
    if (gIsAndroid) {
      lazy.Assert.ok(
        !("isDefaultBrowser" in data.settings),
        "Must not be available on Android."
      );
      lazy.Assert.equal(null, Glean.browser.defaultAtLaunch.testGetValue());
    } else if ("isDefaultBrowser" in data.settings) {
      // isDefaultBrowser might not be available in the payload, since it's
      // gathered after the session was restored.
      lazy.Assert.ok(this.checkNullOrBool(data.settings.isDefaultBrowser));
      lazy.Assert.ok(
        this.checkNullOrBool(Glean.browser.defaultAtLaunch.testGetValue())
      );
    }

    // Check "channel" separately, as it can either be null or string.
    let update = data.settings.update;
    lazy.Assert.ok(this.checkNullOrString(update.channel));
    lazy.Assert.equal(typeof update.enabled, "boolean");
    lazy.Assert.equal(
      update.channel,
      Glean.updateSettings.channel.testGetValue()
    );
    lazy.Assert.equal(
      update.enabled,
      Glean.updateSettings.enabled.testGetValue()
    );
    lazy.Assert.equal(
      "boolean",
      typeof Glean.updateSettings.autoDownload.testGetValue()
    );
    lazy.Assert.equal(
      "boolean",
      typeof Glean.updateSettings.background.testGetValue()
    );

    if ((gIsWindows || gIsMac) && AppConstants.MOZ_BUILD_APP == "browser") {
      lazy.Assert.equal(typeof data.settings.attribution, "object");
      lazy.Assert.equal(data.settings.attribution.source, "google.com");
      lazy.Assert.equal(data.settings.attribution.dlsource, "unittest");
      let attr = Services.fog.testGetAttribution();
      lazy.Assert.equal(
        attr.source,
        "google.com",
        "Must have correct attribution.source."
      );
      let attrExt = Glean.gleanAttribution.ext.testGetValue();
      lazy.Assert.equal(
        attrExt.experiment,
        "(not set)",
        "Must have correct `experiment`."
      );
      lazy.Assert.equal(
        attrExt.variation,
        "(not set)",
        "Must have correct `variation`."
      );
      lazy.Assert.equal(attrExt.ua, "chrome", "Must have correct `ua`.");
      lazy.Assert.equal(
        attrExt.dltoken,
        "(not set)",
        "Must have correct `dltoken`."
      );
      lazy.Assert.equal(
        attrExt.msstoresignedin,
        false,
        "Must have correct `msstoresignedin`."
      );
      lazy.Assert.equal(
        attrExt.msclkid,
        "(not set)",
        "`storeBingAd_[value] should translate to `msclkid=[value]`."
      );
      lazy.Assert.equal(
        attrExt.dlsource,
        "unittest",
        "Must have correct `dlsource`."
      );
    }

    this.checkIntlSettings();
  },

  checkIntlSettings() {
    lazy.Assert.deepEqual(
      Services.locale.requestedLocales,
      Glean.intl.requestedLocales.testGetValue()
    );
    lazy.Assert.deepEqual(
      Services.locale.availableLocales,
      Glean.intl.availableLocales.testGetValue()
    );
    lazy.Assert.deepEqual(
      Services.locale.appLocalesAsBCP47,
      Glean.intl.appLocales.testGetValue()
    );
    try {
      let osprefs = Cc["@mozilla.org/intl/ospreferences;1"].getService(
        Ci.mozIOSPreferences
      );
      lazy.Assert.deepEqual(
        osprefs.systemLocales,
        Glean.intl.systemLocales.testGetValue()
      );
      lazy.Assert.deepEqual(
        osprefs.regionalPrefsLocales,
        Glean.intl.regionalPrefsLocales.testGetValue()
      );
    } catch (e) {
      // Ignore.
    }
    lazy.Assert.deepEqual(
      Services.locale.acceptLanguages.split(/\s*,\s*/g),
      Glean.intl.acceptLanguages.testGetValue()
    );
  },

  checkProfileSection(data) {
    lazy.Assert.ok(
      "profile" in data,
      "There must be a profile section in Environment."
    );
    lazy.Assert.equal(
      data.profile.creationDate,
      truncateToDays(PROFILE_CREATION_DATE_MS)
    );
    lazy.Assert.equal(
      data.profile.recoveredFromBackup,
      truncateToDays(PROFILE_RECOVERED_FROM_BACKUP)
    );
    lazy.Assert.equal(
      data.profile.creationDate,
      Glean.profiles.creationDate.testGetValue()
    );
    lazy.Assert.equal(
      truncateToDays(PROFILE_RESET_DATE_MS),
      Glean.profiles.resetDate.testGetValue()
    );
    lazy.Assert.equal(
      truncateToDays(PROFILE_FIRST_USE_MS),
      Glean.profiles.firstUseDate.testGetValue()
    );
    lazy.Assert.equal(
      data.profile.recoveredFromBackup,
      Glean.profiles.recoveredFromBackup.testGetValue()
    );
    lazy.Assert.equal(Glean.profiles.source.testGetValue(), PROFILE_SOURCE);
  },

  checkPartnerSection(data, isInitial) {
    if (AppConstants.MOZ_APP_NAME == "thunderbird") {
      // Thunderbird doesn't have distribution data and this section fails.
      return;
    }

    const EXPECTED_FIELDS = {
      distributionId: DISTRIBUTION_ID,
      distributionVersion: DISTRIBUTION_VERSION,
      partnerId: PARTNER_ID,
      distributor: DISTRIBUTOR_NAME,
      distributorChannel: DISTRIBUTOR_CHANNEL,
    };

    lazy.Assert.ok(
      "partner" in data,
      "There must be a partner section in Environment."
    );

    let dist = Services.fog.testGetDistribution();
    let distExt = Glean.gleanDistribution.ext.testGetValue();
    for (let f in EXPECTED_FIELDS) {
      let expected = isInitial ? null : EXPECTED_FIELDS[f];
      lazy.Assert.strictEqual(
        data.partner[f],
        expected,
        f + " must have the correct value."
      );
      if (f == "distributionId") {
        lazy.Assert.strictEqual(
          dist.name,
          expected,
          "Core Glean distribution must be correct."
        );
      } else {
        lazy.Assert.equal(
          distExt[f],
          expected,
          `Extended Glean distribution field "${f}" must be correct.`
        );
      }
    }

    // Check that "partnerNames" exists and contains the correct element.
    lazy.Assert.ok(Array.isArray(data.partner.partnerNames));
    if (isInitial) {
      lazy.Assert.equal(data.partner.partnerNames.length, 0);
      // bug 1965481 - Artifact and full builds disagree on how to store [].
      if (Services.prefs.getBoolPref("telemetry.fog.artifact_build", false)) {
        lazy.Assert.ok(Array.isArray(distExt.partnerNames));
        lazy.Assert.equal(distExt.partnerNames.length, 0);
      } else {
        lazy.Assert.equal(distExt.partnerNames, null);
      }
    } else {
      lazy.Assert.ok(data.partner.partnerNames.includes(PARTNER_NAME));
      lazy.Assert.ok(
        distExt.partnerNames.includes(PARTNER_NAME),
        "Glean partner names contain expected partner name."
      );
    }
  },

  checkGfxAdapter(data) {
    const EXPECTED_ADAPTER_FIELDS_TYPES = {
      description: "string",
      vendorID: "string",
      deviceID: "string",
      subsysID: "string",
      RAM: "number",
      driver: "string",
      driverVendor: "string",
      driverVersion: "string",
      driverDate: "string",
      GPUActive: "boolean",
    };

    for (let f in EXPECTED_ADAPTER_FIELDS_TYPES) {
      lazy.Assert.ok(f in data, f + " must be available.");

      if (data[f]) {
        // Since we have a non-null value, check if it has the correct type.
        lazy.Assert.equal(
          typeof data[f],
          EXPECTED_ADAPTER_FIELDS_TYPES[f],
          f + " must have the correct type."
        );
      }
    }
  },

  checkSystemSection(data, assertProcessData) {
    const EXPECTED_FIELDS = ["memoryMB", "cpu", "os", "gfx"];

    lazy.Assert.ok(
      "system" in data,
      "There must be a system section in Environment."
    );

    // Make sure we have all the top level sections and fields.
    for (let f of EXPECTED_FIELDS) {
      lazy.Assert.ok(f in data.system, f + " must be available.");
    }

    lazy.Assert.ok(
      Number.isFinite(data.system.memoryMB),
      "MemoryMB must be a number."
    );
    lazy.Assert.equal(data.system.memoryMB, Glean.system.memory.testGetValue());

    if (assertProcessData) {
      if (gIsWindows || gIsMac || gIsLinux) {
        let EXTRA_CPU_FIELDS = [
          "cores",
          "model",
          "family",
          "stepping",
          "vendor",
          "name",
        ];

        for (let f of EXTRA_CPU_FIELDS) {
          // Note this is testing TelemetryEnvironment.js only, not that the
          // values are valid - null is the fallback.
          lazy.Assert.ok(
            f in data.system.cpu,
            f + " must be available under cpu."
          );
        }

        if (gIsWindows) {
          lazy.Assert.equal(
            typeof data.system.isWow64,
            "boolean",
            "isWow64 must be available on Windows and have the correct type."
          );
          lazy.Assert.equal(
            data.system.isWow64,
            Glean.system.isWow64.testGetValue()
          );

          for (let f of ["count", "model", "family", "stepping"]) {
            lazy.Assert.ok(
              Number.isFinite(data.system.cpu[f]),
              f + " must be a number if non null."
            );
          }
        }

        // These should be numbers if they are not null
        for (let f of ["count", "model", "family", "stepping"]) {
          lazy.Assert.ok(
            !(f in data.system.cpu) ||
              data.system.cpu[f] === null ||
              Number.isFinite(data.system.cpu[f]),
            f + " must be a number if non null."
          );
        }

        // We insist these are available
        for (let f of ["cores"]) {
          lazy.Assert.ok(
            !(f in data.system.cpu) || Number.isFinite(data.system.cpu[f]),
            f + " must be a number if non null."
          );
        }
      }
    }

    let osData = data.system.os;
    lazy.Assert.ok(this.checkNullOrString(osData.name));
    lazy.Assert.ok(this.checkNullOrString(osData.version));
    if (osData.name !== null) {
      lazy.Assert.equal(osData.name, Glean.systemOs.name.testGetValue());
    }
    if (osData.version !== null) {
      lazy.Assert.equal(osData.version, Glean.systemOs.version.testGetValue());
    }

    // Service pack is only available on Windows.
    if (gIsWindows) {
      if ("windowsBuildNumber" in osData) {
        // This might not be available on all Windows platforms.
        lazy.Assert.ok(
          Number.isFinite(osData.windowsBuildNumber),
          "windowsBuildNumber must be a number."
        );
        lazy.Assert.equal(
          osData.windowsBuildNumber,
          Glean.systemOs.windowsBuildNumber.testGetValue()
        );
      }
    } else if (gIsLinux) {
      lazy.Assert.ok(this.checkNullOrString(osData.distro));
      lazy.Assert.ok(this.checkNullOrString(osData.distroVersion));
      lazy.Assert.equal(osData.distro, Glean.systemOs.distro.testGetValue());
      lazy.Assert.equal(
        osData.distroVersion,
        Glean.systemOs.distroVersion.testGetValue()
      );
    }

    this.checkGfx(data.system.gfx);

    if (gIsMac) {
      lazy.Assert.ok(!!Glean.system.appleModelId.testGetValue());
    } else {
      lazy.Assert.equal(null, Glean.system.appleModelId.testGetValue());
    }
  },

  checkGfx(gfxData) {
    lazy.Assert.ok("DWriteEnabled" in gfxData);
    lazy.Assert.equal(
      gfxData.DWriteEnabled,
      Glean.gfx.dwriteEnabled.testGetValue()
    );
    lazy.Assert.ok("Headless" in gfxData);
    lazy.Assert.equal(gfxData.Headless, Glean.gfx.headless.testGetValue());
    lazy.Assert.ok("TargetFrameRate" in gfxData);
    lazy.Assert.equal(typeof gfxData.TargetFrameRate, "number");
    lazy.Assert.equal(
      gfxData.TargetFrameRate,
      Glean.gfx.targetFrameRate.testGetValue()
    );
    lazy.Assert.ok("textScaleFactor" in gfxData);
    lazy.Assert.equal(
      gfxData.textScaleFactor,
      Glean.gfx.textScaleFactor.testGetValue()
    );
    if (gIsWindows) {
      lazy.Assert.equal(typeof gfxData.DWriteEnabled, "boolean");
    }

    lazy.Assert.ok("adapters" in gfxData);
    lazy.Assert.ok(
      !!gfxData.adapters.length,
      "There must be at least one GFX adapter."
    );
    for (let adapter of gfxData.adapters) {
      this.checkGfxAdapter(adapter);
    }
    lazy.Assert.equal(typeof gfxData.adapters[0].GPUActive, "boolean");
    lazy.Assert.ok(
      gfxData.adapters[0].GPUActive,
      "The first GFX adapter must be active."
    );
    const adapters = Glean.gfx.adapters.testGetValue();
    gfxData.adapters.forEach((adapter, index) => {
      for (const [k, v] of Object.entries(adapter)) {
        if (v === null) {
          // Glean doesn't bother with `null`s
          continue;
        }
        lazy.Assert.equal(v, adapters[index][k]);
      }
    });

    lazy.Assert.ok(Array.isArray(gfxData.monitors));
    if (gIsWindows || gIsMac || gIsLinux) {
      lazy.Assert.ok(
        gfxData.monitors.length >= 1,
        "There is at least one monitor."
      );
      lazy.Assert.equal(typeof gfxData.monitors[0].screenWidth, "number");
      lazy.Assert.equal(typeof gfxData.monitors[0].screenHeight, "number");
      lazy.Assert.equal(
        typeof gfxData.monitors[0].defaultCSSScaleFactor,
        "number"
      );
      lazy.Assert.equal(
        typeof gfxData.monitors[0].contentsScaleFactor,
        "number"
      );
      if (gIsWindows) {
        lazy.Assert.equal(typeof gfxData.monitors[0].refreshRate, "number");
        lazy.Assert.equal(typeof gfxData.monitors[0].pseudoDisplay, "boolean");
      }
    }
    lazy.Assert.deepEqual(gfxData.monitors, Glean.gfx.monitors.testGetValue());

    lazy.Assert.equal(typeof gfxData.features, "object");
    lazy.Assert.equal(typeof gfxData.features.compositor, "string");
    lazy.Assert.ok(!!Glean.gfxFeatures.compositor.testGetValue());

    lazy.Assert.equal(typeof gfxData.features.gpuProcess, "object");
    lazy.Assert.equal(typeof gfxData.features.gpuProcess.status, "string");
    lazy.Assert.ok(!!Glean.gfxFeatures.gpuProcess.testGetValue().status);

    if (gIsWindows && !!gfxData.features?.d3d11?.version) {
      lazy.Assert.equal(typeof gfxData.features.d3d11.version, "number");
      lazy.Assert.equal(
        gfxData.features.d3d11.version,
        Glean.gfxFeatures.d3d11.testGetValue().version
      );
    }

    try {
      // If we've not got nsIGfxInfoDebug, then this will throw and stop us doing
      // this test.
      let gfxInfo = Cc["@mozilla.org/gfx/info;1"].getService(
        Ci.nsIGfxInfoDebug
      );

      if (gIsWindows || gIsMac) {
        lazy.Assert.equal(GFX_VENDOR_ID, gfxData.adapters[0].vendorID);
        lazy.Assert.equal(GFX_DEVICE_ID, gfxData.adapters[0].deviceID);
      }

      let features = gfxInfo.getFeatures();
      lazy.Assert.equal(features.compositor, gfxData.features.compositor);
      lazy.Assert.equal(
        features.gpuProcess.status,
        gfxData.features.gpuProcess.status
      );
      lazy.Assert.equal(
        features.compositor,
        Glean.gfxFeatures.compositor.testGetValue()
      );
      lazy.Assert.equal(
        features.gpuProcess.status,
        Glean.gfxFeatures.gpuProcess.testGetValue().status
      );
    } catch (e) {}
  },

  checkEnvironmentData(data, options = {}) {
    const { isInitial = false, assertProcessData = false } = options;

    this.checkBuildSection(data);
    this.checkSettingsSection(data);
    this.checkProfileSection(data);
    this.checkPartnerSection(data, isInitial);
    this.checkSystemSection(data, assertProcessData);
  },
};
