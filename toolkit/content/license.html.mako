## This Source Code Form is subject to the terms of the Mozilla Public
## License, v. 2.0. If a copy of the MPL was not distributed with this file,
## You can obtain one at http://mozilla.org/MPL/2.0/.
##
## Rendered by toolkit/content/gen_license_html.py from the LICENSES
## declarations collected across the tree into <objdir>/licenses.json.
## Do not add license text here; add it to the moz.build that owns the code.
<!DOCTYPE HTML>
<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this file,
   - You can obtain one at http://mozilla.org/MPL/2.0/.  -->

<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src chrome:; img-src chrome:; object-src 'none'">
    <meta charset="utf-8">
    <meta name="color-scheme" content="light dark">
    <title>Licenses</title>
    <link rel="stylesheet" href="chrome://global/skin/in-content/info-pages.css">
    <link rel="stylesheet" href="chrome://global/skin/aboutLicense.css">
  </head>

  <body id="lic-info">
  <div class="license-header">
    <div>
      <h1><a id="top"></a>Licenses</h1>
% if app_license_block:
${app_license_block}\
% endif
    </div>
  </div>
  <div>
    <p>All of the <b>source code</b> to this product is
       available under licenses which are both
       <a href="https://www.gnu.org/philosophy/free-sw.html">free</a> and
       <a href="https://www.opensource.org/docs/definition.php">open source</a>.
       A URL identifying the specific source code used to create this copy can be found
       on the <a href="about:buildconfig">build configuration page</a>, and you can read
       <a href="https://firefox-source-docs.mozilla.org/contributing/contribution_quickref.html">instructions
       on how to download and build the code for yourself</a>.
    </p>

    <p>More specifically, most of the source code is available under the
       <a href="about:license#mpl">Mozilla Public License 2.0</a> (MPL).
       The MPL has a
       <a href="https://www.mozilla.org/MPL/2.0/FAQ/">FAQ</a> to help
       you understand it. The remainder of the software which is not
       under the MPL is available under one of a variety of other
       free and open source licenses. Those that require reproduction
       of the license text in the distribution are given below.
       (Note: your copy of this product may not contain code covered by one
       or more of the licenses listed here, depending on the exact product
       and version you choose.)
    </p>

    <ul>
% for license in licenses:
      <li><a href="about:license#${license['id']}">${license['title']}</a></li>
% endfor
    </ul>

% if app_license_list_block:
The following licenses are specific to code used by the
${app_license_product_name}
product.

<!-- Index of product-specific licenses for non-Firefox apps. -->
${app_license_list_block}\
% endif


    </div>

    <hr>

    <table>
      <thead>
        <th>Name</th>
        <th>Paths</th>
        <th>License</th>
      </thead>
      <tbody>
% for license in licenses:
        <tr>
          <td>
            <h1><a id="${license['id']}"></a>${license['title']}</h1>
          </td>
          <td>
% if license['notice']:
            ${license['notice']}
% endif
% if license['paths']:
% if not license['notice_leads_paths']:
            <p>This license applies to the following paths:</p>
% endif
            <ul>
% for path in license['paths']:
              <li><code>${path}</code></li>
% endfor
            </ul>
% endif
% if not license['notice'] and not license['paths']:
            <p>N/A</p>
% endif
          </td>
          <td>
% if license['html']:
${license['text']}\
% else:
            <pre>
${license['text']}\
            </pre>
% endif
          </td>
        </tr>
% endfor
      </tbody>
    </table>

    <hr>

    <h1><a id="other-notices"></a>Other Required Notices</h1>

    <ul>
      <li>This software is based in part on the work of the Independent
          JPEG Group.</li>
      <li>Portions of the OS/2 and Android versions
          of this software are copyright &copy;1996-2012
          <a href="https://www.freetype.org/">The FreeType Project</a>.
          All rights reserved.</li>
      <li>Google Play and the Google Play logo are trademarks of Google LLC.</li>
      <li>App Store® and the App Store® logo are trademarks of Apple, Inc.</li>
    </ul>


    <hr>

    <h1><a id="optional-notices"></a>Optional Notices</h1>

    <p>Some permissive software licenses request but do not require an
    acknowledgement of the use of their software. We are very grateful
    to the following people and projects for their contributions to
    this product:</p>

    <ul>
      <li>The <a href="https://www.zlib.net/">zlib</a> compression library
          (Jean-loup Gailly, Mark Adler and team)</li>
      <li>The <a href="http://www.libpng.org/pub/png/">libpng</a> graphics library
          (Glenn Randers-Pehrson and team)</li>
      <li>The <a href="https://www.sqlite.org/">sqlite</a> database engine
          (D. Richard Hipp and team)</li>
      <li>The <a href="http://nsis.sourceforge.net/">Nullsoft Scriptable Install System</a>
          (Amir Szekely and team)</li>
      <li>The <a href="https://mattmccutchen.net/bigint/">C++ Big Integer Library</a>
          (Matt McCutchen)</li>
    </ul>



% if config.get("OS_ARCH") == "WINNT":

    <hr>

    <h1><a id="proprietary-notices"></a>Proprietary Operating System Components</h1>

    <p>Under some circumstances, under our
    <a href="https://www.mozilla.org/foundation/licensing/binary-components/">binary components policy</a>,
    Mozilla may decide to include additional
    operating system vendor code with the installer of our products designed
    for that vendor's proprietary platform, to make our products work well on
    that specific operating system. The following license statements
    apply to such inclusions.</p>

    <h2><a id="directx"></a>Microsoft Windows: Terms for 'Microsoft Distributable Code'</h2>

    <p>These terms apply to the following files;
    they are referred to below as "Distributable Code":
      <ul>
        <li><var>msvc*.dll</var> (C and C++ runtime libraries)</li>
        <li><var>vcruntime*.dll</var> (Visual C++ Runtime)</li>
      </ul>
    </p>

<pre>
Copyright (c) Microsoft Corporation.

The Distributable Code may be used and distributed only if you comply with the
following terms:

(i)   You may use, copy, and distribute the Distributable Code only as part of
      this product;
(ii)  You may not use the Distributable Code on a platform other than Windows;
(iii) You may not alter any copyright, trademark or patent notice in the
      Distributable Code;
(iv)  You may not modify or distribute the source code of any Distributable
      Code so that any part of the source code becomes subject to the MPL or
      any other copyleft license;
(v)   You must comply with any technical limitations in the Distributable Code
      that only allow you to use it in certain ways; and
(vi)  You must comply with all domestic and international export laws and
      regulations that apply to the Distributable Code.
</pre>

% endif

% if app_license_body_block:
<!-- List of product-specific licenses for non-Firefox apps. -->
${app_license_body_block}\
% endif

      <hr>

      <p><a href="about:license#top">Return to top</a>.</p>
    </div>
  </body>
</html>
