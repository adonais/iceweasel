// |reftest| skip-if(!xulRuntime.shell)

var BUGNUMBER = 1170716;
var summary = 'Add js shell functions to get last warning';

print(BUGNUMBER + ": " + summary);

// Warning for unreachable code.

enableLastWarning();
eval(`function f() { return 1; 2 + 2; }`);

warning = getLastWarning();
assertEq(warning !== null, true);
assertEq(warning.name, "Warning");
assertEq(warning.message.includes("unreachable code after return statement"), true);
assertEq(warning.lineNumber, 1);
assertEq(warning.columnNumber, 26);

// Disabled.

disableLastWarning();

eval(`function f() { return 1; 2 + 2; }`);

enableLastWarning();
warning = getLastWarning();
assertEq(warning, null);

disableLastWarning();

if (typeof reportCompare === "function")
  reportCompare(true, true);
