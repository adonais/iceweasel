#include "ctc_decoder.hpp"
#include "ggml_graph.hpp"
#include "backend.hpp"
#include "ggml.h"
#include <cassert>
#include <cstring>
#include <stdexcept>
#include <string>
#include "moz-overrides.h"

namespace pk {

namespace {
// Resolve the CTC head linear-layer tensor (weight or bias). The hybrid
// EncDecHybridRNNTCTCBPEModel stores it under the `ctc_decoder.` prefix; a
// standalone EncDecCTCModelBPE (e.g. parakeet-ctc-0.6b) stores the SAME layer
// under the plain `decoder.` prefix. Try the hybrid name first, then fall back
// to the standalone name, and raise a clear error if neither exists.
ggml_tensor* ctc_head_tensor(const ModelLoader& ml, const char* suffix) {
    const std::string hybrid    = std::string("ctc_decoder.decoder_layers.0.") + suffix;
    const std::string standalone = std::string("decoder.decoder_layers.0.") + suffix;
    if (ggml_tensor* t = ml.tensor(hybrid))     return t;
    if (ggml_tensor* t = ml.tensor(standalone)) return t;
    throw std::runtime_error(
        "parakeet: CTC head tensor not found: tried '" + hybrid +
        "' (hybrid) and '" + standalone + "' (standalone EncDecCTCModelBPE)");
}
}  // namespace

CTCDecoder::CTCDecoder(const ModelLoader& ml) : ml_(ml) {
    d_model_     = (int)ml.config().d_model;
    vocab_plus_1_ = (int)ml.config().vocab_size + 1;
}

void CTCDecoder::forward(const std::vector<float>& enc, int d_model, int T,
                         std::vector<float>& logits, int& vocab_plus_1) const {
    assert(d_model == d_model_);
    assert((int)enc.size() == d_model * T);

    const int V = vocab_plus_1_;
    vocab_plus_1 = V;

    // Memory budget: weight [d_model, V], input [d_model, T], output [V, T].
    const size_t mem_bytes =
        (size_t)64 * 1024 * 1024 +
        (size_t)(d_model * V + d_model * T + V * T + V) * sizeof(float) * 4;

    const ModelLoader& ml = ml_;

    // Realize the loader's weights (CPU or device buffer) so the CTC head weight
    // and bias tensors have ->data/->buffer set and can be referenced directly as
    // graph leaves (the gallocr treats them as already-allocated). On a device
    // backend their ->data is a device pointer, so they must NEVER be copied as a
    // host source — referencing them as leaves keeps the read on the backend.
    pk::ensure_weights_realized(ml);

    bool ok = pk::run_graph(mem_bytes, /*n_threads=*/4,
        [&](ggml_context* ctx) -> ggml_tensor* {
            // ---- Input: enc [d_model, T] row-major, enc[c*T + t] ----
            // ggml ne[0]=d_model (fastest), ne[1]=T — so data layout is enc[t*d_model + c]
            // BUT our enc is row-major [d_model, T] = enc[c*T + t], i.e. T is fastest.
            // To match ggml layout where ne[0] is fastest, we store enc with ne[0]=T, ne[1]=d_model:
            //   ggml tensor: ne[0]=T, ne[1]=d_model → memory enc[t + T*d] = enc[d*T + t] ✓
            int64_t xt_ne[2] = {T, d_model};
            ggml_tensor* xt = pk::graph_input_tensor(ctx, GGML_TYPE_F32, 2, xt_ne,
                                  enc.data(), (size_t)d_model * T * sizeof(float));
            // xt: ne[0]=T (fastest), ne[1]=d_model → memory enc[d*T + t] ✓

            // ---- Weight: GGUF stores ne[0]=1, ne[1]=d_model, ne[2]=V ----
            // Squeeze k=1 dim → reshape to ne[0]=d_model, ne[1]=V.
            // Memory layout of weight: w[k + 1*c + d_model*v] = w[c + d_model*v]
            // So d_model (ne[0]) is fastest → correct for ggml_mul_mat contraction on ne[0].
            ggml_tensor* w3 = ctc_head_tensor(ml, "weight");
            assert(w3->type == GGML_TYPE_F32);
            // Reference the realized weight leaf DIRECTLY (it has ->data/->buffer
            // from ensure_weights_realized, so the gallocr treats it as already
            // allocated and never copies it — works for CPU and device buffers).
            // Reshape from [ne0=1, ne1=d_model, ne2=V] to [ne0=d_model, ne1=V].
            ggml_tensor* W = ggml_reshape_2d(ctx, w3, d_model, V);
            // W: ne[0]=d_model (fastest), ne[1]=V ✓

            // ---- Bias: [V] ----
            // Reference the realized bias leaf directly (already [V] f32).
            ggml_tensor* bsrc = ctc_head_tensor(ml, "bias");
            assert(bsrc->type == GGML_TYPE_F32);
            ggml_tensor* b = bsrc;

            // ---- Linear: ggml_mul_mat(W, xt) ----
            // ggml_mul_mat(A, B): A[ne0(A), ne1(A)], B[ne0(B), ne1(B)]
            // requires ne0(A) == ne0(B), contracts on ne0, output [ne1(A), ne1(B)].
            // W: ne0=d_model, ne1=V  (but we have xt: ne0=T, ne1=d_model)
            // W ne0=d_model ≠ xt ne0=T → need to transpose xt so ne0=d_model.
            //
            // Transpose xt: ggml_transpose gives a view with ne[0] and ne[1] swapped.
            // xt transposed: ne[0]=d_model, ne[1]=T  (now matches W ne0=d_model).
            ggml_tensor* xt_t = ggml_cont(ctx, ggml_transpose(ctx, xt));
            // xt_t: ne[0]=d_model (fastest after cont), ne[1]=T
            // ggml_mul_mat(W, xt_t): W[d_model, V], xt_t[d_model, T] → output [V, T]
            ggml_tensor* y = ggml_mul_mat(ctx, W, xt_t);
            // y: ne[0]=V, ne[1]=T → memory y[t*V + v] ✓

            // ---- Bias add: broadcast b[V] over T ----
            y = ggml_add(ctx, y, b);

            // ---- Log-softmax over vocab axis (ne[0]=V) ----
            // ggml_soft_max operates over ne[0] (the innermost dimension).
            // Our y has ne[0]=V, so softmax is over vocab ✓.
            ggml_tensor* sm  = ggml_soft_max(ctx, y);
            ggml_tensor* lsm = ggml_log(ctx, sm);
            // lsm: ne[0]=V, ne[1]=T → memory lsm[t*V + v] ✓
            return lsm;
        },
        logits);

    assert(ok && "ctc_decoder graph failed");
    (void)ok;
}

} // namespace pk
