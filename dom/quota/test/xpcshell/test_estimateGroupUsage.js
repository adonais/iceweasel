/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

loadScript("dom/quota/test/xpcshell/common/utils.js");

async function verifyGroupEstimation(principal, expectedUsage, expectedLimit) {
  info("Estimating group");

  const request = estimateGroupUsage(principal);
  await requestFinished(request);

  is(request.result.usage, expectedUsage, "Correct usage");
  is(request.result.limit, expectedLimit, "Correct limit");
}

async function testSteps() {
  // The group limit is calculated as 20% of the global limit and the minimum
  // value of the group limit is 10 MB.

  const groupLimitKB = 10 * 1024;
  const groupLimitBytes = groupLimitKB * 1024;
  const globalLimitKB = groupLimitKB * 5;
  const globalLimitBytes = globalLimitKB * 1024;

  info("Setting limits");

  setGlobalLimit(globalLimitKB);

  info("Clearing");

  let request = clear();
  await requestFinished(request);

  info("Filling origins");

  await fillOrigin(getPrincipal("https://foo1.example1.com"), 100);
  await fillOrigin(getPrincipal("https://foo2.example1.com"), 200);
  await fillOrigin(getPrincipal("https://foo1.example2.com"), 300);
  await fillOrigin(getPrincipal("https://foo2.example2.com"), 400);

  info("Verifying group estimations");

  // The usage is the total usage of the group, regardless of which origin in
  // the group is passed in, and the limit is the group limit.
  await verifyGroupEstimation(
    getPrincipal("https://foo1.example1.com"),
    300,
    groupLimitBytes
  );
  await verifyGroupEstimation(
    getPrincipal("https://foo2.example1.com"),
    300,
    groupLimitBytes
  );
  await verifyGroupEstimation(
    getPrincipal("https://foo1.example2.com"),
    700,
    groupLimitBytes
  );
  await verifyGroupEstimation(
    getPrincipal("https://foo2.example2.com"),
    700,
    groupLimitBytes
  );

  info("Persisting origin");

  request = persist(getPrincipal("https://foo2.example2.com"));
  await requestFinished(request);

  info("Verifying group estimations");

  // A persisted origin is exempt from the group limit and is bound by the
  // global limit instead, so it reports its own usage against that limit.
  await verifyGroupEstimation(
    getPrincipal("https://foo2.example2.com"),
    400,
    globalLimitBytes
  );

  // The persisted origin no longer counts towards the group usage seen by the
  // other origins in the group.
  await verifyGroupEstimation(
    getPrincipal("https://foo1.example2.com"),
    300,
    groupLimitBytes
  );

  info("Writing to an unrelated group");

  await fillOrigin(getPrincipal("https://foo1.example3.com"), 500);

  info("Verifying the group does not observe the unrelated write");

  await verifyGroupEstimation(
    getPrincipal("https://foo1.example2.com"),
    300,
    groupLimitBytes
  );

  finishTest();
}
