#include "diarization_head.hpp"
#include "ggml_graph.hpp"
#include "backend.hpp"
#include "ggml.h"
#include <cstring>
#include <stdexcept>
#include "moz-overrides.h"
#include <string>

namespace pk {

DiarizationHead::DiarizationHead(const ModelLoader& ml) : ml_(ml) {
    const auto& cfg = ml.config();
    d_model_   = (int)cfg.d_model;
    tf_d_model_ = (int)cfg.diarization.tf_d_model;
    n_spk_     = (int)cfg.diarization.n_speakers;
    upsample_  = (int)cfg.diarization.upsample_factor;
}

void DiarizationHead::forward(const std::vector<float>& enc_out, int T_enc,
                              std::vector<float>& probs, int& n_spk, int& T_out) const {
    if (T_enc <= 0 || enc_out.size() != (size_t)d_model_ * T_enc)
        throw std::runtime_error("parakeet: diarization head got a bad input shape");

    n_spk = n_spk_;
    const int up = upsample_;
    T_out = T_enc * up;

    const ModelLoader& ml = ml_;
    const int tf = tf_d_model_;

    pk::ensure_weights_realized(ml);

    const bool ok = pk::run_graph(0, 0,
        [&](ggml_context* ctx) -> ggml_tensor* {
            // enc_out is time-major [T_enc, d_model] = ggml ne=[d_model, T_enc].
            int64_t x_ne[2] = {d_model_, T_enc};
            ggml_tensor* x = pk::graph_input_tensor(ctx, GGML_TYPE_F32, 2, x_ne,
                                  const_cast<float*>(enc_out.data()),
                                  enc_out.size() * sizeof(float));

            // ---- encoder_proj: Linear(d_model -> tf) ----
            ggml_tensor* ep_w = pk::clone_weight(ctx, ml, "sortformer_modules.encoder_proj.weight");
            ggml_tensor* proj = ggml_mul_mat(ctx, ep_w, x);   // ne=[tf, T_enc]
            ggml_tensor* ep_b = pk::clone_weight_opt(ctx, ml, "sortformer_modules.encoder_proj.bias");
            if (ep_b) proj = ggml_add(ctx, proj, ep_b);

            // ---- subpixel_upsample: Conv1d(tf -> tf*up, k=3, pad=1) + bias ----
            // im2col + mul_mat in F32 (ggml_conv_1d would force an F16 im2col).
            // im2col wants data as ne=[T, IC, N]; proj is ne=[tf, T_enc].
            ggml_tensor* conv_in = ggml_cont(ctx, ggml_transpose(ctx, proj));
            conv_in = ggml_reshape_3d(ctx, conv_in, T_enc, tf, 1);

            // GGUF stores the PyTorch [OC, IC, k] weight as ggml ne=[k, IC, OC].
            ggml_tensor* spk_w = pk::clone_weight(ctx, ml, "sortformer_modules.subpixel_upsample.weight");
            ggml_tensor* cols = ggml_im2col(ctx, spk_w, conv_in, /*s0*/1, /*s1*/0,
                                            /*p0*/1, /*p1*/0, /*d0*/1, /*d1*/0,
                                            /*is_2D*/false, GGML_TYPE_F32);
            // cols: ne=[k*IC, T_enc, 1]
            cols = ggml_reshape_2d(ctx, cols, cols->ne[0], T_enc);
            ggml_tensor* w2d = spk_w->type == GGML_TYPE_F32
                ? spk_w : ggml_cast(ctx, spk_w, GGML_TYPE_F32);
            w2d = ggml_reshape_2d(ctx, w2d, spk_w->ne[0] * spk_w->ne[1], spk_w->ne[2]);
            ggml_tensor* conv_out = ggml_mul_mat(ctx, w2d, cols);
            // conv_out: ne=[OC=tf*up, T_enc], flat[c + t*OC]

            ggml_tensor* spk_b = pk::clone_weight_opt(ctx, ml, "sortformer_modules.subpixel_upsample.bias");
            if (spk_b) conv_out = ggml_add(ctx, conv_out, spk_b);

            // Subpixel shuffle, NeMo SortformerModules.upsample_hidden:
            //   conv(x).transpose(1,2).reshape(B, T, up, tf).reshape(B, T*up, tf)
            // so output frame t*up+u, hidden h reads conv channel u*tf+h at
            // frame t. With conv_out time-major (flat[u*tf + h + t*tf*up]) this
            // is a plain reshape: element (h, t*up+u) = flat[h + (t*up+u)*tf].
            ggml_tensor* upsampled = ggml_reshape_2d(ctx, conv_out, tf, (int64_t)T_enc * up);
            // ne[0]=tf, ne[1]=T_out

            // ---- forward_speaker_logits: relu -> Linear(tf->tf) -> relu -> Linear(tf->ns) -> sigmoid ----
            ggml_tensor* h = ggml_relu(ctx, upsampled);
            h = ggml_mul_mat(ctx, pk::clone_weight(ctx, ml, "sortformer_modules.first_hidden_to_hidden.weight"), h);
            ggml_tensor* fh_b = pk::clone_weight_opt(ctx, ml, "sortformer_modules.first_hidden_to_hidden.bias");
            if (fh_b) h = ggml_add(ctx, h, fh_b);
            h = ggml_relu(ctx, h);
            h = ggml_mul_mat(ctx, pk::clone_weight(ctx, ml, "sortformer_modules.single_hidden_to_spks.weight"), h);
            ggml_tensor* ss_b = pk::clone_weight_opt(ctx, ml, "sortformer_modules.single_hidden_to_spks.bias");
            if (ss_b) h = ggml_add(ctx, h, ss_b);
            // ne=[ns, T_out] -> speaker-major [ns][T_out] for the callers.
            return ggml_cont(ctx, ggml_transpose(ctx, ggml_sigmoid(ctx, h)));
        },
        probs);

    if (!ok) throw std::runtime_error("parakeet: diarization head graph failed");
}

} // namespace pk
