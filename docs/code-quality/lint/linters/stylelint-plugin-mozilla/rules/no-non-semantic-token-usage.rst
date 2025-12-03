===========================
no-non-semantic-token-usage
===========================

This rule checks that design tokens are only used with the appropriate CSS
properties. This ensures that that design tokens are not used with
unexpected properties, such as a font-size token to set a border-width.
This rule allows for variables used with fallback values and variables
used in shorthand properties.

Examples of incorrect token usage for this rule:
------------------------------------------------

.. code-block:: css

  .card {
    background-color: var(--border-color);
  }

.. code-block:: css

  .card {
    padding: var(--size-item-small);
  }

.. code-block:: css

  .card {
    width: var(--space-small);
  }

.. code-block:: css

  .button {
    border: var(--border-width) solid var(--text-color);
  }

.. code-block:: css

  :root {
    --local-background-color: var(--text-color);
  }

  .button {
    background-color: var(--local-background-color);
  }

Examples of correct code for this rule:
---------------------------------------

.. code-block:: css

    .card {
      background-color: var(--background-color-canvas);
    }

.. code-block:: css

    .card {
      background-color: var(--background-color-canvas, #fff);
    }

.. code-block:: css

    .card {
      background: repeat cover var(--background-color-canvas);
    }

.. code-block:: css

    .card {
      background: var(--background-color-canvas), #fff;
    }

.. code-block:: css

    .button {
      border: var(--border-width) solid var(--border-color);
    }
