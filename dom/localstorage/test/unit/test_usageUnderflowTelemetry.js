/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// The quotamanager.usage_underflow event is recorded when the in-memory
// usage of a client goes negative. Seed the LocalStorage usage from a usage
// file that is lower than the real content, then clear the storage: the
// removal subtracts the real item sizes and the counter crosses zero in
// OriginInfo::LockedTruncateUsages (bug 1585978).

add_task(async function testSteps() {
  const key = "key1";
  const value = repeatChar(1000, ".");
  const realUsage = key.length + value.length;
  const seededUsage = 10;

  const principal = getDefaultPrincipal();
  const usageFile = getRelativeFile(
    "storage/default/http+++example.com/ls/usage"
  );

  info("Setting prefs");
  Services.prefs.setBoolPref("dom.quotaManager.loadQuotaFromCache", false);

  info("Stage 1 - Storing an item and flushing it to disk");

  let request = clear();
  await requestFinished(request);

  let storage = getLocalStorage(principal);
  storage.setItem(key, value);

  request = reset();
  await requestFinished(request);

  is(
    await readUsageFromUsageFile(usageFile),
    realUsage,
    "Usage file holds the real usage"
  );

  info("Stage 2 - Replacing the usage file content with a lower counter");

  // Cookie 0x420a420a followed by big-endian int64 10, as UpdateUsageFile
  // would write it.
  await IOUtils.write(
    usageFile.path,
    new Uint8Array([
      0x42,
      0x0a,
      0x42,
      0x0a,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      seededUsage,
    ])
  );

  info("Stage 3 - Initializing the origin from the usage file");

  request = initStorage();
  await requestFinished(request);

  request = initTemporaryStorage();
  await requestFinished(request);

  request = initTemporaryOrigin(persistenceFor(principal), principal, false);
  await requestFinished(request);

  request = getCachedOriginUsage(principal);
  await requestFinished(request);

  is(request.result, seededUsage, "In-memory usage seeded from the file");

  info("Stage 4 - Clearing the storage");

  Services.fog.initializeFOG();
  Services.fog.testResetFOG();

  storage = getLocalStorage(principal);
  storage.clear();

  request = resetClient(principal);
  await requestFinished(request);

  const events = Glean.quotamanager.usageUnderflow.testGetValue();
  is(events.length, 1, "One usage_underflow event recorded");

  const extra = events[0].extra;
  is(
    extra.call_site,
    "LockedTruncateUsages",
    "Recorded from LockedTruncateUsages"
  );
  is(extra.client, "ls", "Recorded for the LocalStorage client");
  is(
    Number(extra.magnitude),
    Math.floor(Math.log2(realUsage - seededUsage)),
    "Magnitude is the order of the negative value"
  );

  // The origin is the only one loaded, so the total temporary storage usage
  // went negative by the same amount.
  const globalEvents =
    Glean.quotamanager.temporaryStorageUsageUnderflow.testGetValue();
  is(globalEvents.length, 1, "One temporary_storage_usage_underflow event");
  is(
    globalEvents[0].extra.call_site,
    "LockedTruncateUsages",
    "Total usage recorded from LockedTruncateUsages"
  );
  is(
    Number(globalEvents[0].extra.magnitude),
    Math.floor(Math.log2(realUsage - seededUsage)),
    "Total usage magnitude is the order of the negative value"
  );
});
