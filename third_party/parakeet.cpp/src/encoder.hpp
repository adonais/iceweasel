#pragma once
#include "model_loader.hpp"
#include <vector>
namespace pk {

// Full FastConformer encoder (NeMo ConformerEncoder.forward / forward_internal):
//
//   mel [n_mels, T] -> Subsampling (dw_striding ÷8) -> [T', d_model]
//                   -> (if xscaling) x *= sqrt(d_model)
//                   -> RelPositionalEncoding produces pos_emb [2T'-1, d_model]
//                   -> for i in 0..n_layers-1: ConformerLayer(i).forward(...)
//                   -> transpose to [d_model, T']  (NeMo returns [B, d_model, T'])
//
// The `valid_len` (number of non-pad output frames) is derived from Subsampling
// and threaded into every ConformerLayer (attention + conv pad masking).
// A batch of clips' mel features, pre-stacked to T_max.
struct MelBatch {
    std::vector<float> data;     // contiguous [B][n_mels][T_max], row-major: data[(b*n_mels + m)*T_max + t]
    int n_mels = 0;
    int T_max  = 0;              // padded time length (max over clips)
    int B      = 0;
    std::vector<int> valid_T;    // per-item true mel frame count, size B (<= T_max)
};

class Encoder {
public:
    explicit Encoder(const ModelLoader& ml);

    // mel: row-major [n_mels, T] (feat-major inner = T), i.e. mel[m*T + t].
    // enc_out: row-major [d_model, Tout] (channels-first, time fastest), matching
    //          the baseline `encoder_out` orientation: enc_out[c*Tout + t].
    void forward(const std::vector<float>& mel, int n_mels, int T,
                 std::vector<float>& enc_out, int& d_model, int& Tout) const;

    // Batched encoder. Runs all B clips through ONE fused ggml graph
    // (subsampling -> conformer stack -> output). Returns per-item encoder
    // outputs, each row-major [d_model, valid_Tout[b]] (channels-first), the same
    // orientation as forward(): each enc_outs[b] is compacted to that item's
    // non-pad frame count so its row stride equals valid_Tout[b] (pad-derived
    // trailing frames are dropped). `d_model` and `Tout` (the padded T') are
    // filled; `valid_Tout` holds each item's non-pad output-frame count (size B).
    // For B=1 this reduces to forward().
    void forward_batch(const MelBatch& mels,
                       std::vector<std::vector<float>>& enc_outs,
                       int& d_model, int& Tout,
                       std::vector<int>& valid_Tout) const;

    // Long-audio tiled variant of forward_batch: subsampling is done per item via
    // Subsampling::forward_tiled (which bounds intermediate tensor size so the
    // >2^31-element conv tensors that crash long clips never materialise), then
    // the pre-subsampled features are fed into the existing post-subsampling graph
    // (xscaling + positional encoding + conformer stack). Same output contract as
    // forward_batch. `tile_out_frames` = subsampled output frames per tile.
    void forward_batch_tiled(const MelBatch& mels,
                             std::vector<std::vector<float>>& enc_outs,
                             int& d_model, int& Tout,
                             std::vector<int>& valid_Tout,
                             int tile_out_frames) const;

    // Same as forward(), but also captures the per-layer outputs at indices
    // `capture_layers` (each row-major [T', d_model]) into `layer_outs` (parallel
    // to capture_layers). Used by the parity test to localize divergence.
    void forward_capture(const std::vector<float>& mel, int n_mels, int T,
                         std::vector<float>& enc_out, int& d_model, int& Tout,
                         const std::vector<int>& capture_layers,
                         std::vector<std::vector<float>>& layer_outs) const;

private:
    // Mirrors forward_batch's post-subsampling body (xscaling + positional
    // encoding + conformer stack + per-item channels-first split) for the tiled
    // path, but takes the already-subsampled features `x0_host` ([d_model, Tp, B]
    // in ggml order, element (c,t,b) at ((size_t)b*Tp+t)*d_model+c) injected as a
    // graph input instead of building them from sub.build_graph_batched. `vout`
    // holds the per-item valid output-frame counts. `x0_host` must outlive the
    // call (run_graph is synchronous), which it does as a by-reference parameter.
    void run_post_subsampling_batch(const std::vector<float>& x0_host,
            int Tp, int B, const std::vector<int>& vout,
            std::vector<std::vector<float>>& enc_outs, int& d_model, int& Tout,
            std::vector<int>& valid_Tout) const;

    const ModelLoader& ml_;
    int d_model_;
    int n_layers_;
    bool xscaling_;
};

} // namespace pk
