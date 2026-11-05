/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_copyTo_honors_umask() {
  const umask = Services.sysinfo.getProperty("umask");
  const base = do_get_tempdir();

  for (const perms of [0o755, 0o555]) {
    const src = base.clone();
    src.append(`src_${perms.toString(8)}`);
    const srcSub = src.clone();
    srcSub.append("subdir");
    srcSub.create(Ci.nsIFile.DIRECTORY_TYPE, 0o700);
    await IOUtils.writeUTF8(PathUtils.join(src.path, "file.txt"), "foo");
    await IOUtils.writeUTF8(PathUtils.join(srcSub.path, "file.txt"), "bar");
    srcSub.permissions = perms;
    src.permissions = perms;

    if (perms == 0o555) {
      const probe = src.clone();
      probe.append("probe");
      try {
        probe.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
        info("Read-only directories are writable when running as root");
        continue;
      } catch (e) {}
    }

    const destName = `dest_${perms.toString(8)}`;
    src.copyTo(base, destName);
    const dest = base.clone();
    dest.append(destName);
    const destSub = dest.clone();
    destSub.append("subdir");

    Assert.equal(
      await IOUtils.readUTF8(PathUtils.join(dest.path, "file.txt")),
      "foo"
    );
    Assert.equal(
      await IOUtils.readUTF8(PathUtils.join(destSub.path, "file.txt")),
      "bar"
    );
    // The common 022 and 002 umasks leave 0o555 unchanged, so these checks only
    // catch a regression when running with a stricter umask such as 027.
    Assert.equal(dest.permissions, perms & ~umask);
    Assert.equal(destSub.permissions, perms & ~umask);
  }
});
