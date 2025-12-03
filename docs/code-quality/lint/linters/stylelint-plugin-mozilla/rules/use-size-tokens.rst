===============
use-size-tokens
===============

This rule checks that CSS declarations use size design token variables
instead of hardcoded values.

Examples of incorrect token usage for this rule:
------------------------------------------------

.. code-block:: css

  .card {
    min-width: 48px;
  }

.. code-block:: css

  .button {
    height: 0.75rem;
  }

.. code-block:: css

  .icon {
    width: 20px;
  }


.. code-block:: css

  .icon {
    width: calc(2 * 16px);
  }

.. code-block:: css

  :root {
    --local-size: 24px;
  }

  .button {
    min-height: var(--local-size);
  }

Examples of correct code for this rule:
---------------------------------------

.. code-block:: css

  .card {
    min-width: var(--size-item-large);
  }

.. code-block:: css

  .button {
    height: var(--button-min-height);
  }

.. code-block:: css

  .icon {
    width: var(--icon-size-medium);
  }

.. code-block:: css

  .icon {
    width: var(--icon-size-medium, 28px);
  }

.. code-block:: css

  .icon {
    width: calc(2 * var(--icon-size-medium));
  }

.. code-block:: css

  .icon {
    width: calc(2 * var(--icon-size-medium, 28px));
  }

.. code-block:: css

  :root {
    --local-size: var(--size-item-small);
  }

  .button {
    min-height: var(--local-size);
  }

.. code-block:: css

  .button {
    width: 100%;
  }

.. code-block:: css

  .button {
    width: auto;
  }

.. code-block:: css

  .icon {
    max-height: 2em;
  }
