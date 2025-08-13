=========================
moz-cached-ohttp Protocol
=========================

The ``moz-cached-ohttp://`` protocol handler enables Firefox to load resources over Oblivious HTTP (OHTTP)
from privileged contexts, including in the privileged about content process. This mechanism provides
privacy-preserving resource loading, and was originally designed for loading images in about:newtab.

.. toctree::
   :maxdepth: 2

   usage
   api

Overview
========

The moz-cached-ohttp protocol implements a cache-first strategy that:

1. First attempts to load resources from the HTTP cache to minimize OHTTP requests
2. Falls back to loading via OHTTP when resources are not available in cache
3. Automatically caches OHTTP responses for future requests
4. Respects HTTP cache expiration headers for proper cache management, but
   otherwise defaults to 24 hours for the cache expiry.

Supported Contexts
==================

The protocol is restricted to specific contexts for security:

* **Privileged about content process**: Primary use case is for privacy-preserving image loading on about:newtab
* **System principals in parent process**: For tests and internal usage

URL Format
==========

The protocol uses a specific URL format to encode the target resource URL:

.. code-block::

   moz-cached-ohttp://newtab-image/?url=<encoded-url>

Where ``<encoded-url>`` is the URL-encoded target **HTTPS-only** image URL.

.. note::
    Only the ``newtab-image`` host is currently supported. The host determines which OHTTP configuration and relay will be used for the request. See ``HOST_MAP`` in ``MozCachedOHTTPProtocolHandler.sys.mjs``.

.. warning::

   Only HTTPS target URLs are supported for security. HTTP URLs will be rejected.

Example:

.. code-block::

   moz-cached-ohttp://newtab-image/?url=https%3A%2F%2Fexample.com%2Fimage.jpg

.. note::

   The OHTTP Relay and Gateway must both be configured to enable requests. The OHTTP Gateway also needs to have an allowlist that includes the resource endpoint, otherwise requests are likely to return ``403 Forbidden`` responses.

Host-Based Configuration
========================

The protocol uses a host-based configuration system that maps URL hosts to specific OHTTP settings. This design allows different types of resource requests to use different OHTTP configurations in the future.

Currently Supported Hosts
--------------------------

* **newtab-image**: Used for New Tab page image loading

  * Gateway Config URL preference: ``browser.newtabpage.activity-stream.discoverystream.ohttp.configURL``
  * Relay URL preference: ``browser.newtabpage.activity-stream.discoverystream.ohttp.relayURL``

Future Extensibility
--------------------

The host-based design allows easy addition of new hosts with different OHTTP configurations:

.. code-block:: javascript

   // Future hosts could be added like:
   // moz-cached-ohttp://other-service/?url=<encoded-url>
   // moz-cached-ohttp://ads-service/?url=<encoded-url>

Each host would map to its own set of configuration preferences, allowing different services to use different OHTTP infrastructure.
