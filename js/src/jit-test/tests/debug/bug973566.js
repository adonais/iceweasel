Object.prototype[1] = 'peek';
var g = newGlobal({newCompartment: true});
var dbg = Debugger(g);
dbg.onEnterFrame = function (frame) {
    frame.script.getPossibleBreakpoints();
};
g.eval("1;");
