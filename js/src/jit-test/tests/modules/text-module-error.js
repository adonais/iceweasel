// |jit-test| skip-if: getBuildConfiguration("release_or_beta"); --enable-import-text

try {
    parseModule(42, "text-module-error.js", "text");
    throw new Error("unreachable");
} catch (error) {
    assertEq(error.message, "expected text string, got number");
}
