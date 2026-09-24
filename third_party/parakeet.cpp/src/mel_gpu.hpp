#pragma once
#include "mel.hpp"            // reuse MelKernel for config + window_ + fb_
#include <vector>
namespace pk {

// GPU-capable log-mel front end. Reproduces MelFrontend::compute exactly, except
// the per-frame rfft is replaced by a DFT expressed as a matmul so the heavy
// STFT/power/filterbank/log runs as ONE ggml graph on the selected backend (GPU
// when one is active). The host-side preemphasis/framing/windowing and the
// per-feature normalization are kept bit-for-bit identical to MelFrontend (the
// CPU path is untouched; this is only used when the backend is non-CPU).
//
// Numerics differ from MelFrontend only by the FFT->DFT-matmul substitution
// (f32 matmul vs the float radix-2 rfft), which is a small per-element delta.
class GpuMel {
public:
    explicit GpuMel(const ModelLoader& ml);
    // Same contract as MelFrontend::compute. feats row-major [n_mels, T]
    // (feat-major, feats[m*T+t]).
    void compute(const std::vector<float>& samples, std::vector<float>& feats,
                 int& n_mels, int& T) const;
private:
    MelKernel k_;                 // window_, fb_, n_fft_, hop_, n_mels_, n_bins_, ...
    std::vector<float> dft_cos_;  // [n_bins, n_fft] row-major: cos(2*pi*b*n/n_fft)
    std::vector<float> dft_sin_;  // [n_bins, n_fft] row-major: -sin(2*pi*b*n/n_fft)
};

} // namespace pk
