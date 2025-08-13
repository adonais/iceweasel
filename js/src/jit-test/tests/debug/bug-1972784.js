// |jit-test| error: TypeError: invalid getter usage; --setpref=experimental.self_hosted_cache=true; --ion-offthread-compile=off
a = newGlobal({ newCompartment: true });
Debugger(a).onEnterFrame = function () {};
this.__defineGetter__("foo", () => 5);
a.__defineGetter__("foo");
