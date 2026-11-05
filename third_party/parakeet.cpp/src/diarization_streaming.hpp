#pragma once
#include "model_loader.hpp"
#include "diarization_encoder.hpp"
#include "diarization_head.hpp"
#include <vector>

namespace pk {

// A finished speaker segment on the stream's timeline (seconds from stream start).
struct StreamingSpeakerSegment {
    int speaker;
    float start;
    float end;
};

// Streaming configuration, in ENCODER frames (80 ms), as in NeMo's
// SortformerModules. Input latency = (chunk_len + right_context) * 80 ms.
struct DiarStreamConfig {
    int spkcache_len = 264;   // speaker cache size
    int fifo_len = 0;         // FIFO of recent frames kept before the chunk
    int chunk_len = 264;      // frames diarized per step
    int left_context = 0;     // past frames re-encoded with the chunk
    int right_context = 0;    // look-ahead frames encoded with the chunk
    int update_period = 264;  // frames moved FIFO -> cache per update

    // The checkpoint's own configuration (NeMo diarize() default).
    static DiarStreamConfig from_model(const ParakeetConfig& cfg);
};

// Streaming latency presets from the Nemotron-3-Diarization model card.
enum class DiarLatency {
    Model = 0,     // the checkpoint's configuration (21.12 s for Nemotron-3)
    Low = 1,       // 1.04 s: chunk 9, look-ahead 4, FIFO 264
    VeryLow = 2,   // 0.64 s: chunk 6, look-ahead 2, FIFO 264
    UltraLow = 3,  // 0.32 s: chunk 3, look-ahead 1, FIFO 264
};

// The configuration for a preset. Model returns from_model(cfg).
DiarStreamConfig diar_stream_config(DiarLatency latency, const ParakeetConfig& cfg);

// StreamingDiarization — NeMo Sortformer cache-aware streaming ("AOSC"),
// synchronous mode (SortformerEncLabelModel.forward_streaming_step +
// SortformerModules.streaming_update), for nvidia/Nemotron-3-Diarization.
//
// Each chunk of mel frames is pre-encoded (FeatureStacking + projection +
// embed_norm) and the transformer + speaker head run over
// [speaker cache | FIFO | chunk]. The chunk's slice of the high-resolution
// output is the result for that chunk; the downsampled predictions drive the
// FIFO -> speaker-cache update and the score-based cache compression that
// keeps the speaker identities stable across chunks.
//
// Each chunk is encoded together with `left_context` past and `right_context`
// future frames, like NeMo's streaming_feat_loader; only the chunk itself is
// output and enters the cache update. A chunk runs once its look-ahead has
// arrived, so the input latency is (chunk_len + right_context) * 80 ms.
//
// The mel must be the un-normalized log-mel of the stream (NeMo does not
// peak-normalize in streaming mode), e.g. from pk::StreamingMel.
class StreamingDiarization {
public:
    // Uses the checkpoint's own streaming configuration.
    explicit StreamingDiarization(const ModelLoader& ml);
    StreamingDiarization(const ModelLoader& ml, const DiarStreamConfig& cfg);

    void reset();

    // Append mel frames, row-major [n_mels, n_frames] (mel[m*n_frames + t]),
    // any count including 0, and diarize every chunk whose look-ahead is now
    // available. is_last marks the end of the stream: the remaining frames
    // are diarized with whatever look-ahead exists, and every open segment
    // is closed. Returns the speaker segments that ENDED during this call.
    std::vector<StreamingSpeakerSegment> feed_mel(
        const std::vector<float>& mel, int n_mels, int n_frames, bool is_last);

    // Speaker probabilities output by the last feed_mel call, speaker-major
    // [n_speakers, last_frames()] (one frame per mel frame, 10 ms).
    const std::vector<float>& last_probs() const { return last_probs_; }
    int last_frames() const { return last_frames_; }

    // Segments still active at the end of the diarized audio, with `end` at
    // the diarized time (frames_done()).
    std::vector<StreamingSpeakerSegment> open_segments() const;

    const DiarStreamConfig& config() const { return scfg_; }
    // Mel frames per chunk, and how many must arrive before a chunk runs.
    int chunk_mel_frames() const { return scfg_.chunk_len * subsampling_; }
    int latency_mel_frames() const {
        return (scfg_.chunk_len + scfg_.right_context) * subsampling_;
    }
    int n_mels() const { return n_mels_; }
    int n_speakers() const { return n_spk_; }
    float frame_sec() const { return frame_sec_; }
    // Mel frames diarized so far (output frames, excluding look-ahead).
    long long frames_done() const { return frames_done_; }
    // Mel frames received so far.
    long long frames_in() const { return frames_in_; }

private:
    // One NeMo forward_streaming_step over the window [stt - left, end + right)
    // of the stream; appends the chunk's output to last_probs_.
    void step(long long stt, long long end, int left, int right, bool final_chunk,
              std::vector<StreamingSpeakerSegment>& closed);
    void streaming_update(const std::vector<float>& emb, int lc, int cl,
                          const std::vector<float>& preds, int spkcache_frames,
                          int fifo_frames);
    void compress_spkcache();
    void track_segments(const std::vector<float>& probs, int n_frames, bool is_last,
                        std::vector<StreamingSpeakerSegment>& out);

    const ModelLoader& ml_;
    DiarizationEncoder encoder_;
    DiarizationHead head_;

    int d_model_, n_spk_, subsampling_, upsample_, n_mels_;
    DiarStreamConfig scfg_;
    int sil_frames_per_spk_;
    float frame_sec_, onset_, offset_;
    float sil_threshold_, pred_score_threshold_, scores_boost_latest_;
    float strong_boost_rate_, weak_boost_rate_, min_pos_scores_rate_;
    bool use_learnable_sil_emb_ = false;
    std::vector<float> learnable_sil_emb_;   // [d_model]

    // Streaming state. Embeddings are time-major [frames, d_model];
    // predictions are [frames, n_spk] at encoder resolution.
    std::vector<float> spkcache_, spkcache_preds_;
    std::vector<float> fifo_, fifo_preds_;
    bool spkcache_compressed_ = false;
    std::vector<float> mean_sil_emb_;        // [d_model]
    long long n_sil_frames_ = 0;

    // Input buffer: frame-major mel frames [buf_start_, frames_in_).
    std::vector<float> buf_;
    long long buf_start_ = 0;
    long long frames_in_ = 0;
    long long next_stt_ = 0;                 // start frame of the next chunk

    // Output state.
    long long frames_done_ = 0;              // mel frames diarized
    std::vector<float> last_probs_;
    int last_frames_ = 0;
    std::vector<char> active_;               // per speaker
    std::vector<long long> start_frame_;     // per speaker, when active
};

} // namespace pk
