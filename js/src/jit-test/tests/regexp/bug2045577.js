class SubRE extends RegExp {}
var sub = new SubRE("x");   // subclassed RegExp: [[LegacyFeaturesEnabled]] = false
var re = /(abc)/;           // normal RegExp: [[LegacyFeaturesEnabled]] = true

function hit(s) { return re.exec(s); }
for (var i = 0; i < 2000; i++) hit("xabcx");

// Invalidate the statics.
sub.exec("x");

// Revalidate the statics.
hit("xabcx");

// Check that the statics are valid.
assertEq(RegExp.lastMatch, "abc");
