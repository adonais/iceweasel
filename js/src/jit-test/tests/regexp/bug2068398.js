try {
  eval(`
    var bad = new RegExp(/[a--b]/v, "");
    try { bad.exec("a"); } catch {}
    new RegExp("[a--b]", "");
`)
} catch {}
