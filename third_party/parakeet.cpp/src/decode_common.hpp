#pragma once
#include <cmath>
namespace pk {
// argmax over a[0..n): first index of the max (matches torch.max tie-break).
inline int decode_argmax(const float* a, int n) {
    int best = 0; float bv = a[0];
    for (int i = 1; i < n; ++i) if (a[i] > bv) { bv = a[i]; best = i; }
    return best;
}
// NeMo rescaled max_prob confidence over a[0..n) at index k:
//   conf = (N*p_max - 1)/(N - 1), p_max = softmax(a)[k]. Stable softmax.
inline float decode_max_prob_conf(const float* a, int n, int k) {
    float mx = a[0];
    for (int i = 1; i < n; ++i) if (a[i] > mx) mx = a[i];
    double denom = 0.0;
    for (int i = 0; i < n; ++i) denom += std::exp((double)a[i] - (double)mx);
    const double p_max = std::exp((double)a[k] - (double)mx) / denom;
    const double N = (double)n;
    return (float)((N * p_max - 1.0) / (N - 1.0));
}
} // namespace pk
