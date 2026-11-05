/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const backgroundTaskDefaultAgent = ChromeUtils.importESModule(
  "resource://gre/modules/backgroundtasks/BackgroundTask_defaultagent.sys.mjs"
);
const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);

const IS_MSIX = Services.sysinfo.getProperty("hasWinPackageId");

function createMockDefaultAgent(mockData) {
  const sentPings = [];
  return {
    secondsSinceLastAppRun: () => mockData.secondsSinceAppRun,
    getDefaultBrowser: () => mockData.defaultBrowser,
    getReplacePreviousDefaultBrowser: () => mockData.previousDefaultBrowser,
    getDefaultPdfHandler: () => mockData.defaultPdfHandler,
    sendPing: (
      defaultBrowser,
      previousDefaultBrowser,
      defaultPdfHandler,
      shown,
      action,
      daysSinceLastAppLaunch,
      isTaskbarPinned,
      hasWinPackageId,
      winPackageFamilyName,
      installerType,
      installerFromMsi,
      installerSilent
    ) => {
      sentPings.push({
        defaultBrowser,
        previousDefaultBrowser,
        defaultPdfHandler,
        shown,
        action,
        daysSinceLastAppLaunch,
        isTaskbarPinned,
        hasWinPackageId,
        winPackageFamilyName,
        installerType,
        installerFromMsi,
        installerSilent,
      });
    },
    getSentPings: () => sentPings,
  };
}

async function makeTestDir() {
  let path = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "defaultagent-install-info"
  );
  registerCleanupFunction(async () => {
    await IOUtils.remove(path, { recursive: true, ignoreAbsent: true });
  });
  return path;
}

// The installer writes installation_telemetry.json as UTF-16.
async function writeInstallTelemetry(dir, data) {
  let path = PathUtils.join(dir, "installation_telemetry.json");
  let utf16Array = new Uint16Array(
    [...JSON.stringify(data)].map(char => char.charCodeAt(0))
  );
  await IOUtils.write(path, new Uint8Array(utf16Array.buffer));
  return new FileUtils.File(path);
}

async function writeDistributionIni(dir, contents) {
  let path = PathUtils.join(dir, "distribution.ini");
  await IOUtils.writeUTF8(path, contents);
  return new FileUtils.File(path);
}

function missingFile(dir, name) {
  return new FileUtils.File(PathUtils.join(dir, name));
}

add_task(async function testDoTask() {
  const mockData = {
    secondsSinceAppRun: 604800,
    defaultBrowser: "browser 1",
    previousDefaultBrowser: "browser 2",
    defaultPdfHandler: "pdf handler 1",
  };
  const mockDefaultAgent = createMockDefaultAgent(mockData);
  await backgroundTaskDefaultAgent.doTask(mockDefaultAgent, false);
  const sentPings = mockDefaultAgent.getSentPings();
  Assert.equal(1, sentPings.length);
  Assert.equal(sentPings[0].defaultBrowser, mockData.defaultBrowser);
  Assert.equal(
    sentPings[0].previousDefaultBrowser,
    mockData.previousDefaultBrowser
  );
  Assert.equal(sentPings[0].defaultPdfHandler, mockData.defaultPdfHandler);
  Assert.equal(sentPings[0].shown, "not-shown");
  Assert.equal(sentPings[0].action, "no-action");
  Assert.equal(sentPings[0].daysSinceLastAppLaunch, 7);
  Assert.equal(sentPings[0].isTaskbarPinned, "Error");

  const installInfo = await backgroundTaskDefaultAgent.getInstallInfo();
  Assert.equal(sentPings[0].hasWinPackageId, installInfo.hasWinPackageId);
  Assert.equal(
    sentPings[0].winPackageFamilyName,
    installInfo.winPackageFamilyName
  );
  Assert.equal(sentPings[0].installerType, installInfo.installerType);
  Assert.equal(sentPings[0].installerFromMsi, installInfo.installerFromMsi);
  Assert.equal(sentPings[0].installerSilent, installInfo.installerSilent);
});

add_task(async function testDoTaskAppNotRunRecently() {
  const mockData = {
    secondsSinceAppRun: 91 * 24 * 60 * 60,
    defaultBrowser: "browser 1",
    previousDefaultBrowser: "browser 2",
    defaultPdfHandler: "pdf handler 1",
  };
  const mockDefaultAgent = createMockDefaultAgent(mockData);
  await Assert.rejects(
    backgroundTaskDefaultAgent.doTask(mockDefaultAgent, false),
    /App hasn't run recently/
  );
  Assert.equal(0, mockDefaultAgent.getSentPings().length);
});

add_task(async function testGetInstallInfoFullInstall() {
  const dir = await makeTestDir();
  const installTelemetryFile = await writeInstallTelemetry(dir, {
    installer_type: "full",
    from_msi: true,
    silent: true,
    admin_user: true,
  });
  const distributionIniFile = await writeDistributionIni(
    dir,
    "[Global]\nid=test-partner\nversion=1.0\n"
  );

  const info = await backgroundTaskDefaultAgent.getInstallInfo({
    installTelemetryFile,
    distributionIniFile,
  });

  Assert.equal(info.hasWinPackageId, IS_MSIX);
  Assert.equal(info.distributionId, "test-partner");
  if (IS_MSIX) {
    Assert.equal(info.installerType, "msix");
    Assert.ok(
      info.winPackageFamilyName == "" ||
        info.winPackageFamilyName.startsWith("Mozilla"),
      "Only Mozilla package family names are reported"
    );
    Assert.ok(!info.installerFromMsi);
    Assert.ok(!info.installerSilent);
  } else {
    Assert.equal(info.installerType, "full");
    Assert.equal(info.winPackageFamilyName, "");
    Assert.ok(info.installerFromMsi);
    Assert.ok(info.installerSilent);
  }
});

add_task(async function testGetInstallInfoStubInstall() {
  if (IS_MSIX) {
    return;
  }
  const dir = await makeTestDir();
  const installTelemetryFile = await writeInstallTelemetry(dir, {
    installer_type: "stub",
    from_msi: true,
    silent: true,
  });

  const info = await backgroundTaskDefaultAgent.getInstallInfo({
    installTelemetryFile,
    distributionIniFile: missingFile(dir, "distribution.ini"),
  });

  Assert.equal(info.installerType, "stub");
  Assert.ok(!info.installerFromMsi, "from_msi only applies to full installs");
  Assert.ok(!info.installerSilent, "silent only applies to full installs");
  Assert.equal(info.distributionId, "");
});

add_task(async function testGetInstallInfoMissingFiles() {
  const dir = await makeTestDir();

  const info = await backgroundTaskDefaultAgent.getInstallInfo({
    installTelemetryFile: missingFile(dir, "installation_telemetry.json"),
    distributionIniFile: missingFile(dir, "distribution.ini"),
  });

  Assert.equal(info.installerType, IS_MSIX ? "msix" : "");
  Assert.ok(!info.installerFromMsi);
  Assert.ok(!info.installerSilent);
  Assert.equal(info.distributionId, "");
});

add_task(async function testGetInstallInfoUnknownInstallerType() {
  if (IS_MSIX) {
    return;
  }
  const dir = await makeTestDir();
  const installTelemetryFile = await writeInstallTelemetry(dir, {
    installer_type: "something-else",
  });

  const info = await backgroundTaskDefaultAgent.getInstallInfo({
    installTelemetryFile,
    distributionIniFile: missingFile(dir, "distribution.ini"),
  });

  Assert.equal(info.installerType, "");
});
