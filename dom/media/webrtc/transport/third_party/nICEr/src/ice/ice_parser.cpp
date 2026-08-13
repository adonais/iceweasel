/*
Copyright (c) 2007, Adobe Systems, Incorporated
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

* Redistributions of source code must retain the above copyright
  notice, this list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright
  notice, this list of conditions and the following disclaimer in the
  documentation and/or other materials provided with the distribution.

* Neither the name of Adobe Systems, Network Resonance nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

#include <csi_platform.h>
#include <sys/types.h>
#ifdef WIN32
#include <winsock2.h>
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <strings.h>
#endif
#include <string.h>
#include <assert.h>
#include <ctype.h>
#include <charconv>
#include "nr_api.h"
#include "ice_ctx.h"
#include "ice_candidate.h"
#include "ice_reg.h"

static void
skip_whitespace(const char **str)
{
    const char *c = *str;
    while (*c == ' ')
        ++c;

    *str = c;
}

static void
fast_forward(const char **str, int skip)
{
    const char *c = *str;
    while (*c != '\0' && skip-- > 0)
        ++c;

    *str = c;
}

static void
skip_to_past_space(const char **str)
{
    const char *c = *str;
    while (*c != ' ' && *c != '\0')
        ++c;

    *str = c;

    skip_whitespace(str);
}

static int
grab_token(const char **str, char **out)
{
    int _status;
    const char *c = *str;
    int len;
    char *tmp;

    while (*c != ' ' && *c != '\0')
        ++c;

    len = c - *str;

    tmp = (char*)malloc(len + 1);
    if (!tmp) {
        *out = 0;
        ABORT(R_NO_MEMORY);
    }

    memcpy(tmp, *str, len);
    tmp[len] = '\0';

    *str = c;
    *out = tmp;

    _status = 0;
abort:
    return _status;
}

/* RFC 8839 section 5.1: ice-char = ALPHA / DIGIT / "+" / "/". */
static int
is_ice_char(unsigned char c)
{
    return ((c >= 'A' && c <= 'Z') ||
            (c >= 'a' && c <= 'z') ||
            (c >= '0' && c <= '9') ||
            c == '+' || c == '/');
}

/* RFC 8839 section 5.1: foundation = 1*32ice-char. */
static int
validate_foundation(const char *foundation)
{
    size_t len = strlen(foundation);
    size_t i;
    if (len < 1 || len > 32)
        return R_BAD_DATA;
    for (i = 0; i < len; ++i) {
        if (!is_ice_char(foundation[i]))
            return R_BAD_DATA;
    }
    return 0;
}

/* Parse a decimal unsigned int from |*str|, range-check it to
 * [min, max], and require that the next character be a space or end of
 * string. On success, advances |*str| to that terminator. */
static int
parse_uint(const char **str, unsigned int min, unsigned int max,
           unsigned int *out)
{
    const char *end = *str + strlen(*str);
    unsigned int result;
    auto [ptr, ec] = std::from_chars(*str, end, result);
    if (ec != std::errc{} || result < min || result > max) {
        return R_BAD_DATA;
    }

    /* Reject trailing non-space cruft like "100abc"; the next character
     * must terminate the token. */
    if (*ptr != ' ' && *ptr != '\0') {
        return R_BAD_DATA;
    }

    *str = ptr;
    *out = result;
    return 0;
}

int
nr_ice_peer_candidate_from_attribute(nr_ice_ctx *ctx,const char *orig,nr_ice_media_stream *stream,nr_ice_candidate **candp)
{
    int r,_status;
    nr_ice_candidate *cand=0;

    if(!(cand=R_NEW(nr_ice_candidate)))
        ABORT(R_NO_MEMORY);

    if(!(cand->label=strdup(orig)))
        ABORT(R_NO_MEMORY);

    cand->ctx=ctx;
    cand->isock=0;
    cand->state=NR_ICE_CAND_PEER_CANDIDATE_UNPAIRED;
    cand->stream=stream;

    if ((r=nr_ice_parse_candidate_attribute(orig, cand)))
        ABORT(r);

    nr_ice_candidate_compute_codeword(cand);

    *candp=cand;

    _status=0;
  abort:
    if (_status){
        r_log(LOG_ICE,LOG_WARNING,"ICE(%s): Error parsing attribute: %s",ctx->label,orig);
        nr_ice_candidate_destroy(&cand);
    }

    return(_status);
}

int
nr_ice_parse_candidate_attribute(const char* orig, struct nr_ice_candidate_parsedbits *bits)
{
    int r,_status;
    const char* str = orig;
    char *connection_address=0;
    unsigned int port;
    int i;
    unsigned int component_id;
    char *rel_addr=0;
    unsigned char transport;

    /* Skip a= if present */
    if (!strncmp(str, "a=", 2))
        str += 2;

    /* Candidate attr */
    if (strncasecmp(str, "candidate:", 10))
        ABORT(R_BAD_DATA);

    fast_forward(&str, 10);
    if (*str == '\0')
        ABORT(R_BAD_DATA);

    /* Foundation */
    if ((r=grab_token(&str, &bits->foundation)))
        ABORT(r);

    if ((r=validate_foundation(bits->foundation)))
        ABORT(r);

    if (*str == '\0')
        ABORT(R_BAD_DATA);

    skip_whitespace(&str);
    if (*str == '\0')
        ABORT(R_BAD_DATA);

    /* component */
    if ((r=parse_uint(&str, 1, 256, &component_id)))
        ABORT(r);

    bits->component_id = (UCHAR)component_id;

    skip_whitespace(&str);
    if (*str == '\0')
        ABORT(R_BAD_DATA);

    /* Protocol */
    if (!strncasecmp(str, "UDP", 3))
      transport=IPPROTO_UDP;
    else if (!strncasecmp(str, "TCP", 3))
      transport=IPPROTO_TCP;
    else
      ABORT(R_BAD_DATA);

    fast_forward(&str, 3);
    if (*str == '\0')
        ABORT(R_BAD_DATA);

    skip_whitespace(&str);
    if (*str == '\0')
        ABORT(R_BAD_DATA);

    /* priority. RFC 8839 says this is a positive integer between 1 and
     * 2^31 - 1 inclusive. */
    if ((r=parse_uint(&str, 1, 0x7FFFFFFFu, &bits->priority)))
        ABORT(r);

    skip_whitespace(&str);
    if (*str == '\0')
        ABORT(R_BAD_DATA);

    /* Peer address/port */
    if ((r=grab_token(&str, &connection_address)))
        ABORT(r);

    if (*str == '\0')
        ABORT(R_BAD_DATA);

    skip_whitespace(&str);
    if (*str == '\0')
        ABORT(R_BAD_DATA);

    if ((r=parse_uint(&str, 0, 65535, &port)))
        ABORT(r);

    skip_whitespace(&str);

    if ((r=nr_str_port_to_transport_addr(connection_address,port,transport,&bits->addr)))
      ABORT(r);

    /* Transfer the raw connection_address text to bits so callers can
     * surface the original (non-normalized) form. */
    bits->raw_addr = connection_address;
    connection_address = 0;

    if (*str == '\0')
        ABORT(R_BAD_DATA);

    /* Type */
    if (strncasecmp("typ", str, 3))
        ABORT(R_BAD_DATA);

    fast_forward(&str, 3);
    if (*str == '\0')
        ABORT(R_BAD_DATA);

    skip_whitespace(&str);
    if (*str == '\0')
        ABORT(R_BAD_DATA);

    assert(nr_ice_candidate_type_names[0] == 0);

    for (i = 1; nr_ice_candidate_type_names[i]; ++i) {
        if(!strncasecmp(nr_ice_candidate_type_names[i], str, strlen(nr_ice_candidate_type_names[i]))) {
            bits->type=(nr_ice_candidate_type)i;
            break;
        }
    }
    if (nr_ice_candidate_type_names[i] == 0)
        ABORT(R_BAD_DATA);

    fast_forward(&str, strlen(nr_ice_candidate_type_names[i]));

    /* Look for the other side's raddr, rport */
    /* raddr, rport */
    switch (bits->type) {
    case HOST:
        break;
    case SERVER_REFLEXIVE:
    case PEER_REFLEXIVE:
    case RELAYED:

        skip_whitespace(&str);
        if (*str == '\0')
            ABORT(R_BAD_DATA);

        if (strncasecmp("raddr", str, 5))
            ABORT(R_BAD_DATA);

        fast_forward(&str, 5);
        if (*str == '\0')
            ABORT(R_BAD_DATA);

        skip_whitespace(&str);
        if (*str == '\0')
            ABORT(R_BAD_DATA);

        if ((r=grab_token(&str, &rel_addr)))
            ABORT(r);

        if (*str == '\0')
            ABORT(R_BAD_DATA);

        skip_whitespace(&str);
        if (*str == '\0')
            ABORT(R_BAD_DATA);

        if (strncasecmp("rport", str, 5))
              ABORT(R_BAD_DATA);

        fast_forward(&str, 5);
        if (*str == '\0')
            ABORT(R_BAD_DATA);

        skip_whitespace(&str);
        if (*str == '\0')
            ABORT(R_BAD_DATA);

        if ((r=parse_uint(&str, 0, 65535, &port)))
            ABORT(r);

        skip_whitespace(&str);

        if ((r=nr_str_port_to_transport_addr(rel_addr,port,transport,&bits->base)))
          ABORT(r);

        /* Transfer the raw rel-addr text to bits so callers can surface
         * the original (non-normalized) form. */
        bits->raw_raddr = rel_addr;
        rel_addr = 0;

        /* it's expected to be at EOD at this point */

        break;
    default:
        ABORT(R_INTERNAL);
        break;
    }

    skip_whitespace(&str);

    if (transport == IPPROTO_TCP && bits->type != RELAYED) {
      /* Parse tcptype extension per RFC 6544 S 4.5 */
      if (strncasecmp("tcptype ", str, 8))
        ABORT(R_BAD_DATA);

      fast_forward(&str, 8);
      skip_whitespace(&str);

      for (i = 1; nr_ice_candidate_tcp_type_names[i]; ++i) {
        if(!strncasecmp(nr_ice_candidate_tcp_type_names[i], str, strlen(nr_ice_candidate_tcp_type_names[i]))) {
          bits->tcp_type=(nr_socket_tcp_type)i;
          fast_forward(&str, strlen(nr_ice_candidate_tcp_type_names[i]));
          break;
        }
      }

      if (bits->tcp_type == 0)
        ABORT(R_BAD_DATA);

      if (*str && *str != ' ')
        ABORT(R_BAD_DATA);
    }
    /* Ignore extensions per RFC 5245 S 15.1 */

    _status=0;
  abort:
    free(connection_address);
    free(rel_addr);
    return(_status);
}

int
nr_ice_peer_ctx_parse_media_stream_attribute(nr_ice_peer_ctx *pctx, nr_ice_media_stream *stream, char *attr)
{
    int r,_status;
    const char *orig = 0;
    const char *str;

    orig = str = attr;

    if (!strncasecmp(str, "ice-ufrag:", 10)) {
      fast_forward(&str, 10);
      if (*str == '\0')
        ABORT(R_BAD_DATA);

      skip_whitespace(&str);
      if (*str == '\0')
        ABORT(R_BAD_DATA);

      free(stream->ufrag);
      if ((r=grab_token(&str, &stream->ufrag)))
        ABORT(r);
    }
    else if (!strncasecmp(str, "ice-pwd:", 8)) {
      fast_forward(&str, 8);
      if (*str == '\0')
        ABORT(R_BAD_DATA);

      skip_whitespace(&str);
      if (*str == '\0')
        ABORT(R_BAD_DATA);

      free(stream->pwd);
      if ((r=grab_token(&str, &stream->pwd)))
        ABORT(r);
    }
    else {
      ABORT(R_BAD_DATA);
    }

    skip_whitespace(&str);

    /* RFC 5245 grammar doesn't have an extension point for ice-pwd or
       ice-ufrag: if there's anything left on the line, we treat it as bad. */
    if (str[0] != '\0') {
      ABORT(R_BAD_DATA);
    }

    _status=0;
  abort:
    if (_status) {
      if (orig)
        r_log(LOG_ICE,LOG_WARNING,"ICE-PEER(%s): Error parsing attribute: %s",pctx->label,orig);
    }

    return(_status);
}

int
nr_ice_peer_ctx_parse_global_attributes(nr_ice_peer_ctx *pctx, char **attrs, int attr_ct)
{
    int r,_status;
    int i;
    const char *orig = 0;
    const char *str;
    char *component_id = 0;
    char *connection_address = 0;
    unsigned int port;
    in_addr_t addr;
    char *ice_option_tag = 0;

    for(i=0;i<attr_ct;i++){
        orig = str = attrs[i];

        component_id = 0;
        connection_address = 0;
        ice_option_tag = 0;

        if (!strncasecmp(str, "remote-candidates:", 18)) {
            fast_forward(&str, 18);
            skip_whitespace(&str);

            while (*str != '\0') {
                if ((r=grab_token(&str, &component_id)))
                    ABORT(r);

                if (*str == '\0')
                    ABORT(R_BAD_DATA);

                skip_whitespace(&str);
                if (*str == '\0')
                    ABORT(R_BAD_DATA);

                if ((r=grab_token(&str, &connection_address)))
                    ABORT(r);

                if (*str == '\0')
                    ABORT(R_BAD_DATA);

                addr = inet_addr(connection_address);
                if (addr == INADDR_NONE)
                    ABORT(R_BAD_DATA);

                skip_whitespace(&str);
                if (*str == '\0')
                    ABORT(R_BAD_DATA);

                if (sscanf(str, "%u", &port) != 1)
                    ABORT(R_BAD_DATA);

                if (port < 1 || port > 0x0FFFF)
                    ABORT(R_BAD_DATA);

                skip_to_past_space(&str);

                component_id = 0;  /* prevent free */
                free(connection_address);
                connection_address = 0;  /* prevent free */
            }
        }
        else if (!strncasecmp(str, "ice-lite", 8)) {
            pctx->peer_lite = 1;
            pctx->controlling = 1;

            fast_forward(&str, 8);
        }
        else if (!strncasecmp(str, "ice-mismatch", 12)) {
            pctx->peer_ice_mismatch = 1;

            fast_forward(&str, 12);
        }
        else if (!strncasecmp(str, "ice-ufrag:", 10)) {
            fast_forward(&str, 10);
            if (*str == '\0')
                ABORT(R_BAD_DATA);

            skip_whitespace(&str);
            if (*str == '\0')
                ABORT(R_BAD_DATA);
        }
        else if (!strncasecmp(str, "ice-pwd:", 8)) {
            fast_forward(&str, 8);
            if (*str == '\0')
                ABORT(R_BAD_DATA);

            skip_whitespace(&str);
            if (*str == '\0')
                ABORT(R_BAD_DATA);
        }
        else if (!strncasecmp(str, "ice-options:", 12)) {
            fast_forward(&str, 12);
            skip_whitespace(&str);

            while (*str != '\0') {
                if ((r=grab_token(&str, &ice_option_tag)))
                    ABORT(r);

                skip_whitespace(&str);

                //TODO: for now, just throw away; later put somewhere
                free(ice_option_tag);

                ice_option_tag = 0;  /* prevent free */
            }
        }
        else {
            ABORT(R_BAD_DATA);
        }

        skip_whitespace(&str);

      /* RFC 5245 grammar doesn't have an extension point for any of the
         preceding attributes: if there's anything left on the line, we
         treat it as bad data. */
      if (str[0] != '\0') {
        ABORT(R_BAD_DATA);
      }
    }

    _status=0;
  abort:
    if (_status) {
      if (orig)
        r_log(LOG_ICE,LOG_WARNING,"ICE-PEER(%s): Error parsing attribute: %s",pctx->label,orig);
    }

    free(connection_address);
    free(component_id);
    free(ice_option_tag);
    return(_status);
}

