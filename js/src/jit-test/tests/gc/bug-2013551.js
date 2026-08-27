function checkSetParam(x, expected) {
  let ok = true;
  try {
    gcparam("storeBufferScaling", x);
  } catch (e) {
    ok = false;
  }
  assertEq(ok, expected);
}

checkSetParam(0, false);
checkSetParam(1, true);
checkSetParam(100, true);
checkSetParam(101, false);
