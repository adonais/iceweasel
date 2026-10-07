/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsURLParsers_h_
#define nsURLParsers_h_

#include "nsIURLParser.h"

// All-in-one output struct for nsBaseURLParser::ParseAll. Holds every position
// and length nsStandardURL needs from a single parse, with all positions
// expressed relative to the input spec (offsets pre-applied by ParseAll).
struct URLParseResult {
  uint32_t schemePos = 0;
  int32_t schemeLen = -1;
  uint32_t authorityPos = 0;
  int32_t authorityLen = -1;
  uint32_t usernamePos = 0;
  int32_t usernameLen = -1;
  uint32_t passwordPos = 0;
  int32_t passwordLen = -1;
  uint32_t hostPos = 0;
  int32_t hostLen = -1;
  uint32_t pathPos = 0;
  int32_t pathLen = -1;
  uint32_t filepathPos = 0;
  int32_t filepathLen = -1;
  uint32_t directoryPos = 0;
  int32_t directoryLen = -1;
  uint32_t basenamePos = 0;
  int32_t basenameLen = -1;
  uint32_t extensionPos = 0;
  int32_t extensionLen = -1;
  uint32_t queryPos = 0;
  int32_t queryLen = -1;
  uint32_t refPos = 0;
  int32_t refLen = -1;
  int32_t port = -1;
};

//----------------------------------------------------------------------------
// base class for url parsers
//----------------------------------------------------------------------------

class nsBaseURLParser : public nsIURLParser {
 public:
  NS_DECL_NSIURLPARSER

  nsBaseURLParser() = default;

  // Non-XPCOM batched entry point used by nsStandardURL. Performs the full
  // ParseURL + ParseAuthority + ParsePath + ParseFilePath sequence with the
  // authority/path/filepath offsets already folded into the output positions,
  // and writes through a single struct reference instead of ~26 out-params.
  nsresult ParseAll(const char* spec, int32_t specLen, URLParseResult& aOut);

 protected:
  // implemented by subclasses
  virtual void ParseAfterScheme(const char* spec, int32_t specLen,
                                uint32_t* authPos, int32_t* authLen,
                                uint32_t* pathPos, int32_t* pathLen) = 0;
};

//----------------------------------------------------------------------------
// an url parser for urls that do not have an authority section
//
// eg. file:foo/bar.txt
//     file:/foo/bar.txt      (treated equivalently)
//     file:///foo/bar.txt
//
// eg. file:////foo/bar.txt   (UNC-filepath = \\foo\bar.txt)
//
// XXX except in this case:
//     file://foo/bar.txt     (the authority "foo"  is ignored)
//----------------------------------------------------------------------------

class nsNoAuthURLParser final : public nsBaseURLParser {
  ~nsNoAuthURLParser() = default;

 public:
  NS_DECL_THREADSAFE_ISUPPORTS

#if defined(XP_WIN)
  NS_IMETHOD ParseFilePath(const char*, int32_t, uint32_t*, int32_t*, uint32_t*,
                           int32_t*, uint32_t*, int32_t*) override;
#endif

  NS_IMETHOD ParseAuthority(const char* auth, int32_t authLen,
                            uint32_t* usernamePos, int32_t* usernameLen,
                            uint32_t* passwordPos, int32_t* passwordLen,
                            uint32_t* hostnamePos, int32_t* hostnameLen,
                            int32_t* port) override;

  void ParseAfterScheme(const char* spec, int32_t specLen, uint32_t* authPos,
                        int32_t* authLen, uint32_t* pathPos,
                        int32_t* pathLen) override;
};

//----------------------------------------------------------------------------
// an url parser for urls that must have an authority section
//
// eg. http:www.foo.com/bar.html
//     http:/www.foo.com/bar.html
//     http://www.foo.com/bar.html    (treated equivalently)
//     http:///www.foo.com/bar.html
//----------------------------------------------------------------------------

class nsAuthURLParser : public nsBaseURLParser {
 protected:
  virtual ~nsAuthURLParser() = default;

 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  NS_IMETHOD ParseAuthority(const char* auth, int32_t authLen,
                            uint32_t* usernamePos, int32_t* usernameLen,
                            uint32_t* passwordPos, int32_t* passwordLen,
                            uint32_t* hostnamePos, int32_t* hostnameLen,
                            int32_t* port) override;

  NS_IMETHOD ParseUserInfo(const char* userinfo, int32_t userinfoLen,
                           uint32_t* usernamePos, int32_t* usernameLen,
                           uint32_t* passwordPos,
                           int32_t* passwordLen) override;

  NS_IMETHOD ParseServerInfo(const char* serverinfo, int32_t serverinfoLen,
                             uint32_t* hostnamePos, int32_t* hostnameLen,
                             int32_t* port) override;

  void ParseAfterScheme(const char* spec, int32_t specLen, uint32_t* authPos,
                        int32_t* authLen, uint32_t* pathPos,
                        int32_t* pathLen) override;
};

//----------------------------------------------------------------------------
// an url parser for urls that may or may not have an authority section
//
// eg. http:www.foo.com              (www.foo.com is authority)
//     http:www.foo.com/bar.html     (www.foo.com is authority)
//     http:/www.foo.com/bar.html    (www.foo.com is part of file path)
//     http://www.foo.com/bar.html   (www.foo.com is authority)
//     http:///www.foo.com/bar.html  (www.foo.com is part of file path)
//----------------------------------------------------------------------------

class nsStdURLParser : public nsAuthURLParser {
  virtual ~nsStdURLParser() = default;

 public:
  void ParseAfterScheme(const char* spec, int32_t specLen, uint32_t* authPos,
                        int32_t* authLen, uint32_t* pathPos,
                        int32_t* pathLen) override;
};

#endif  // nsURLParsers_h_
