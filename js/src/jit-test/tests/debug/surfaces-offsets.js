// Invalid offsets result in exceptions, not bogus results.

load(libdir + "asserts.js");

var g = newGlobal({newCompartment: true});
var dbg = Debugger(g);
var hits;
dbg.onDebuggerStatement = function (frame) {
    assertEq(frame.script.getOffsetMetadata(frame.offset).lineNumber, g.line);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(String(frame.offset)).lineNumber; }, Error);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(Object(frame.offset)).lineNumber; }, Error);

    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(-1).lineNumber; }, Error);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(1000000).lineNumber; }, Error);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(0.25).lineNumber; }, Error);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(+Infinity).lineNumber; }, Error);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(-Infinity).lineNumber; }, Error);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(NaN).lineNumber; }, Error);

    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(false).lineNumber; }, Error);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(true).lineNumber; }, Error);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata(undefined).lineNumber; }, Error);
    assertThrowsInstanceOf(function () { frame.script.getOffsetMetadata().lineNumber; }, Error);

    // We assume that at least one whole number between 0 and frame.offset is invalid.
    assertThrowsInstanceOf(
        function () {
            for (var i = 0; i < frame.offset; i++)
                frame.script.getOffsetMetadata(i).lineNumber;
        },
        Error);

    hits++;
};

hits = 0;
g.eval("var line = new Error().lineNumber; debugger;");
