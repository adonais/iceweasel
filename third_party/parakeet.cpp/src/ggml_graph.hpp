#pragma once
#include <functional>
#include <vector>

struct ggml_context;
struct ggml_tensor;

namespace pk {

// One-shot CPU graph runner.
//
// Allocates a ggml context of `mem_bytes` (no_alloc=false, so tensor data is
// stored inline in the context buffer). Calls `build(ctx)` which must create
// input tensors, write their data, build the computation graph, and return the
// output tensor. Then the forward graph for that output is built, executed on
// CPU with `n_threads` threads, and `ggml_nelements(output)` f32 values are
// copied into `out`. Returns true on success, false on any failure.
bool run_graph(size_t mem_bytes, int n_threads,
               const std::function<ggml_tensor*(ggml_context*)>& build,
               std::vector<float>& out);

// Process-global override for the ggml compute thread count.
//
// `run_graph` reads this override and, when it has been explicitly set to a
// positive value, uses it in place of the per-call `n_threads` argument that
// the components pass. This lets a single `--threads N` switch control EVERY
// graph computation (the encoder is the bulk) without threading a thread-count
// parameter through every component.
//
// The default (0 == "unset") means: honor whatever `n_threads` each caller
// passes. So existing behavior — and the test suite, which never sets this —
// is unchanged. Setting it back to 0 clears the override.
void set_num_threads(int n);
int  num_threads();  // current override (0 == unset)

// Gallocr buffer size (bytes) reserved for the most recent single-backend (CPU)
// run_graph compute. Used by tests to assert that banded attention memory scales
// O(T*window), not O(T^2). Reflects the high-water mark of the persistent
// gallocr, so query it after a fresh run at the size of interest.
size_t last_graph_alloc_bytes();

class Backend;
// The process-global persistent Backend (created lazily on first use). Exposed
// so the weight-realization path can give the loader's tensors a backend buffer
// on the SAME CPU backend that graphs run on.
Backend& global_backend();

// Free the process-global backend. Call once at program exit (after all model
// objects are destroyed) so GPU backends release device memory while the driver
// is still alive — otherwise static destruction frees it after the CUDA atexit
// handler and aborts. A later global_backend() call recreates it.
void shutdown_backend();

} // namespace pk
