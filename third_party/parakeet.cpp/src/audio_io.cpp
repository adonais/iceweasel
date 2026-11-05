#include "audio_io.hpp"
#include <cmath>

namespace pk {

std::vector<float> resample_linear(const std::vector<float>& in, int in_sr, int out_sr) {
    if (in_sr == out_sr || in.empty()) return in;
    const double ratio = (double)out_sr / (double)in_sr;
    const size_t n_out = (size_t)std::floor(in.size() * ratio);
    std::vector<float> out(n_out);
    for (size_t i = 0; i < n_out; ++i) {
        const double src = i / ratio;
        const size_t i0 = (size_t)src;
        const double frac = src - i0;
        const float a = in[i0];
        const float b = (i0 + 1 < in.size()) ? in[i0 + 1] : a;
        out[i] = (float)(a + (b - a) * frac);
    }
    return out;
}

bool load_audio_16k_mono(const std::string& path, Audio& out) {
    (void)path;
    (void)out;
    return false;
}

bool load_audio_16k_mono_from_memory(const void* data, size_t size, Audio& out) {
    (void)data;
    (void)size;
    (void)out;
    return false;
}

} // namespace pk
