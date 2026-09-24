#ifndef PARAKEET_H
#define PARAKEET_H
#ifdef __cplusplus
extern "C" {
#endif
// Returns a static version string. Never null.
const char* parakeet_version(void);

// Transcribe a wav file with the given GGUF model using the arch-default decoder
// (TDT head for tdt/hybrid_tdt_ctc/rnnt archs; CTC head for ctc archs).
// On success returns 0 and writes a malloc'd, NUL-terminated UTF-8 string to
// *out (the transcript; may be the empty string ""). The caller must release
// it with parakeet_free_string. On error returns nonzero and leaves *out
// unchanged. No C++ exceptions cross this boundary.
int parakeet_transcribe_file(const char* model_path, const char* wav_path, char** out);

// Frees a string previously returned via parakeet_transcribe_file. Safe on NULL.
void parakeet_free_string(char* s);
#ifdef __cplusplus
}
#endif

#ifdef __cplusplus
#include <string>
namespace pk {

// Decoder selector for pk::transcribe.
//   kDefault – choose by arch: TDT/RNNT-family archs use the TDT head (matching
//              NeMo's cur_decoder='rnnt' default); CTC-only archs use CTC.
//   kCTC     – force the CTC head regardless of arch.
//   kTDT     – force the TDT/RNNT head regardless of arch.
enum class Decoder { kDefault, kCTC, kTDT };

// End-to-end transcription.  Routes between the TDT greedy decoder and the CTC
// greedy decoder based on the GGUF 'parakeet.arch' metadata:
//   arch ∈ {tdt, hybrid_tdt_ctc, rnnt, hybrid_rnnt_ctc} → TDT head (default)
//   arch == ctc                                           → CTC head
// The optional 'decoder' parameter overrides the arch-based selection.
// Throws std::runtime_error on failure (model/audio load, unsupported arch, etc.).
std::string transcribe(const std::string& model_path, const std::string& wav_path,
                       Decoder decoder = Decoder::kDefault);

} // namespace pk
#endif

#endif // PARAKEET_H
