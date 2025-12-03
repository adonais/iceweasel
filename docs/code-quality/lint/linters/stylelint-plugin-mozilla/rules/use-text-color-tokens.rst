=====================
use-text-color-tokens
=====================

This rule checks that CSS declarations use text-color design token variables
instead of hard-coded values. This ensures consistent text-color across
the application and makes it easier to maintain design system adoption.

Examples of incorrect code for this rule:
-----------------------------------------

.. code-block:: css

  .card {
    color: #191919;
  }

.. code-block:: css

  .custom-button {
    color: rgba(42 42 42 / 0.15);
  }

.. code-block:: css

  button:hover {
    color: rgba(0 0 0 / 0.25);
  }

.. code-block:: css

  :root {
    --my-token: blue;
  }

  .my-button {
    color: var(--my-token, oklch(55% 0.21 15));
  }

Examples of correct token usage for this rule:
----------------------------------------------

.. code-block:: css

  .card {
    color: var(--text-color);
  }

.. code-block:: css

  .custom-button {
    color: var(--text-color);
  }

.. code-block:: css

  button:hover {
    color: --text-color;
  }

.. code-block:: css

  /* You may set a fallback for a token. */

  .my-button {
    color: var(--text-color, oklch(55% 0.21 15));
  }

.. code-block:: css

  /* Local CSS variables that reference valid text-color tokens are allowed */

  :root {
    --my-token: var(--text-color);
  }

  .my-button {
    color: var(--my-token, oklch(55% 0.21 15));
  }

The rule also allows these values non-token values:

.. code-block:: css

  .inherited-text-color{
    color: inherit;
  }

.. code-block:: css

  .unset-text-color {
    color: unset;
  }

.. code-block:: css

  .initial-text-color {
    color: initial;
  }

.. code-block:: css

  .current-text-color {
    color: currentColor;
  }
