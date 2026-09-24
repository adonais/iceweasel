#pragma once
#include <cstddef>
#include <memory>
#include <vector>

namespace pk {

// Host-side scratch for graph builders. The fused encoder builds ONE graph in a
// single Backend::compute build lambda; every host-computed input (the mel
// transpose, attention/conv pad masks, batch-norm fold scale/shift) is fed via
// pk::graph_input_tensor, whose bytes are copied into the gallocr buffer AFTER
// the graph is allocated. So those host buffers must stay alive until
// Backend::compute returns. A GraphInputPool owns them with stable addresses
// (unique_ptr) so callers can keep appending more without invalidating earlier
// pointers. One pool is created per Backend::compute and outlives the build.
class GraphInputPool {
public:
    // Allocate an n-float buffer owned by the pool; returns a stable pointer.
    std::vector<float>& alloc_f32(size_t n) {
        bufs_.emplace_back(new std::vector<float>(n));
        return *bufs_.back();
    }
    // Allocate an empty buffer to be filled by the caller (stable address).
    std::vector<float>& alloc_f32() {
        bufs_.emplace_back(new std::vector<float>());
        return *bufs_.back();
    }
private:
    std::vector<std::unique_ptr<std::vector<float>>> bufs_;
};

} // namespace pk
