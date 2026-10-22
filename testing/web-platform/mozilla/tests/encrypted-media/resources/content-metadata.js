// Encrypted content which is local to Mozilla's tree. This must be loaded after
// the upstream /encrypted-media/content/content-metadata.js, which it extends.
//
// Every item here is encrypted with the upstream mp4-basic key (KID
// ad13f9ea2be698b875f504a8e3ccea64), which is the only key the DRM license
// servers used by the upstream encrypted-media tests know about, so they share
// its assetId and keys.
(function () {
  const mp4Basic = content["mp4-basic"];
  const items = {
    "mp4-opus": {
      audio: {
        type: 'audio/mp4; codecs="opus"',
        path: "/_mozilla/encrypted-media/content/audio_opus_enc.mp4",
      },
    },
    "mp4-flac": {
      audio: {
        type: 'audio/mp4; codecs="flac"',
        path: "/_mozilla/encrypted-media/content/audio_flac_enc.mp4",
      },
    },
    "webm-vorbis": {
      audio: {
        type: 'audio/webm; codecs="vorbis"',
        path: "/_mozilla/encrypted-media/content/audio_vorbis_enc.webm",
      },
    },
  };

  for (const [name, item] of Object.entries(items)) {
    content[name] = {
      name,
      assetId: mp4Basic.assetId,
      initDataType: "cenc",
      keys: mp4Basic.keys,
      ...item,
    };
    content._items.push(content[name]);
  }
})();
