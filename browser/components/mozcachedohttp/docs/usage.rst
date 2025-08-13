=====================
Developer Usage Guide
=====================

This guide explains how developers can use the moz-cached-ohttp protocol in Firefox code.

Basic Usage
===========

The moz-cached-ohttp protocol is designed to be used like any other resource loading mechanism in Firefox,
with the key differences being that it provides privacy-preserving OHTTP-based loading with automatic caching,
and cannot be used for regular content, so only privileged contexts can use the scheme.

Creating Resource Requests
==========================

To load a resource via the moz-cached-ohttp protocol, construct a URL in the following format:

.. code-block:: javascript

   const targetImageURL = "https://example.com/image.jpg";
   const encodedURL = encodeURIComponent(targetImageURL);
   const ohttpImageURL = `moz-cached-ohttp://newtab-image/?url=${encodedURL}`;

**Important**: The host must be ``newtab-image`` - other hosts are not currently supported and will result in an error.

.. note::

   Target URLs must use the HTTPS protocol. HTTP URLs will be rejected.

Using with Image Elements
-------------------------

The protocol can be used directly in HTML image elements within privileged contexts.

.. code-block:: html

   <img src="moz-cached-ohttp://newtab-image/?url=https%3A%2F%2Fexample.com%2Fimage.jpg" />

Using with Fetch API
---------------------

In privileged contexts, you can use the Fetch API:

.. code-block:: javascript

   try {
     const response = await fetch(ohttpImageURL);
     if (response.ok) {
       const blob = await response.blob();
       // Use the image blob
     }
   } catch (error) {
     console.error("Failed to load image:", error);
   }

Performance Best Practices
===========================

Cache Utilization
------------------

The protocol automatically handles caching, but you can optimize usage:

* **Consistent URLs**: Use the same encoded URL format for the same target resource
* **Have the server provide appropriate cache lifetimes**: The longer the lifetime, the less we may need to refetch the resource on the same client.
* **Respect cache headers**: Don't bypass cache unnecessarily with cache-busting parameters
* **Monitor cache hits**: In development, verify that repeated requests hit the cache
