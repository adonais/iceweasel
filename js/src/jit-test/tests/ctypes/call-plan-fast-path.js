// Repeatedly invoke non-variadic function pointers through FunctionType::Call,
// which on x86-64 routes through libffi's reusable ffi_call_plan. Uses JS-backed
// closures so no native library is needed, and covers the argument shapes and
// return widths that select different plan branches (GP-register thunk, SSE,
// mixed, stack-spilled) and the large struct return passed via hidden pointer,
// plus the struct-argument case that falls back to ffi_call. The results must
// match regardless of whether the accelerated path is taken.

function test() {
  const abi = ctypes.default_abi;
  const N = 1000;

  // Pure 64-bit GP integer args in registers: the GP direct-thunk path.
  // Identity pass-through avoids Int64 arithmetic; the value round-trips back
  // to int64_t.
  const gp = ctypes.FunctionType(abi, ctypes.int64_t,
                                 [ctypes.int64_t, ctypes.int64_t,
                                  ctypes.int64_t]).ptr((a, b, c) => b);
  for (let i = 0; i < N; ++i) {
    assertEq(gp(ctypes.Int64(i), ctypes.Int64(i + 1),
               ctypes.Int64(i + 2)).toString(),
             String(i + 1));
  }

  // More 64-bit GP args than argument registers: exercises register moves plus
  // stack-spilled moves. Returns the last (spilled) argument.
  const gpSpill = ctypes.FunctionType(abi, ctypes.int64_t,
                                      Array(8).fill(ctypes.int64_t))
                      .ptr((...xs) => xs[7]);
  for (let i = 0; i < N; ++i) {
    assertEq(gpSpill(ctypes.Int64(i), ctypes.Int64(i + 1), ctypes.Int64(i + 2),
                     ctypes.Int64(i + 3), ctypes.Int64(i + 4),
                     ctypes.Int64(i + 5), ctypes.Int64(i + 6),
                     ctypes.Int64(i + 7)).toString(),
             String(i + 7));
  }

  // All-double args and return: the SSE fast path with an XMM64 return store.
  const sse = ctypes.FunctionType(abi, ctypes.double,
                                  [ctypes.double, ctypes.double])
                  .ptr((a, b) => a + b);
  for (let i = 0; i < N; ++i) {
    assertEq(sse(i + 0.5, i + 0.25), 2 * i + 0.75);
  }

  // Float args and return: the XMM32 return store (distinct from double).
  const f32 = ctypes.FunctionType(abi, ctypes.float,
                                  [ctypes.float, ctypes.float])
                  .ptr((a, b) => a + b);
  for (let i = 0; i < N; ++i) {
    assertEq(f32(0.5, 0.25), 0.75);
  }

  // Mixed integer/float args: sign-extended GP moves alongside an SSE move.
  const mixed = ctypes.FunctionType(abi, ctypes.double,
                                    [ctypes.int32_t, ctypes.double,
                                     ctypes.int32_t])
                    .ptr((a, b, c) => a + b + c);
  for (let i = 0; i < N; ++i) {
    assertEq(mixed(i, 0.5, -i), 0.5);
  }

  // Void return: the null-rvalue / UNIX64_RET_VOID branch.
  let sideEffect = 0;
  const v = ctypes.FunctionType(abi, ctypes.void_t, [ctypes.int32_t])
                .ptr(x => { sideEffect = x; });
  for (let i = 0; i < N; ++i) {
    v(i);
    assertEq(sideEffect, i);
  }

  // Struct-by-value argument: no fast plan, so this exercises the ffi_call
  // fallback inside ffi_call_plan_invoke.
  const Point = ctypes.StructType("Point",
                                  [{ x: ctypes.int32_t },
                                   { y: ctypes.int32_t }]);
  const agg = ctypes.FunctionType(abi, ctypes.int32_t, [Point])
                  .ptr(p => p.x + p.y);
  for (let i = 0; i < N; ++i) {
    assertEq(agg(new Point(i, i + 1)), 2 * i + 1);
  }

  // Large struct return (> 16 bytes): returned via a hidden pointer, the
  // ret_in_mem / UNIX64_FLAG_RET_IN_MEM branch.
  const Big = ctypes.StructType("Big", [{ a: ctypes.int64_t },
                                        { b: ctypes.int64_t },
                                        { c: ctypes.int64_t }]);
  const mkBig = ctypes.FunctionType(abi, Big, [ctypes.int64_t])
                    .ptr(x => Big(x, x, x));
  for (let i = 0; i < N; ++i) {
    const r = mkBig(ctypes.Int64(i));
    assertEq(r.a.toString(), String(i));
    assertEq(r.c.toString(), String(i));
  }
}

if (typeof ctypes === "object") {
  test();
}
