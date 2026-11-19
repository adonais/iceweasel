newGlobal().eval(`(function () {
  enableTrackAllocations();
  return arguments[Symbol.iterator];
})();`);
