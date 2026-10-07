/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

loadScript("dom/quota/test/xpcshell/common/utils.js");

async function verifyOriginEstimation(principal, expectedUsage, expectedLimit) {
  info("Estimating origin");

  const request = estimateOrigin(principal);
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

  info("Verifying origin estimations");

  // The usage is the origin's own usage, not the total usage of its group,
  // while the limit is the group limit.
  await verifyOriginEstimation(
    getPrincipal("https://foo1.example1.com"),
    100,
    groupLimitBytes
  );
  await verifyOriginEstimation(
    getPrincipal("https://foo2.example1.com"),
    200,
    groupLimitBytes
  );
  await verifyOriginEstimation(
    getPrincipal("https://foo1.example2.com"),
    300,
    groupLimitBytes
  );
  await verifyOriginEstimation(
    getPrincipal("https://foo2.example2.com"),
    400,
    groupLimitBytes
  );

  info("Persisting origin");

  request = persist(getPrincipal("https://foo2.example2.com"));
  await requestFinished(request);

  info("Verifying origin estimation");

  // A persisted origin is exempt from group-limit eviction and is bound by the
  // global limit instead, so it reports its usage against that global limit.
  await verifyOriginEstimation(
    getPrincipal("https://foo2.example2.com"),
    400,
    globalLimitBytes
  );

  info("Writing to an unrelated group");

  await fillOrigin(getPrincipal("https://foo1.example3.com"), 500);

  info("Verifying the persisted origin does not observe the unrelated write");

  await verifyOriginEstimation(
    getPrincipal("https://foo2.example2.com"),
    400,
    globalLimitBytes
  );

  info("Filling the default and temporary repositories of a single origin");

  // The estimate sums the origin's usage across all best-effort repositories,
  // so data stored with the "temporary" persistence type must be added to the
  // default repository usage rather than reported on its own.
  await fillOrigin(getPrincipal("https://foo1.example4.com"), 100);
  await fillOrigin(getPrincipal("https://foo1.example4.com"), 50, "temporary");

  info("Verifying the estimate sums default and temporary repository usage");

  await verifyOriginEstimation(
    getPrincipal("https://foo1.example4.com"),
    150,
    groupLimitBytes
  );

  info("Filling the private repository of a private-browsing origin");

  // In private browsing the origin's data lives in the private repository,
  // which is also a best-effort repository and must be covered by the estimate.
  await fillOrigin(
    getPrincipal("https://foo1.example5.com", { privateBrowsingId: 1 }),
    75
  );

  info("Verifying the estimate reports private repository usage");

  await verifyOriginEstimation(
    getPrincipal("https://foo1.example5.com", { privateBrowsingId: 1 }),
    75,
    groupLimitBytes
  );

  finishTest();
}
