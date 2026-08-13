// When a nested arrow closes over `arguments`, the enclosing ordinary function
// must own its own `arguments` binding so the arrow captures that frame's
// arguments. The frontend's UsedNameInfo::isClosedOver() only inspected the
// last recorded use, so a later `arguments` use in a newer lexical scope of the
// same function could hide the arrow's (earlier, nested-script) use. That made
// isClosedOver() report false, declareFunctionArgumentsObject() omit the local
// binding, and the arrow bind to the next farther function's arguments.
//
// Each case wraps `outer` in a `factory` with distinct arguments so a leak of
// the enclosing frame's arguments is observable: the captured arrow must return
// outer's own arguments ([1, 2, 3]), never factory's ([10, 20, 30, 40, 50]).

function assertArgs(arrow, expected) {
  var args = arrow();
  assertEq(args.length, expected.length);
  for (var i = 0; i < expected.length; i++) {
    assertEq(args[i], expected[i]);
  }
}

// Control: the arrow's use is the only/last use, so isClosedOver() is correct.
(function() {
  function factory() {
    return function outer() {
      const capture = () => arguments;
      return capture;
    };
  }
  assertArgs(factory(10, 20, 30, 40, 50)(1, 2, 3), [1, 2, 3]);
})();

// A later use in a newer nested lexical scope must not hide the arrow's use.
(function() {
  function factory() {
    return function outer() {
      const capture = () => arguments;
      {
        const count = arguments.length;
        return capture;
      }
    };
  }
  assertArgs(factory(10, 20, 30, 40, 50)(1, 2, 3), [1, 2, 3]);
})();

// A later use in the same scope (no new lexical scope) stays correct.
(function() {
  function factory() {
    return function outer() {
      const capture = () => arguments;
      const count = arguments.length;
      return capture;
    };
  }
  assertArgs(factory(10, 20, 30, 40, 50)(1, 2, 3), [1, 2, 3]);
})();

// A later use nested two lexical blocks deep must not hide the arrow's use.
(function() {
  function factory() {
    return function outer() {
      const capture = () => arguments;
      {
        {
          const count = arguments.length;
          return capture;
        }
      }
    };
  }
  assertArgs(factory(10, 20, 30, 40, 50)(1, 2, 3), [1, 2, 3]);
})();

// The arrow's use appearing after a same-scope use stays correct.
(function() {
  function factory() {
    return function outer() {
      const count = arguments.length;
      const capture = () => arguments;
      return capture;
    };
  }
  assertArgs(factory(10, 20, 30, 40, 50)(1, 2, 3), [1, 2, 3]);
})();

// Two arrows with a later block use between them: both must capture outer.
(function() {
  function factory() {
    return function outer() {
      const first = () => arguments;
      {
        const count = arguments.length;
      }
      const second = () => arguments;
      return [first, second];
    };
  }
  const pair = factory(10, 20, 30, 40, 50)(1, 2, 3);
  assertArgs(pair[0], [1, 2, 3]);
  assertArgs(pair[1], [1, 2, 3]);
})();

// Arrow declared in one block, later use in a sibling block, must not hide it.
(function() {
  function factory() {
    return function outer() {
      let capture;
      {
        capture = () => arguments;
      }
      {
        const count = arguments.length;
      }
      return capture;
    };
  }
  assertArgs(factory(10, 20, 30, 40, 50)(1, 2, 3), [1, 2, 3]);
})();

// Same elision, but with strict-mode (unmapped) arguments.
(function() {
  "use strict";
  function factory() {
    return function outer() {
      const capture = () => arguments;
      {
        const count = arguments.length;
        return capture;
      }
    };
  }
  assertArgs(factory(10, 20, 30, 40, 50)(1, 2, 3), [1, 2, 3]);
})();
