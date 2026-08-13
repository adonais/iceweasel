gczeal(0);

function round(i) {
  var gTarget = newGlobal({newCompartment: true});
  var gWrapper = newGlobal({newCompartment: true});

  var source = null, transplant = null;
  (function() {
    var r = transplantableObject();
    source = r.object;
    transplant = r.transplant;
    gWrapper.w = r.object;  // create CCW for the transplantable object
    minorgc();
    minorgc();              // tenure the wrapper
    gWrapper.w = null;      // wrapper now only reachable from the wrapper map
  })();

  schedulezone(gWrapper);
  startgc(1);
  while (gcstate() == "Prepare") {
    gcslice(100);
  }

  transplant(gTarget);

  minorgc();

  while (gcstate() != "NotActive") {
    gcslice(1000000);
  }

  gcparam("maxBytes", gcparam("maxBytes"));

  minorgc();
}

for (var i = 0; i < 10; i++) {
  round(i);
}
