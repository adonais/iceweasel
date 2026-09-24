#pragma once
#include "model_loader.hpp"
#include <vector>

namespace pk {

// CTC decoder head — NeMo ConvASRDecoder.
//
// Architecture (hybrid model):
//   Conv1d(d_model, vocab+1, kernel=1) + log_softmax(dim=-1)
//
// This is a 1×1 convolution, which is a simple linear map per time step:
//   logits[t, v] = sum_c W[v,c] * enc[c,t] + b[v]
// followed by log_softmax over the vocab axis.
//
// Weight name: ctc_decoder.decoder_layers.0.{weight,bias}
//   weight GGUF ne[] = [1, d_model, vocab+1]  (k=1 squeezed to [d_model, vocab+1])
//   bias   GGUF ne[] = [vocab+1]
class CTCDecoder {
public:
    explicit CTCDecoder(const ModelLoader& ml);

    // enc:    row-major [d_model, T]  — enc[c*T + t]
    // logits: row-major [T, vocab+1] — logits[t*(vocab+1) + v]  (post-log_softmax)
    void forward(const std::vector<float>& enc, int d_model, int T,
                 std::vector<float>& logits, int& vocab_plus_1) const;

private:
    const ModelLoader& ml_;
    int d_model_;
    int vocab_plus_1_;
};

} // namespace pk
