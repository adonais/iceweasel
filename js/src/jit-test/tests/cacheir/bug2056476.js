function negate(value) { return -value; }
const date = new Date(17);
date.valueOf = function() { delete this.valueOf; return 1n; };
negate(date);
