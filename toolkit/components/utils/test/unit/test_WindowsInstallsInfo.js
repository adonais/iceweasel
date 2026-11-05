/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { WindowsInstallsInfo } = ChromeUtils.importESModule(
  "resource://gre/modules/components-utils/WindowsInstallsInfo.sys.mjs"
);
const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);

async function makeTestDir() {
  let path = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "windows-installs-info"
  );
  registerCleanupFunction(async () => {
    await IOUtils.remove(path, { recursive: true, ignoreAbsent: true });
  });
  return path;
}

add_task(async function testReadInstallationTelemetry() {
  const dir = await makeTestDir();
  const data = { installer_type: "full", from_msi: false, silent: true };
  const path = PathUtils.join(dir, "installation_telemetry.json");
  // The installer writes the file as UTF-16.
  const utf16Array = new Uint16Array(
    [...JSON.stringify(data)].map(char => char.charCodeAt(0))
  );
  await IOUtils.write(path, new Uint8Array(utf16Array.buffer));

  Assert.deepEqual(
    await WindowsInstallsInfo.readInstallationTelemetry(
      new FileUtils.File(path)
    ),
    data
  );
});

add_task(async function testReadInstallationTelemetryMissing() {
  const dir = await makeTestDir();
  const file = new FileUtils.File(
    PathUtils.join(dir, "installation_telemetry.json")
  );

  Assert.equal(await WindowsInstallsInfo.readInstallationTelemetry(file), null);
});

add_task(async function testReadInstallationTelemetryInvalid() {
  const dir = await makeTestDir();
  const path = PathUtils.join(dir, "installation_telemetry.json");
  await IOUtils.writeUTF8(path, "not json");

  await Assert.rejects(
    WindowsInstallsInfo.readInstallationTelemetry(new FileUtils.File(path)),
    /JSON\.parse/
  );
});
