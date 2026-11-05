#include "parakeet_capi.h"
#include "parakeet.h"     // pk::Decoder
#include "model.hpp"      // pk::Model
#include "diarization.hpp" // pk::DiarizationModel
#include "diarization_streaming.hpp" // pk::StreamingDiarization
#include "streaming.hpp"  // pk::StreamingSession
#include "ced_tagger.hpp" // pk::CedTagger
#include "sound_stream.hpp" // pk::SoundStream
#include "mel.hpp"        // pk::MelFrontend
#include "sas_merge.hpp"  // pk::merge_asr_diarization, pk::group_speaker_words
#include "diar_pcm_stream.hpp" // pk::DiarPcmStream
#include "scene_stream.hpp" // pk::SceneStream

#include "transcription.hpp"  // pk::Transcription, pk::Word
#include "transcription_json.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <memory>
#include <new>
#include <string>
#include <vector>
#include "moz-overrides.h"

// ABI version. Bump on breaking changes.
// v3: target_lang variants (transcribe_path_lang / transcribe_pcm_lang /
//     stream_begin_lang / transcribe_pcm_batch_json_lang /
//     transcribe_pcm_batch_lang) for multilingual prompt-conditioned (nemotron)
//     models.
// v4: streaming JSON entry points (stream_feed_json / stream_finalize_json) that
//     surface per-word timestamps (start/end/conf) plus frame_sec alongside the
//     newly-finalized text + eou flag, and a "frame_sec" field added to the
//     transcribe_*_json documents. Original entry points unchanged.
// v5: <EOU> vs <EOB> distinction across the C boundary. BREAKING semantics:
//     stream_feed's *eou_out is now a bitmask (PARAKEET_EVENT_EOU |
//     PARAKEET_EVENT_EOB) instead of an any-event 0/1, and the JSON "eou"
//     field now means "an <EOU> fired" only, with a new "eob" field beside it.
//     Added stream_drain_events / free_events (typed per-event records) and
//     the "events" array in the stream_feed_json / stream_finalize_json
//     documents.
// v6-v8: additive upstream APIs for CTC logits, diarization, and sound-event
// detection. Firefox-local streaming helpers are additive as well.
#define PARAKEET_CAPI_ABI_VERSION 8

// The opaque context: a loaded model plus a buffer for the last error message.
// Exactly one of `model` / `diar` / `tagger` is non-null: ASR models use
// `model`, diarization models (Sortformer) use `diar`, CED sound-event
// taggers use `tagger`.
struct parakeet_ctx {
    std::unique_ptr<pk::Model> model;
    std::unique_ptr<pk::DiarizationModel> diar;
    std::unique_ptr<pk::CedTagger> tagger;
    std::string last_error;
};

// The opaque streaming session: a pk::StreamingSession over the ctx's model plus
// an INCREMENTAL log-mel front end (pk::StreamingMel).
//
// `feed` turns the just-arrived 16 kHz mono PCM into the newly-ready mel frames
// via StreamingMel (frame-local, NO full-buffer recompute — see mel.hpp), grows
// the accumulated mel-frame buffer, then incrementally decodes any encoder
// chunks for which enough mel frames (and right context) are now buffered,
// carrying the encoder/decoder caches across feeds — so a live consumer gets
// partial text as audio arrives. Committed chunks are not re-decoded.
//
// The streaming model uses normalize="NA" (frame-local mel, no whole-utterance
// stats), so the incremental mel is bit-identical to MelFrontend::compute on the
// full clip (see tests/test_streaming_mel.cpp); only the accumulated mel frames
// (NOT the raw PCM) are retained, and StreamingMel itself keeps only ~n_fft
// recent samples.
//
// `finalize` appends StreamingMel's end zero-pad tail frames, then flushes the
// streaming decoder tail: it decodes the final (partial) chunk with
// keep_all_outputs so the trailing encoder frames complete, then returns any
// remaining text. It does NOT fabricate an <EOU> NeMo's streaming would not emit.
struct parakeet_stream {
    parakeet_ctx* ctx = nullptr;             // borrowed (must outlive the stream)
    std::unique_ptr<pk::StreamingMel> mel;   // incremental log-mel front end
    // mel_buf holds ONLY the still-reachable window of mel history, feat-major
    // [n_mels, mel_T - mel_buf_origin]; column 0 is ABSOLUTE frame mel_buf_origin
    // (see append_mel_frames / feed_available's window()). Frames strictly
    // before mel_buffer_idx - pre_encode_cache_size() can never be read again
    // (mel_buffer_idx only advances -- see feed_available), so they are dropped
    // as they age out instead of being retained for the life of the stream.
    std::vector<float> mel_buf;
    int n_mels = 0;
    int mel_T = 0;                           // total mel frames accumulated so far (absolute)
    int mel_buf_origin = 0;                  // absolute frame index of mel_buf's column 0
    std::unique_ptr<pk::StreamingSession> sess;
    int mel_buffer_idx = 0;                  // next un-fed mel frame (chunk schedule)
    bool first_chunk = true;                 // chunk 0 has no pre-encode overlap
    bool finalized = false;
};

namespace {
// Append `n_new` feat-major mel frames `[n_mels, n_new]` to the stream's
// accumulated feat-major mel buffer, growing mel_T, and drop the prefix that
// feed_available's window() can provably never read again.
//
// ROOT CAUSE of mudler/parakeet.cpp#63 (the streaming RSS leak): the mel buffer
// used to retain the FULL stream history from mel_buffer_idx==0 forever, so
// this function rebuilt a `[n_mels, T]` array from scratch on EVERY stream_feed
// call with T monotonically growing for the life of the stream -- not just O(T)
// CPU per call (the reason this rebuild exists at all, per the original
// comment), but a continuous sequence of UNIQUELY, EVER-LARGER-sized heap
// allocations. A general-purpose allocator can never satisfy a strictly-larger
// request from a smaller freed block, so the freed (now too-small) blocks from
// every earlier call accumulate as unusable, unreturned pages instead of being
// recycled -- the process's live working set stays tiny (a few MB) but the
// CUMULATIVE allocator debt grows with the stream's length, which is exactly
// why the upstream report finds it reclaimed by neither stream_free nor a
// fresh stream_begin: it is allocator-level fragmentation from the discarded
// buffers' sizes, not stream-owned memory.
//
// feed_available's window(lo, hi) only ever reads lo >= mel_buffer_idx -
// pre_cache, and mel_buffer_idx is monotonically non-decreasing (it only moves
// forward by chunk_size). So at the START of any call here (mel_buffer_idx
// unchanged since the previous feed_available pass), every mel frame before
// mel_buffer_idx - pre_cache is provably dead and safe to drop; mel_buf then
// stays bounded to O(pre_cache + chunk_size) -- a small constant -- instead of
// O(stream length), for the life of the stream.
void append_mel_frames(parakeet_stream* s, const std::vector<float>& frames, int n_new) {
    if (n_new <= 0) return;
    const int n_mels = s->n_mels;
    const int old_T = s->mel_T;                 // absolute frame count so far
    const int new_T = old_T + n_new;

    const int pre_cache = s->sess ? s->sess->pre_encode_cache_size() : 0;
    int keep_from = s->mel_buffer_idx - pre_cache;
    if (keep_from < s->mel_buf_origin) keep_from = s->mel_buf_origin;  // never move backward
    if (keep_from > old_T) keep_from = old_T;                          // never past what exists

    const int old_local_T = old_T - s->mel_buf_origin;   // mel_buf's current column count
    const int drop_local   = keep_from - s->mel_buf_origin;  // columns to drop from the front
    const int kept         = old_local_T - drop_local;       // columns carried forward
    const int new_local_T  = kept + n_new;

    std::vector<float> out((size_t)n_mels * new_local_T);
    for (int m = 0; m < n_mels; ++m) {
        // carry forward the still-reachable tail [drop_local, old_local_T)
        for (int t = 0; t < kept; ++t)
            out[(size_t)m * new_local_T + t] =
                s->mel_buf[(size_t)m * old_local_T + (drop_local + t)];
        // append the newly-arrived frames
        for (int t = 0; t < n_new; ++t)
            out[(size_t)m * new_local_T + (kept + t)] = frames[(size_t)m * n_new + t];
    }
    s->mel_buf.swap(out);
    s->mel_T = new_T;
    s->mel_buf_origin = keep_from;
}
} // namespace

namespace {

// Map the C decoder int to pk::Decoder. Unknown values fall back to default.
pk::Decoder to_decoder(int decoder) {
    switch (decoder) {
        case 1:  return pk::Decoder::kCTC;
        case 2:  return pk::Decoder::kTDT;
        case 0:
        default: return pk::Decoder::kDefault;
    }
}

// malloc a NUL-terminated copy of `s` so a C consumer frees it with free()
// (matching parakeet_capi_free_string). Returns NULL on OOM.
char* dup_to_c(const std::string& s) {
    char* buf = static_cast<char*>(std::malloc(s.size() + 1));
    if (!buf) return nullptr;
    std::memcpy(buf, s.data(), s.size());
    buf[s.size()] = '\0';
    return buf;
}

} // namespace

extern "C" int parakeet_capi_abi_version(void) {
    return PARAKEET_CAPI_ABI_VERSION;
}

extern "C" parakeet_ctx* parakeet_capi_load(const char* gguf_path) {
    if (!gguf_path) return nullptr;
    try {
        auto* ctx = new (std::nothrow) parakeet_ctx();
        if (!ctx) return nullptr;

        // A CED GGUF (general.architecture "ced") is a sound tagger. Check the
        // header first: the ASR loader would misread it.
        if (pk::gguf_is_ced(gguf_path)) {
            ctx->tagger = pk::CedTagger::load(gguf_path);
            if (ctx->tagger) return ctx;
            delete ctx;
            return nullptr;
        }

        // Try ASR first. Model::load returns nullptr if the GGUF is not a
        // valid ASR model (bad/missing file, or arch=="diarization" which
        // Model::load rejects). Then try diarization.
        std::unique_ptr<pk::Model> model = pk::Model::load(gguf_path);
        if (model) {
            ctx->model = std::move(model);
            return ctx;
        }

        // Not an ASR model — try diarization.
        std::unique_ptr<pk::DiarizationModel> diar = pk::DiarizationModel::load(gguf_path);
        if (diar) {
            ctx->diar = std::move(diar);
            return ctx;
        }

        // Neither — load failed entirely.
        delete ctx;
        return nullptr;
    } catch (...) {
        // Never let an exception cross the boundary.
        return nullptr;
    }
}

extern "C" size_t parakeet_capi_weights_bytes(const parakeet_ctx* ctx) {
    if (!ctx || !ctx->model) return 0;
    return ctx->model->weights_bytes();
}

// Firefox-local: load from an already-open fd (sandboxed host).
extern "C" parakeet_ctx* parakeet_capi_load_fd(int fd) {
    if (fd < 0) return nullptr;
    try {
        std::unique_ptr<pk::Model> model = pk::Model::load_fd(fd);
        if (!model) return nullptr;
        auto* ctx = new (std::nothrow) parakeet_ctx();
        if (!ctx) return nullptr;
        ctx->model = std::move(model);
        return ctx;
    } catch (...) {
        return nullptr;
    }
}

extern "C" void parakeet_capi_free(parakeet_ctx* ctx) {
    delete ctx;  // safe on nullptr; ~unique_ptr releases the model.
}

extern "C" char* parakeet_capi_transcribe_path_lang(parakeet_ctx* ctx,
                                                    const char* wav_path, int decoder,
                                                    const char* target_lang) {
    if (!ctx) return nullptr;
    if (!ctx->model) {
        ctx->last_error = ctx->diar
            ? "context holds a diarization model; use parakeet_capi_diarize_*"
            : "context has no loaded model";
        return nullptr;
    }
    if (!wav_path)   { ctx->last_error = "wav_path is NULL"; return nullptr; }
    // NULL / "" -> model default language (ignored by non-prompt models).
    const std::string lang = target_lang ? target_lang : "";
    try {
        std::string text = ctx->model->transcribe_path(wav_path, to_decoder(decoder), lang);
        ctx->last_error.clear();
        char* out = dup_to_c(text);
        if (!out) { ctx->last_error = "out of memory"; return nullptr; }
        return out;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        ctx->last_error = "unknown error";
        return nullptr;
    }
}

extern "C" char* parakeet_capi_transcribe_path(parakeet_ctx* ctx,
                                               const char* wav_path, int decoder) {
    // Delegate with the model default language.
    return parakeet_capi_transcribe_path_lang(ctx, wav_path, decoder, nullptr);
}

extern "C" char* parakeet_capi_transcribe_pcm_lang(parakeet_ctx* ctx,
                                                   const float* samples, int n_samples,
                                                   int sample_rate, int decoder,
                                                   const char* target_lang) {
    if (!ctx) return nullptr;
    if (!ctx->model) {
        ctx->last_error = ctx->diar
            ? "context holds a diarization model; use parakeet_capi_diarize_*"
            : "context has no loaded model";
        return nullptr;
    }
    if (!samples || n_samples < 0) { ctx->last_error = "invalid samples buffer"; return nullptr; }
    // NULL / "" -> model default language (ignored by non-prompt models).
    const std::string lang = target_lang ? target_lang : "";
    try {
        std::vector<float> pcm(samples, samples + n_samples);
        std::string text = ctx->model->transcribe_pcm(pcm, sample_rate, to_decoder(decoder), lang);
        ctx->last_error.clear();
        char* out = dup_to_c(text);
        if (!out) { ctx->last_error = "out of memory"; return nullptr; }
        return out;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        ctx->last_error = "unknown error";
        return nullptr;
    }
}

extern "C" char* parakeet_capi_transcribe_pcm(parakeet_ctx* ctx, const float* samples,
                                              int n_samples, int sample_rate,
                                              int decoder) {
    // Delegate with the model default language.
    return parakeet_capi_transcribe_pcm_lang(ctx, samples, n_samples, sample_rate,
                                             decoder, nullptr);
}

extern "C" int parakeet_capi_transcribe_pcm_logits(parakeet_ctx* ctx,
                                                    const float* samples, int n_samples,
                                                    int sample_rate, float** out_logits,
                                                    int* out_T, int* out_vocab_plus_1) {
    if (!ctx) return 1;
    if (!out_logits || !out_T || !out_vocab_plus_1) {
        ctx->last_error = "invalid output pointer(s)";
        return 1;
    }
    *out_logits = nullptr;
    *out_T = 0;
    *out_vocab_plus_1 = 0;
    if (!ctx->model) { ctx->last_error = "context has no loaded model"; return 1; }
    if (!samples || n_samples < 0) { ctx->last_error = "invalid samples buffer"; return 1; }
    try {
        std::vector<float> pcm(samples, samples + n_samples);
        std::vector<float> logits;
        int T = 0, vocab_plus_1 = 0;
        ctx->model->transcribe_pcm_ctc_logits(pcm, sample_rate, logits, T, vocab_plus_1);

        float* buf = static_cast<float*>(std::malloc(logits.size() * sizeof(float)));
        if (!buf) { ctx->last_error = "out of memory"; return 1; }
        std::memcpy(buf, logits.data(), logits.size() * sizeof(float));

        ctx->last_error.clear();
        *out_logits = buf;
        *out_T = T;
        *out_vocab_plus_1 = vocab_plus_1;
        return 0;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
        return 1;
    } catch (...) {
        ctx->last_error = "unknown error";
        return 1;
    }
}

extern "C" void parakeet_capi_free_logits(float* logits) {
    std::free(logits);
}

extern "C" int parakeet_capi_transcribe_pcm_batch_lang(parakeet_ctx* ctx,
                                                       const float* const* samples,
                                                       const int* n_samples, int n_clips,
                                                       int sample_rate, int decoder,
                                                       const char* target_lang,
                                                       char** out) {
    if (!ctx) return 1;
    if (!ctx->model) {
        ctx->last_error = ctx->diar
            ? "context holds a diarization model; use parakeet_capi_diarize_*"
            : "context has no loaded model";
        return 1;
    }
    if (!samples || !n_samples || !out || n_clips < 0) {
        ctx->last_error = "invalid batch arguments";
        return 1;
    }
    // NULL / "" -> model default language (ignored by non-prompt models).
    const std::string lang = target_lang ? target_lang : "";
    // Contract: on any error path (validation, exception, OOM) every out[]
    // entry is left NULL, so the caller owns nothing and frees nothing.
    for (int i = 0; i < n_clips; ++i) out[i] = nullptr;
    try {
        std::vector<std::vector<float>> pcms(n_clips);
        for (int i = 0; i < n_clips; ++i) {
            if (!samples[i] || n_samples[i] < 0) {
                ctx->last_error = "invalid samples buffer in batch";
                return 1;
            }
            pcms[i].assign(samples[i], samples[i] + n_samples[i]);
        }
        std::vector<std::string> texts =
            ctx->model->transcribe_pcm_batch(pcms, sample_rate, to_decoder(decoder), lang);
        ctx->last_error.clear();
        for (int i = 0; i < n_clips; ++i) {
            char* s = dup_to_c(texts[i]);
            if (!s) {
                // Roll back the strings already allocated this call so every
                // out[] entry is NULL on return (out[i..] are already NULL).
                for (int j = 0; j < i; ++j) { std::free(out[j]); out[j] = nullptr; }
                ctx->last_error = "out of memory";
                return 2;
            }
            out[i] = s;
        }
        return 0;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
        return 3;
    } catch (...) {
        ctx->last_error = "unknown error";
        return 3;
    }
}

extern "C" int parakeet_capi_transcribe_pcm_batch(parakeet_ctx* ctx,
                                                  const float* const* samples,
                                                  const int* n_samples, int n_clips,
                                                  int sample_rate, int decoder,
                                                  char** out) {
    // Delegate with the model default language.
    return parakeet_capi_transcribe_pcm_batch_lang(ctx, samples, n_samples, n_clips,
                                                   sample_rate, decoder, nullptr, out);
}

extern "C" char* parakeet_capi_transcribe_path_json(parakeet_ctx* ctx,
                                                    const char* wav_path,
                                                    int decoder) {
    if (!ctx) return nullptr;
    if (!ctx->model) {
        ctx->last_error = ctx->diar
            ? "context holds a diarization model; use parakeet_capi_diarize_*"
            : "context has no loaded model";
        return nullptr;
    }
    if (!wav_path)   { ctx->last_error = "wav_path is NULL"; return nullptr; }
    try {
        pk::Transcription tr =
            ctx->model->transcribe_path_with_timestamps(wav_path, to_decoder(decoder));
        // frame_sec = hop_length * subsampling_factor / sample_rate (token "t").
        const pk::ParakeetConfig& cfg = ctx->model->config();
        const float frame_sec =
            (float)cfg.hop_length * (float)cfg.subsampling_factor / (float)cfg.sample_rate;
        std::string json = pk::transcription_to_json(tr, frame_sec);
        ctx->last_error.clear();
        char* out = dup_to_c(json);
        if (!out) { ctx->last_error = "out of memory"; return nullptr; }
        return out;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        ctx->last_error = "unknown error";
        return nullptr;
    }
}

extern "C" char* parakeet_capi_transcribe_pcm_batch_json_lang(parakeet_ctx* ctx,
        const float* samples_concat, const int* n_samples, int n_clips,
        int sample_rate, int decoder, const char* target_lang) {
    if (!ctx) return nullptr;
    if (!ctx->model) {
        ctx->last_error = ctx->diar
            ? "context holds a diarization model; use parakeet_capi_diarize_*"
            : "context has no loaded model";
        return nullptr;
    }
    if (!samples_concat || !n_samples || n_clips < 0) {
        ctx->last_error = "invalid batch arguments"; return nullptr;
    }
    // NULL / "" -> model default language (ignored by non-prompt models).
    const std::string lang = target_lang ? target_lang : "";
    try {
        std::vector<std::vector<float>> pcms(n_clips);
        size_t off = 0;
        for (int i = 0; i < n_clips; ++i) {
            if (n_samples[i] < 0) { ctx->last_error = "invalid clip length"; return nullptr; }
            pcms[i].assign(samples_concat + off, samples_concat + off + n_samples[i]);
            off += (size_t)n_samples[i];
        }
        std::vector<pk::Transcription> trs =
            ctx->model->transcribe_pcm_batch_with_timestamps(pcms, sample_rate,
                                                             to_decoder(decoder), lang);
        const pk::ParakeetConfig& cfg = ctx->model->config();
        const float frame_sec =
            (float)cfg.hop_length * (float)cfg.subsampling_factor / (float)cfg.sample_rate;
        std::string json = "[";
        for (size_t i = 0; i < trs.size(); ++i) {
            if (i) json += ',';
            json += pk::transcription_to_json(trs[i], frame_sec);
        }
        json += "]";
        ctx->last_error.clear();
        char* out = dup_to_c(json);
        if (!out) { ctx->last_error = "out of memory"; return nullptr; }
        return out;
    } catch (const std::exception& e) {
        ctx->last_error = e.what(); return nullptr;
    } catch (...) {
        ctx->last_error = "unknown error"; return nullptr;
    }
}

extern "C" char* parakeet_capi_transcribe_pcm_batch_json(parakeet_ctx* ctx,
        const float* samples_concat, const int* n_samples, int n_clips,
        int sample_rate, int decoder) {
    // Delegate with the model default language.
    return parakeet_capi_transcribe_pcm_batch_json_lang(ctx, samples_concat, n_samples,
                                                        n_clips, sample_rate, decoder,
                                                        nullptr);
}

extern "C" char* parakeet_capi_transcribe_path_nbest_json(
        parakeet_ctx* ctx, const char* wav_path,
        int beam_size, int nbest, int score_norm, const char* target_lang) {
    if (!ctx) return nullptr;
    if (!ctx->model) {
        ctx->last_error = "context has no loaded model";
        return nullptr;
    }
    if (!wav_path) {
        ctx->last_error = "wav_path is NULL";
        return nullptr;
    }
    try {
        const bool normalize = score_norm != 0;
        const std::string lang = target_lang ? target_lang : "";
        std::vector<pk::NBestTranscription> hypotheses =
            ctx->model->transcribe_path_nbest(
                wav_path, beam_size, nbest, normalize, lang);
        const pk::ParakeetConfig& cfg = ctx->model->config();
        const float frame_sec =
            (float)cfg.hop_length * (float)cfg.subsampling_factor /
            (float)cfg.sample_rate;
        std::string json = pk::nbest_transcriptions_to_json(
            hypotheses, beam_size, normalize, frame_sec);
        ctx->last_error.clear();
        char* out = dup_to_c(json);
        if (!out) {
            ctx->last_error = "out of memory";
            return nullptr;
        }
        return out;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        ctx->last_error = "unknown error";
        return nullptr;
    }
}

extern "C" char* parakeet_capi_transcribe_pcm_nbest_json(
        parakeet_ctx* ctx, const float* samples, int n_samples, int sample_rate,
        int beam_size, int nbest, int score_norm, const char* target_lang) {
    if (!ctx) return nullptr;
    if (!ctx->model) {
        ctx->last_error = "context has no loaded model";
        return nullptr;
    }
    if (!samples || n_samples < 0) {
        ctx->last_error = "invalid samples buffer";
        return nullptr;
    }
    try {
        const bool normalize = score_norm != 0;
        const std::string lang = target_lang ? target_lang : "";
        const std::vector<float> pcm(samples, samples + n_samples);
        std::vector<pk::NBestTranscription> hypotheses =
            ctx->model->transcribe_pcm_nbest(
                pcm, sample_rate, beam_size, nbest, normalize, lang);
        const pk::ParakeetConfig& cfg = ctx->model->config();
        const float frame_sec =
            (float)cfg.hop_length * (float)cfg.subsampling_factor /
            (float)cfg.sample_rate;
        std::string json = pk::nbest_transcriptions_to_json(
            hypotheses, beam_size, normalize, frame_sec);
        ctx->last_error.clear();
        char* out = dup_to_c(json);
        if (!out) {
            ctx->last_error = "out of memory";
            return nullptr;
        }
        return out;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        ctx->last_error = "unknown error";
        return nullptr;
    }
}

// ---------------------------------------------------------------------------
// Streaming API
// ---------------------------------------------------------------------------

namespace {

// Feed any not-yet-fed encoder chunks for which enough mel frames are now
// buffered, carrying the StreamingSession caches. Operates over the stream's
// INCREMENTALLY-accumulated mel buffer (s->mel_buf / s->mel_T) — the mel for
// new PCM is produced frame-local by StreamingMel in the feed/finalize entry
// points, NOT recomputed over the whole buffer here. `flush` marks the final
// partial chunk is_last (keep_all_outputs), draining the remaining frames. Sets
// eou_flag / eob_flag to 1 if an <EOU> / <EOB> (respectively) fired in this
// pass — attributed by watermarking the session's un-drained event queue, so
// the queue itself is left intact for the caller to drain. Returns the newly-
// finalized text.
std::string feed_available(parakeet_stream* s, bool flush, int& eou_flag,
                           int& eob_flag) {
    eou_flag = 0;
    eob_flag = 0;
    pk::StreamingSession& sess = *s->sess;
    const size_t ev0 = sess.events().size();

    const int n_mels = s->n_mels;
    const int T = s->mel_T;              // absolute total frame count
    if (T <= 0) return std::string();
    const int origin = s->mel_buf_origin;   // absolute index of mel_buf's column 0
    const int local_T = T - origin;         // mel_buf's actual (bounded) column count
    const std::vector<float>& mel = s->mel_buf;  // [n_mels, local_T] feat-major, columns [origin, T)

    const int chunk0     = sess.chunk_size_first();
    const int chunk_main = sess.chunk_size();
    const int pre_cache  = sess.pre_encode_cache_size();

    // lo/hi are ABSOLUTE frame indices (as before); translate into mel_buf's
    // own local (origin-relative) columns. append_mel_frames guarantees
    // lo >= mel_buffer_idx - pre_cache is always still resident.
    auto window = [&](int lo, int hi) {
        const int len = hi - lo;
        std::vector<float> w((size_t)n_mels * len);
        for (int m = 0; m < n_mels; ++m)
            for (int t = 0; t < len; ++t)
                w[(size_t)m * len + t] = mel[(size_t)m * local_T + (lo - origin + t)];
        return w;
    };

    std::string new_text;
    while (s->mel_buffer_idx < T) {
        const int chunk_size = s->first_chunk ? chunk0 : chunk_main;
        const int chunk_hi   = std::min(s->mel_buffer_idx + chunk_size, T);
        if (chunk_hi - s->mel_buffer_idx <= 0) break;
        const bool reaches_end = (chunk_hi >= T);
        // Mid-stream (not flushing): only feed a chunk if there is STRICTLY more
        // audio after it (chunk_hi < T) so it is definitely not the final chunk
        // (kept at valid_out_len). The chunk that reaches the end of the current
        // buffer is deferred to flush, where it is fed with keep_all_outputs
        // (is_last) so the streaming tail frames are retained — matching NeMo's
        // CacheAwareStreamingAudioBuffer last-chunk behaviour and the validated
        // run_stream_over_pcm / test_streaming_decode schedule.
        if (!flush && reaches_end) break;
        const int lo = s->first_chunk ? s->mel_buffer_idx
                                      : std::max(0, s->mel_buffer_idx - pre_cache);
        std::vector<float> win = window(lo, chunk_hi);
        const int win_frames = chunk_hi - lo;
        const bool is_last = flush && reaches_end;

        sess.feed_mel_chunk(win, win_frames, is_last);
        new_text += sess.take_new_text();

        s->mel_buffer_idx += chunk_size;  // shift_size == chunk_size here
        s->first_chunk = false;
        if (is_last) break;               // flushed the end-of-stream tail
    }
    for (size_t i = ev0; i < sess.events().size(); ++i)
        (sess.events()[i].is_eob ? eob_flag : eou_flag) = 1;
    return new_text;
}

} // namespace

extern "C" parakeet_stream* parakeet_capi_stream_begin_lang(parakeet_ctx* ctx,
                                                           const char* target_lang) {
    if (!ctx) return nullptr;
    if (!ctx->model) {
        ctx->last_error = ctx->diar
            ? "context holds a diarization model; use parakeet_capi_diarize_*"
            : "context has no loaded model";
        return nullptr;
    }
    if (!ctx->model->config().streaming.present) {
        ctx->last_error = "model is not a cache-aware streaming model";
        return nullptr;
    }
    // NULL / "" -> model default language (ignored by non-prompt models).
    const std::string lang = target_lang ? target_lang : "";
    try {
        auto* s = new (std::nothrow) parakeet_stream();
        if (!s) { ctx->last_error = "out of memory"; return nullptr; }
        s->ctx = ctx;
        s->sess = std::make_unique<pk::StreamingSession>(ctx->model->loader(), lang);
        s->mel  = std::make_unique<pk::StreamingMel>(ctx->model->loader());
        s->n_mels = s->mel->n_mels();
        ctx->last_error.clear();
        return s;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        ctx->last_error = "unknown error";
        return nullptr;
    }
}

extern "C" int parakeet_capi_stream_has_eou(parakeet_stream* s) {
    if (!s || !s->sess) return -1;
    return s->sess->has_eou() ? 1 : 0;
}

extern "C" double parakeet_capi_stream_blank_seconds(parakeet_stream* s) {
    if (!s || !s->sess) return -1.0;
    return s->sess->blank_seconds();
}

extern "C" char* parakeet_capi_stream_end_utterance(parakeet_stream* s) {
    if (!s || !s->sess) return nullptr;
    if (!s->ctx || !s->ctx->model) return nullptr;
    try {
        std::string delta = s->sess->end_utterance();
        s->ctx->last_error.clear();
        char* out = dup_to_c(delta);
        if (!out) { s->ctx->last_error = "out of memory"; return nullptr; }
        return out;
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what(); return nullptr;
    } catch (...) {
        s->ctx->last_error = "unknown error"; return nullptr;
    }
}

extern "C" parakeet_stream* parakeet_capi_stream_begin(parakeet_ctx* ctx) {
    // Delegate with the model default language.
    return parakeet_capi_stream_begin_lang(ctx, nullptr);
}

extern "C" char* parakeet_capi_stream_feed(parakeet_stream* s, const float* pcm,
                                           int n_samples, int* eou_out) {
    if (eou_out) *eou_out = 0;
    if (!s) return nullptr;
    if (!s->ctx || !s->ctx->model) return nullptr;
    if (n_samples < 0 || (!pcm && n_samples > 0)) {
        s->ctx->last_error = "invalid PCM buffer";
        return nullptr;
    }
    try {
        // Incremental, frame-local mel for the just-arrived PCM (no full-buffer
        // recompute). StreamingMel carries the preemph history + partial frame
        // across feeds; the emitted frames are appended to the accumulated mel.
        if (n_samples > 0) {
            int n_new = 0;
            std::vector<float> frames = s->mel->feed(pcm, n_samples, n_new);
            append_mel_frames(s, frames, n_new);
        }
        int eou = 0, eob = 0;
        std::string delta = feed_available(s, /*flush=*/false, eou, eob);
        if (eou_out) *eou_out = (eou ? PARAKEET_EVENT_EOU : 0) |
                                (eob ? PARAKEET_EVENT_EOB : 0);
        s->ctx->last_error.clear();
        char* out = dup_to_c(delta);
        if (!out) { s->ctx->last_error = "out of memory"; return nullptr; }
        return out;
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        s->ctx->last_error = "unknown error";
        return nullptr;
    }
}

extern "C" char* parakeet_capi_stream_finalize(parakeet_stream* s) {
    if (!s) return nullptr;
    if (!s->ctx || !s->ctx->model) return nullptr;
    try {
        // Emit the end zero-pad tail frames so the accumulated mel matches the
        // full-buffer MelFrontend::compute exactly, then flush the decoder tail.
        if (s->mel) {
            int n_tail = 0;
            std::vector<float> tail = s->mel->finalize(n_tail);
            append_mel_frames(s, tail, n_tail);
        }
        int eou = 0, eob = 0;
        std::string delta = feed_available(s, /*flush=*/true, eou, eob);
        // After the flush the session's finalize() is a no-op text-wise (no extra
        // audio) but documents the end-of-stream tail semantics.
        delta += s->sess->finalize();
        s->finalized = true;
        s->ctx->last_error.clear();
        char* out = dup_to_c(delta);
        if (!out) { s->ctx->last_error = "out of memory"; return nullptr; }
        return out;
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        s->ctx->last_error = "unknown error";
        return nullptr;
    }
}

extern "C" int parakeet_capi_stream_chunk_samples(parakeet_stream* s) {
    if (!s || !s->sess) return -1;
    if (!s->ctx || !s->ctx->model) return -1;
    // A mid-stream chunk is chunk_size() mel frames, each hop_length samples of
    // audio (the first one is chunk_size_first(), which is smaller).
    return s->sess->chunk_size() * (int)s->ctx->model->config().hop_length;
}

extern "C" int parakeet_capi_stream_drain_events(parakeet_stream* s,
                                                 parakeet_stream_event** out_events) {
    if (out_events) *out_events = nullptr;
    if (!s || !out_events) return -1;
    if (!s->ctx || !s->ctx->model || !s->sess) return -1;
    try {
        std::vector<pk::EouEvent> evs = s->sess->drain_events();
        s->ctx->last_error.clear();
        if (evs.empty()) return 0;
        auto* arr = static_cast<parakeet_stream_event*>(
            std::malloc(evs.size() * sizeof(parakeet_stream_event)));
        if (!arr) { s->ctx->last_error = "out of memory"; return -1; }
        for (size_t i = 0; i < evs.size(); ++i) {
            arr[i].token         = (int)evs[i].token;
            arr[i].is_eob        = evs[i].is_eob ? 1 : 0;
            arr[i].encoder_frame = evs[i].encoder_frame;
            arr[i].time_sec      = (float)evs[i].time_sec;
        }
        *out_events = arr;
        return (int)evs.size();
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
        return -1;
    } catch (...) {
        s->ctx->last_error = "unknown error";
        return -1;
    }
}

extern "C" void parakeet_capi_free_events(parakeet_stream_event* events) {
    std::free(events);
}

// Firefox-local: typed drain of finalized words (timing + confidence), so the
// host gets per-word data without parsing the JSON feed.
extern "C" int parakeet_capi_stream_drain_words(
    parakeet_stream* s, parakeet_stream_word** out_words) {
    if (out_words) *out_words = nullptr;
    if (!s || !out_words) return -1;
    if (!s->ctx || !s->ctx->model || !s->sess) return -1;
    try {
        std::vector<pk::Word> ws = s->sess->drain_words();
        s->ctx->last_error.clear();
        if (ws.empty()) return 0;
        auto* arr = static_cast<parakeet_stream_word*>(
            std::calloc(ws.size(), sizeof(parakeet_stream_word)));
        if (!arr) { s->ctx->last_error = "out of memory"; return -1; }
        for (size_t i = 0; i < ws.size(); ++i) {
            char* t = static_cast<char*>(std::malloc(ws[i].text.size() + 1));
            if (t) {
                std::memcpy(t, ws[i].text.c_str(), ws[i].text.size() + 1);
            }
            arr[i].text  = t;
            arr[i].start = ws[i].start;
            arr[i].end   = ws[i].end;
            arr[i].conf  = ws[i].conf;
        }
        *out_words = arr;
        return (int)ws.size();
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
        return -1;
    } catch (...) {
        s->ctx->last_error = "unknown error";
        return -1;
    }
}

extern "C" void parakeet_capi_free_words(parakeet_stream_word* words, int count) {
    if (!words) return;
    for (int i = 0; i < count; ++i) {
        std::free(const_cast<char*>(words[i].text));
    }
    std::free(words);
}

namespace {

// Serialize a streaming feed/finalize result to JSON: the newly-finalized text,
// the per-type eou/eob flags, frame_sec, the <EOU>/<EOB> events drained this
// call, and the words drained this call (absolute seconds). Shape matches the
// header doc on parakeet_capi_stream_feed_json. "eou" means an <EOU> fired and
// "eob" an <EOB> — they are NOT conflated (a voice agent responds on eou and
// must not treat eob as the user taking the turn); "events" carries the
// per-event timestamps.
std::string stream_json(const std::string& text, int eou, int eob,
                        float frame_sec,
                        const std::vector<pk::EouEvent>& events,
                        const std::vector<pk::Word>& words) {
    std::string out;
    out.reserve(80 + events.size() * 36 + words.size() * 48);
    out += "{\"text\":";
    pk::append_json_string(out, text);
    out += ",\"eou\":";
    out += (eou ? "1" : "0");
    out += ",\"eob\":";
    out += (eob ? "1" : "0");
    out += ",\"frame_sec\":";
    pk::append_json_float(out, "%.6f", frame_sec);
    out += ",\"events\":[";
    for (size_t i = 0; i < events.size(); ++i) {
        if (i) out += ',';
        out += "{\"type\":";
        out += events[i].is_eob ? "\"eob\"" : "\"eou\"";
        out += ",\"frame\":";
        pk::append_json_int(out, events[i].encoder_frame);
        out += ",\"t\":";
        pk::append_json_float(out, "%.3f", (float)events[i].time_sec);
        out += '}';
    }
    out += "],\"words\":[";
    for (size_t i = 0; i < words.size(); ++i) {
        if (i) out += ',';
        out += "{\"w\":";
        pk::append_json_string(out, words[i].text);
        out += ",\"start\":";
        pk::append_json_float(out, "%.3f", words[i].start);
        out += ",\"end\":";
        pk::append_json_float(out, "%.3f", words[i].end);
        out += ",\"conf\":";
        pk::append_json_float(out, "%.4f", words[i].conf);
        out += '}';
    }
    out += "]}";
    return out;
}

// frame_sec for the stream's model (encoder frame stride in seconds).
float stream_frame_sec(const parakeet_stream* s) {
    const pk::ParakeetConfig& cfg = s->ctx->model->config();
    return (float)cfg.hop_length * (float)cfg.subsampling_factor / (float)cfg.sample_rate;
}

} // namespace

extern "C" char* parakeet_capi_stream_feed_json(parakeet_stream* s,
                                                const float* pcm, int n_samples) {
    if (!s) return nullptr;
    if (!s->ctx || !s->ctx->model) return nullptr;
    if (n_samples < 0 || (!pcm && n_samples > 0)) {
        s->ctx->last_error = "invalid PCM buffer";
        return nullptr;
    }
    try {
        if (n_samples > 0) {
            int n_new = 0;
            std::vector<float> frames = s->mel->feed(pcm, n_samples, n_new);
            append_mel_frames(s, frames, n_new);
        }
        int eou = 0, eob = 0;
        std::string delta = feed_available(s, /*flush=*/false, eou, eob);
        std::vector<pk::EouEvent> events = s->sess->drain_events();
        std::vector<pk::Word> words = s->sess->drain_words();
        std::string json = stream_json(delta, eou, eob, stream_frame_sec(s), events, words);
        s->ctx->last_error.clear();
        char* out = dup_to_c(json);
        if (!out) { s->ctx->last_error = "out of memory"; return nullptr; }
        return out;
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        s->ctx->last_error = "unknown error";
        return nullptr;
    }
}

extern "C" char* parakeet_capi_stream_finalize_json(parakeet_stream* s) {
    if (!s) return nullptr;
    if (!s->ctx || !s->ctx->model) return nullptr;
    try {
        if (s->mel) {
            int n_tail = 0;
            std::vector<float> tail = s->mel->finalize(n_tail);
            append_mel_frames(s, tail, n_tail);
        }
        int eou = 0, eob = 0;
        std::string delta = feed_available(s, /*flush=*/true, eou, eob);
        delta += s->sess->finalize();
        std::vector<pk::EouEvent> events = s->sess->drain_events();
        std::vector<pk::Word> words = s->sess->drain_words();
        std::string json = stream_json(delta, eou, eob, stream_frame_sec(s), events, words);
        s->finalized = true;
        s->ctx->last_error.clear();
        char* out = dup_to_c(json);
        if (!out) { s->ctx->last_error = "out of memory"; return nullptr; }
        return out;
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
        return nullptr;
    } catch (...) {
        s->ctx->last_error = "unknown error";
        return nullptr;
    }
}

extern "C" void parakeet_capi_stream_free(parakeet_stream* s) {
    delete s;  // safe on nullptr
}

extern "C" void parakeet_capi_free_string(char* s) {
    std::free(s);
}

extern "C" const char* parakeet_capi_last_error(parakeet_ctx* ctx) {
    if (!ctx) return "";
    return ctx->last_error.c_str();
}

// ---------------------------------------------------------------------------
// Speaker diarization + speaker-attributed ASR (ABI v7)
// ---------------------------------------------------------------------------

namespace {

bool require_diar(parakeet_ctx* ctx) {
    if (!ctx) return false;
    if (!ctx->diar) {
        ctx->last_error = ctx->model  ? "context holds an ASR model; diarize_* needs a diarization model"
                         : ctx->tagger ? "context holds a CED sound model; diarize_* needs a diarization model"
                                       : "context has no loaded model";
        return false;
    }
    return true;
}

bool require_asr(parakeet_ctx* ctx) {
    if (!ctx) return false;
    if (!ctx->model) {
        ctx->last_error = ctx->diar   ? "context holds a diarization model; an ASR model is needed here"
                         : ctx->tagger ? "context holds a CED sound model; an ASR model is needed here"
                                       : "context has no loaded model";
        return false;
    }
    return true;
}

constexpr const char* kNoCed = "built without sound tagging (PARAKEET_WITH_CED=OFF)";

bool require_tagger(parakeet_ctx* ctx) {
    if (!ctx) return false;
    if (!pk::CedTagger::available()) { ctx->last_error = kNoCed; return false; }
    if (!ctx->tagger) {
        ctx->last_error = ctx->model ? "context holds an ASR model; a CED sound model is needed here"
                        : ctx->diar  ? "context holds a diarization model; a CED sound model is needed here"
                                     : "context has no loaded model";
        return false;
    }
    return true;
}

char* diar_result_to_json(const pk::DiarizationResult& r) {
    std::string json = "{\"speakers\":";
    pk::append_json_int(json, r.n_speakers);
    json += ",\"segments\":[";
    for (size_t i = 0; i < r.segments.size(); ++i) {
        if (i) json += ',';
        json += "{\"speaker\":";
        pk::append_json_int(json, r.segments[i].speaker);
        json += ",\"start\":";
        pk::append_json_float(json, "%.2f", r.segments[i].start);
        json += ",\"end\":";
        pk::append_json_float(json, "%.2f", r.segments[i].end);
        json += '}';
    }
    json += "]}";
    return dup_to_c(json);
}

template <typename T>
void append_speaker_item(std::string& s, const T& x, const char* time_fmt) {
    s += "{\"speaker\":";
    pk::append_json_int(s, x.speaker);
    s += ",\"text\":";
    pk::append_json_string(s, x.text);
    s += ",\"start\":";
    pk::append_json_float(s, time_fmt, x.start);
    s += ",\"end\":";
    pk::append_json_float(s, time_fmt, x.end);
    s += ",\"conf\":";
    pk::append_json_float(s, "%.3f", x.conf);
    s += '}';
}

// Copy utterances into a malloc'd C array. Returns false on allocation failure.
bool to_c_results(const std::vector<pk::SpeakerUtterance>& utts,
                  parakeet_sas_result** out, int* n_out) {
    *out = nullptr;
    *n_out = 0;
    if (utts.empty()) return true;
    auto* r = static_cast<parakeet_sas_result*>(std::calloc(utts.size(), sizeof(parakeet_sas_result)));
    if (!r) return false;
    for (size_t i = 0; i < utts.size(); ++i) {
        r[i].speaker = utts[i].speaker;
        r[i].text    = dup_to_c(utts[i].text);
        r[i].start   = utts[i].start;
        r[i].end     = utts[i].end;
        r[i].conf    = utts[i].conf;
        if (!r[i].text) { parakeet_capi_free_sas_results(r, (int)i); return false; }
    }
    *out = r;
    *n_out = (int)utts.size();
    return true;
}

// ASR + diarization on the same audio, merged per word.
bool run_sas(parakeet_ctx* asr_ctx, parakeet_ctx* diar_ctx,
             const float* samples, int n_samples, int sample_rate,
             std::vector<pk::SpeakerWord>& words, int& n_speakers) {
    if (!require_asr(asr_ctx) || !require_diar(diar_ctx)) return false;
    if (!samples || n_samples < 0) {
        asr_ctx->last_error = "invalid samples buffer";
        return false;
    }
    const std::vector<float> pcm(samples, samples + n_samples);
    pk::Transcription tr;
    try {
        tr = asr_ctx->model->transcribe_with_timestamps(pcm, sample_rate);
    } catch (const std::exception& e) {
        asr_ctx->last_error = e.what();
        return false;
    }
    pk::DiarizationResult dr;
    try {
        dr = diar_ctx->diar->diarize_pcm(pcm, sample_rate);
    } catch (const std::exception& e) {
        diar_ctx->last_error = e.what();
        return false;
    }
    n_speakers = dr.n_speakers;
    words = pk::merge_asr_diarization(tr.words, dr.segments);
    asr_ctx->last_error.clear();
    diar_ctx->last_error.clear();
    return true;
}

}  // namespace

extern "C" char* parakeet_capi_diarize_path(parakeet_ctx* ctx, const char* wav_path) {
    if (!require_diar(ctx)) return nullptr;
    if (!wav_path) { ctx->last_error = "wav_path is NULL"; return nullptr; }
    try {
        char* out = diar_result_to_json(ctx->diar->diarize_path(wav_path));
        ctx->last_error.clear();
        return out;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
    } catch (...) {
        ctx->last_error = "unknown error";
    }
    return nullptr;
}

extern "C" char* parakeet_capi_diarize_pcm(parakeet_ctx* ctx, const float* samples,
                                           int n_samples, int sample_rate) {
    if (!require_diar(ctx)) return nullptr;
    if (!samples || n_samples < 0) { ctx->last_error = "invalid samples buffer"; return nullptr; }
    try {
        const std::vector<float> pcm(samples, samples + n_samples);
        char* out = diar_result_to_json(ctx->diar->diarize_pcm(pcm, sample_rate));
        ctx->last_error.clear();
        return out;
    } catch (const std::exception& e) {
        ctx->last_error = e.what();
    } catch (...) {
        ctx->last_error = "unknown error";
    }
    return nullptr;
}

extern "C" int parakeet_capi_transcribe_and_diarize(parakeet_ctx* asr_ctx, parakeet_ctx* diar_ctx,
                                                    const float* samples, int n_samples,
                                                    int sample_rate,
                                                    parakeet_sas_result** out, int* n_out) {
    if (!out || !n_out) return 1;
    *out = nullptr;
    *n_out = 0;
    try {
        std::vector<pk::SpeakerWord> words;
        int n_speakers = 0;
        if (!run_sas(asr_ctx, diar_ctx, samples, n_samples, sample_rate, words, n_speakers))
            return 1;
        if (!to_c_results(pk::group_speaker_words(words), out, n_out)) {
            asr_ctx->last_error = "out of memory";
            return 1;
        }
        return 0;
    } catch (...) {
        if (asr_ctx) asr_ctx->last_error = "unknown error";
        return 1;
    }
}

extern "C" void parakeet_capi_free_sas_results(parakeet_sas_result* results, int n) {
    if (!results) return;
    for (int i = 0; i < n; ++i) std::free(results[i].text);
    std::free(results);
}

extern "C" char* parakeet_capi_transcribe_and_diarize_json(parakeet_ctx* asr_ctx,
                                                           parakeet_ctx* diar_ctx,
                                                           const float* samples, int n_samples,
                                                           int sample_rate) {
    try {
        std::vector<pk::SpeakerWord> words;
        int n_speakers = 0;
        if (!run_sas(asr_ctx, diar_ctx, samples, n_samples, sample_rate, words, n_speakers))
            return nullptr;
        const std::vector<pk::SpeakerUtterance> utts = pk::group_speaker_words(words);
        std::string s = "{\"speakers\":";
        pk::append_json_int(s, n_speakers);
        s += ",\"utterances\":[";
        for (size_t i = 0; i < utts.size(); ++i) {
            if (i) s += ',';
            append_speaker_item(s, utts[i], "%.2f");
        }
        s += "],\"words\":[";
        for (size_t i = 0; i < words.size(); ++i) {
            if (i) s += ',';
            append_speaker_item(s, words[i], "%.3f");
        }
        s += "]}";
        return dup_to_c(s);
    } catch (...) {
        if (asr_ctx) asr_ctx->last_error = "unknown error";
        return nullptr;
    }
}

// --- Streaming diarization -------------------------------------------------

struct parakeet_diar_stream {
    parakeet_ctx* ctx = nullptr;
    std::unique_ptr<pk::DiarPcmStream> ds;
};

namespace {

pk::DiarLatency latency_from_int(int latency) {
    switch (latency) {
        case PARAKEET_DIAR_LATENCY_LOW: return pk::DiarLatency::Low;
        case PARAKEET_DIAR_LATENCY_VERY_LOW: return pk::DiarLatency::VeryLow;
        case PARAKEET_DIAR_LATENCY_ULTRA_LOW: return pk::DiarLatency::UltraLow;
        default: return pk::DiarLatency::Model;
    }
}

// Copy segments into a malloc'd C array (NULL when empty). False on OOM.
bool to_c_segments(const std::vector<pk::StreamingSpeakerSegment>& segs,
                   parakeet_diar_segment** out, int* n_out) {
    *out = nullptr;
    *n_out = 0;
    if (segs.empty()) return true;
    auto* r = static_cast<parakeet_diar_segment*>(std::malloc(segs.size() * sizeof(parakeet_diar_segment)));
    if (!r) return false;
    for (size_t i = 0; i < segs.size(); ++i) r[i] = {segs[i].speaker, segs[i].start, segs[i].end};
    *out = r;
    *n_out = (int)segs.size();
    return true;
}

}  // namespace

extern "C" parakeet_diar_stream* parakeet_capi_diarize_stream_begin_latency(parakeet_ctx* diar_ctx,
                                                                            int latency) {
    if (!require_diar(diar_ctx)) return nullptr;
    if (latency < PARAKEET_DIAR_LATENCY_MODEL || latency > PARAKEET_DIAR_LATENCY_ULTRA_LOW) {
        diar_ctx->last_error = "unknown diarization latency mode";
        return nullptr;
    }
    try {
        auto ds = std::make_unique<pk::DiarPcmStream>(*diar_ctx->diar, latency_from_int(latency));
        auto* s = new parakeet_diar_stream();
        s->ctx = diar_ctx;
        s->ds = std::move(ds);
        diar_ctx->last_error.clear();
        return s;
    } catch (const std::exception& e) {
        diar_ctx->last_error = e.what();
    } catch (...) {
        diar_ctx->last_error = "unknown error";
    }
    return nullptr;
}

extern "C" parakeet_diar_stream* parakeet_capi_diarize_stream_begin(parakeet_ctx* diar_ctx) {
    return parakeet_capi_diarize_stream_begin_latency(diar_ctx, PARAKEET_DIAR_LATENCY_MODEL);
}

extern "C" int parakeet_capi_diarize_stream_chunk_samples(parakeet_diar_stream* s) {
    if (!s) return 0;
    return s->ds->chunk_samples();
}

extern "C" float parakeet_capi_diarize_stream_time(parakeet_diar_stream* s) {
    if (!s) return 0.0f;
    return (float)(s->ds->sd().frames_done() * s->ds->sd().frame_sec());
}

extern "C" int parakeet_capi_diarize_stream_active(parakeet_diar_stream* s,
                                                   parakeet_diar_segment** out, int* n_out) {
    if (!s || !out || !n_out) return 1;
    if (!to_c_segments(s->ds->open_segments(), out, n_out)) {
        s->ctx->last_error = "out of memory";
        return 1;
    }
    return 0;
}

extern "C" int parakeet_capi_diarize_stream_feed(parakeet_diar_stream* s, const float* pcm,
                                                 int n_samples, int is_last,
                                                 parakeet_diar_segment** out, int* n_out) {
    if (!s || !out || !n_out) return 1;
    *out = nullptr;
    *n_out = 0;
    if ((!pcm && n_samples > 0) || n_samples < 0) { s->ctx->last_error = "invalid samples buffer"; return 1; }
    if (s->ds->finished()) { s->ctx->last_error = "stream already finished"; return 1; }
    try {
        std::vector<pk::StreamingSpeakerSegment> segs;
        s->ds->feed(pcm, n_samples, is_last != 0, segs);
        if (!to_c_segments(segs, out, n_out)) { s->ctx->last_error = "out of memory"; return 1; }
        s->ctx->last_error.clear();
        return 0;
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
    } catch (...) {
        s->ctx->last_error = "unknown error";
    }
    return 1;
}

extern "C" void parakeet_capi_free_diar_segments(parakeet_diar_segment* segs) {
    std::free(segs);
}

extern "C" void parakeet_capi_diarize_stream_free(parakeet_diar_stream* s) {
    delete s;
}

// --- Streaming speaker-attributed ASR ---------------------------------------

// A pk::SceneStream over an ASR and a diarization context (no sound part).
struct parakeet_sas_stream {
    parakeet_ctx* asr = nullptr;
    parakeet_ctx* diar = nullptr;
    std::unique_ptr<pk::SceneStream> scene;
};

extern "C" parakeet_sas_stream* parakeet_capi_sas_stream_begin_latency(parakeet_ctx* asr_ctx,
                                                                       parakeet_ctx* diar_ctx,
                                                                       int latency) {
    if (!require_asr(asr_ctx) || !require_diar(diar_ctx)) return nullptr;
    if (latency < PARAKEET_DIAR_LATENCY_MODEL || latency > PARAKEET_DIAR_LATENCY_ULTRA_LOW) {
        diar_ctx->last_error = "unknown diarization latency mode";
        return nullptr;
    }
    try {
        pk::SceneParts parts;
        parts.asr = asr_ctx->model.get();
        parts.diar = diar_ctx->diar.get();
        parts.diar_latency = latency_from_int(latency);
        auto scene = std::make_unique<pk::SceneStream>(parts);
        auto* s = new parakeet_sas_stream();
        s->asr = asr_ctx;
        s->diar = diar_ctx;
        s->scene = std::move(scene);
        diar_ctx->last_error.clear();
        return s;
    } catch (const std::exception& e) {
        diar_ctx->last_error = e.what();
    } catch (...) {
        diar_ctx->last_error = "unknown error";
    }
    return nullptr;
}

extern "C" parakeet_sas_stream* parakeet_capi_sas_stream_begin(parakeet_ctx* asr_ctx,
                                                               parakeet_ctx* diar_ctx) {
    return parakeet_capi_sas_stream_begin_latency(asr_ctx, diar_ctx, PARAKEET_DIAR_LATENCY_MODEL);
}

extern "C" int parakeet_capi_sas_stream_feed(parakeet_sas_stream* s, const float* pcm,
                                             int n_samples, int is_last,
                                             parakeet_sas_result** out, int* n_out) {
    if (!s || !out || !n_out) return 1;
    *out = nullptr;
    *n_out = 0;
    if ((!pcm && n_samples > 0) || n_samples < 0) { s->asr->last_error = "invalid samples buffer"; return 1; }
    if (s->scene->finished()) { s->asr->last_error = "stream already finished"; return 1; }
    try {
        const pk::SceneUpdate u = s->scene->feed(pcm, n_samples, is_last != 0);
        if (!to_c_results(u.utterances, out, n_out)) { s->asr->last_error = "out of memory"; return 1; }
        // Any successful feed clears the ASR ctx's last error, also one
        // that commits nothing.
        s->asr->last_error.clear();
        return 0;
    } catch (const std::exception& e) {
        (s->scene->failed_part() == pk::ScenePart::Asr ? s->asr : s->diar)->last_error = e.what();
    } catch (...) {
        (s->scene->failed_part() == pk::ScenePart::Asr ? s->asr : s->diar)->last_error = "unknown error";
    }
    return 1;
}

extern "C" void parakeet_capi_sas_stream_free(parakeet_sas_stream* s) {
    delete s;
}

// ---------------------------------------------------------------------------
// Sound events (ABI v8)
// ---------------------------------------------------------------------------

namespace {

pk::SoundOpts to_sound_opts(const parakeet_sound_opts* o) {
    pk::SoundOpts s;
    if (!o) return s;
    // Only read fields the caller's struct has (size versioning).
    auto has = [&](size_t end) { return o->size >= (int)end; };
    if (has(offsetof(parakeet_sound_opts, hop_sec) + sizeof(float))) {
        s.window_sec = o->window_sec;
        s.hop_sec = o->hop_sec;
    }
    if (has(offsetof(parakeet_sound_opts, min_duration_sec) + sizeof(float))) {
        s.on_threshold = o->on_threshold;
        s.off_threshold = o->off_threshold;
        s.min_duration_sec = o->min_duration_sec;
    }
    if (has(offsetof(parakeet_sound_opts, top_k) + sizeof(int))) s.top_k = o->top_k;
    return s;
}

bool to_c_sound_segments(const std::vector<pk::SoundSegment>& in, const pk::CedTagger& t,
                         parakeet_sound_segment** out, int* n_out) {
    *out = nullptr;
    *n_out = 0;
    if (in.empty()) return true;
    auto* a = static_cast<parakeet_sound_segment*>(std::malloc(in.size() * sizeof(parakeet_sound_segment)));
    if (!a) return false;
    for (size_t i = 0; i < in.size(); ++i) {
        const char* l = t.label(in[i].cls);
        a[i] = {in[i].cls, l ? l : "", in[i].start, in[i].end, in[i].peak};
    }
    *out = a;
    *n_out = (int)in.size();
    return true;
}

} // namespace

struct parakeet_sound_stream {
    parakeet_ctx* ctx = nullptr;
    std::unique_ptr<pk::SoundStream> ss;
};

extern "C" void parakeet_capi_sound_opts_default(parakeet_sound_opts* o) {
    if (!o) return;
    const pk::SoundOpts d;
    *o = {(int)sizeof(*o), d.window_sec, d.hop_sec, d.on_threshold, d.off_threshold,
          d.min_duration_sec, d.top_k};
}

extern "C" parakeet_sound_stream* parakeet_capi_sound_stream_begin(parakeet_ctx* tagger,
                                                                   const parakeet_sound_opts* o) {
    if (!require_tagger(tagger)) return nullptr;
    try {
        const pk::SoundOpts so = to_sound_opts(o);
        const std::string err = pk::validate_sound_opts(so, tagger->tagger->n_classes());
        if (!err.empty()) { tagger->last_error = "invalid sound options: " + err; return nullptr; }
        auto* s = new parakeet_sound_stream();
        s->ctx = tagger;
        s->ss = std::make_unique<pk::SoundStream>(tagger->tagger->scorer(),
                                                  tagger->tagger->n_classes(), so);
        tagger->last_error.clear();
        return s;
    } catch (const std::exception& e) {
        tagger->last_error = e.what();
    } catch (...) {
        tagger->last_error = "unknown error";
    }
    return nullptr;
}

extern "C" int parakeet_capi_sound_stream_feed(parakeet_sound_stream* s, const float* pcm, int n,
                                               int is_last, parakeet_sound_segment** out, int* n_out) {
    if (!s || !out || !n_out) return 1;
    *out = nullptr;
    *n_out = 0;
    if ((!pcm && n > 0) || n < 0) { s->ctx->last_error = "invalid samples buffer"; return 1; }
    if (s->ss->finished()) { s->ctx->last_error = "stream already finished"; return 1; }
    try {
        auto closed = s->ss->feed(pcm, n, is_last != 0);
        if (!to_c_sound_segments(closed, *s->ctx->tagger, out, n_out)) {
            s->ctx->last_error = "out of memory";
            return 1;
        }
        s->ctx->last_error.clear();
        return 0;
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
        const std::string& detail = s->ctx->tagger->last_error();
        if (!detail.empty()) s->ctx->last_error += ": " + detail;
    } catch (...) {
        s->ctx->last_error = "unknown error";
    }
    return 1;
}

extern "C" int parakeet_capi_sound_stream_active(parakeet_sound_stream* s,
                                                 parakeet_sound_segment** out, int* n_out) {
    if (!s || !out || !n_out) return 1;
    *out = nullptr;
    *n_out = 0;
    try {
        if (!to_c_sound_segments(s->ss->open_segments(), *s->ctx->tagger, out, n_out)) {
            s->ctx->last_error = "out of memory";
            return 1;
        }
        s->ctx->last_error.clear();
        return 0;
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
    } catch (...) {
        s->ctx->last_error = "unknown error";
    }
    return 1;
}

extern "C" char* parakeet_capi_sound_stream_drain_scores_json(parakeet_sound_stream* s) {
    if (!s) return nullptr;
    try {
        const pk::CedTagger& t = *s->ctx->tagger;
        char* out = dup_to_c(pk::sound_windows_to_json(s->ss->drain_windows(),
                                                        [&](int i) { return t.label(i); }));
        s->ctx->last_error.clear();
        return out;
    } catch (const std::exception& e) {
        s->ctx->last_error = e.what();
    } catch (...) {
        s->ctx->last_error = "unknown error";
    }
    return nullptr;
}

extern "C" void parakeet_capi_free_sound_segments(parakeet_sound_segment* segs) { std::free(segs); }

extern "C" void parakeet_capi_sound_stream_free(parakeet_sound_stream* s) { delete s; }

// ---------------------------------------------------------------------------
// Sound events (ABI v8): CED tagger introspection
// ---------------------------------------------------------------------------

extern "C" int parakeet_capi_num_classes(const parakeet_ctx* ctx) {
    return (ctx && ctx->tagger) ? ctx->tagger->n_classes() : -1;
}

extern "C" const char* parakeet_capi_class_label(const parakeet_ctx* ctx, int index) {
    return (ctx && ctx->tagger) ? ctx->tagger->label(index) : nullptr;
}

extern "C" int parakeet_capi_model_kind(const parakeet_ctx* ctx) {
    if (!ctx) return PARAKEET_MODEL_KIND_NONE;
    if (ctx->model) return PARAKEET_MODEL_KIND_ASR;
    if (ctx->diar) return PARAKEET_MODEL_KIND_DIARIZATION;
    if (ctx->tagger) return PARAKEET_MODEL_KIND_SOUND;
    return PARAKEET_MODEL_KIND_NONE;
}

// ---------------------------------------------------------------------------
// Combined scene stream (ABI v8)
// ---------------------------------------------------------------------------

// A pk::SceneStream over up to three contexts (ASR, diarization, tagger).
struct parakeet_scene_stream {
    parakeet_ctx* asr_ctx = nullptr;
    parakeet_ctx* diar_ctx = nullptr;
    parakeet_ctx* tagger_ctx = nullptr;
    std::unique_ptr<pk::SceneStream> scene;
    std::string last_error;
};

namespace {

// Which context was running when the scene stream last threw, mirroring the
// sas_stream wrapper's diar/asr attribution, extended with the tagger.
parakeet_ctx* scene_failed_ctx(parakeet_scene_stream* s) {
    switch (s->scene->failed_part()) {
        case pk::ScenePart::Diarization: return s->diar_ctx ? s->diar_ctx : s->asr_ctx;
        case pk::ScenePart::Asr:         return s->asr_ctx ? s->asr_ctx : s->diar_ctx;
        case pk::ScenePart::Sound:       return s->tagger_ctx;
        default:                         return s->asr_ctx ? s->asr_ctx
                                                : s->diar_ctx ? s->diar_ctx : s->tagger_ctx;
    }
}

}  // namespace

extern "C" void parakeet_capi_scene_opts_default(parakeet_scene_opts* o) {
    if (!o) return;
    o->size = (int)sizeof(*o);
    o->diar_latency = PARAKEET_DIAR_LATENCY_MODEL;
    parakeet_capi_sound_opts_default(&o->sound);
    o->flags = 0;
}

extern "C" parakeet_scene_stream* parakeet_capi_scene_stream_begin(parakeet_ctx* asr, parakeet_ctx* diar,
                                                                    parakeet_ctx* tagger,
                                                                    const parakeet_scene_opts* o) {
    if (!asr && !diar && !tagger) return nullptr;
    if ((asr && !require_asr(asr)) || (diar && !require_diar(diar)) || (tagger && !require_tagger(tagger)))
        return nullptr;
    parakeet_scene_opts def;
    parakeet_capi_scene_opts_default(&def);
    if (!o) o = &def;
    if (o->size >= (int)(offsetof(parakeet_scene_opts, flags) + sizeof(int)) && o->flags != 0) {
        (asr ? asr : diar ? diar : tagger)->last_error = "scene flags must be 0";
        return nullptr;
    }
    if (diar && (o->diar_latency < PARAKEET_DIAR_LATENCY_MODEL ||
                 o->diar_latency > PARAKEET_DIAR_LATENCY_ULTRA_LOW)) {
        diar->last_error = "unknown diarization latency mode";
        return nullptr;
    }
    try {
        pk::SceneParts p;
        p.asr = asr ? asr->model.get() : nullptr;
        p.diar = diar ? diar->diar.get() : nullptr;
        p.diar_latency = latency_from_int(o->diar_latency);
        p.tagger = tagger ? tagger->tagger.get() : nullptr;
        p.sound = to_sound_opts(&o->sound);
        if (tagger) {
            const std::string err = pk::validate_sound_opts(p.sound, tagger->tagger->n_classes());
            if (!err.empty()) { tagger->last_error = "invalid sound options: " + err; return nullptr; }
        }
        auto* s = new parakeet_scene_stream();
        s->asr_ctx = asr;
        s->diar_ctx = diar;
        s->tagger_ctx = tagger;
        s->scene = std::make_unique<pk::SceneStream>(p);
        if (asr) asr->last_error.clear();
        if (diar) diar->last_error.clear();
        if (tagger) tagger->last_error.clear();
        return s;
    } catch (const std::exception& e) {
        (asr ? asr : diar ? diar : tagger)->last_error = e.what();
    } catch (...) {
        (asr ? asr : diar ? diar : tagger)->last_error = "unknown error";
    }
    return nullptr;
}

extern "C" char* parakeet_capi_scene_stream_feed_json(parakeet_scene_stream* s, const float* pcm,
                                                       int n, int is_last) {
    if (!s) return nullptr;
    if ((!pcm && n > 0) || n < 0) { s->last_error = "invalid samples buffer"; return nullptr; }
    if (s->scene->finished()) { s->last_error = "stream already finished"; return nullptr; }
    try {
        const pk::SceneUpdate u = s->scene->feed(pcm, n, is_last != 0);
        const pk::CedTagger* t = s->tagger_ctx ? s->tagger_ctx->tagger.get() : nullptr;
        s->last_error.clear();
        return dup_to_c(pk::scene_update_to_json(u, [t](int i) { return t ? t->label(i) : nullptr; }));
    } catch (const std::exception& e) {
        s->last_error = e.what();
        if (parakeet_ctx* c = scene_failed_ctx(s)) c->last_error = e.what();
    } catch (...) {
        s->last_error = "unknown error";
        if (parakeet_ctx* c = scene_failed_ctx(s)) c->last_error = "unknown error";
    }
    return nullptr;
}

extern "C" char* parakeet_capi_scene_stream_drain_scores_json(parakeet_scene_stream* s) {
    if (!s) return nullptr;
    try {
        const pk::CedTagger* t = s->tagger_ctx ? s->tagger_ctx->tagger.get() : nullptr;
        char* out = dup_to_c(pk::sound_windows_to_json(s->scene->drain_windows(),
                                                        [t](int i) { return t ? t->label(i) : nullptr; }));
        s->last_error.clear();
        return out;
    } catch (const std::exception& e) {
        s->last_error = e.what();
    } catch (...) {
        s->last_error = "unknown error";
    }
    return nullptr;
}

extern "C" const char* parakeet_capi_scene_stream_last_error(parakeet_scene_stream* s) {
    return s ? s->last_error.c_str() : "";
}

extern "C" void parakeet_capi_scene_stream_free(parakeet_scene_stream* s) { delete s; }
