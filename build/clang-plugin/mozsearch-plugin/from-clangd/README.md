The facilities in this subdirectory are copied over from clangd
(https://clangd.llvm.org/).

The files here are currently copies of the following upstream files:
https://github.com/llvm/llvm-project/blob/2bcbcbefcd0f7432f99cc07bb47d1e1ecb579a3f/clang-tools-extra/clangd/HeuristicResolver.h
https://github.com/llvm/llvm-project/blob/2bcbcbefcd0f7432f99cc07bb47d1e1ecb579a3f/clang-tools-extra/clangd/HeuristicResolver.cpp

These facilities have since been moved out of clangd and exposed in the clang
API headers as clang/Sema/HeuristicResolver.h (llvm-project commit
ae932becb2c9), available as of clang 20. MozsearchIndexer.cpp consumes that
directly when building against clang 20 or newer, so the copy here is only
used, and only built, for older clang.

That means this copy does not need to be kept building against newer clang
APIs, and the whole subdirectory can be removed once the minimum supported
clang version reaches 20.
