/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Attempts to evaluate a CSS calc expression
 *
 * @param {string} expression - The CSS `calc()` expression to evaluate.
 *                              It can include numbers, units (e.g., px, %, rem), and operators (+, -, *, /).
 *
 * @returns {string} - The evaluated result of the expression as a string, including the unit (if any).
 *
 * @throws {Error} - Throws an error if the expression is invalid or if multiple units are mixed.
 *
 * @example
 * resolveCssCalc("2 * 5rem"); // returns "10rem"
 * resolveCssCalc("8 / 2"); // returns "4"
 * resolveCssCalc("2px + 5px"); // returns "7px"
 * resolveCssCalc("1% + 5px"); // throws Error: Mixing units is not allowed
 */
export const resolveCssCalc = expression => {
  const unitRegex = /[a-zA-Z%]+/g;
  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2 };

  // Tokenize the expression into numbers, units, and operators
  const tokens = expression.match(/\d*\.?\d+[a-zA-Z%]*|[-+*/()]/g);
  if (!tokens) {
    throw new Error("[resolveCssCalc] Invalid expression");
  }

  // Collect all unique units found in the expression
  const units = new Set();
  const parsedTokens = tokens.map(token => {
    const unit = token.match(unitRegex)?.[0] || ""; // Extract the unit from the token
    if (unit) {
      units.add(unit); // Add the unit to the set
    }
    return parseFloat(token) || token; // Parse the numeric value or keep the operator
  });

  // Ensure that only one type of unit is used in the expression
  // If two units eliminate each other (e.g. 5px - 5px + 1rem) then that also fails, but why should we make such calculations.
  if (units.size > 1) {
    throw new Error("[resolveCssCalc] Mixing units is not allowed");
  }
  const resultUnit = units.size ? [...units][0] : "";

  const output = [];
  const operators = [];

  // Function to compute the result of the top two numbers in the output stack
  const compute = () => {
    const b = output.pop();
    const a = output.pop();
    switch (operators.pop()) {
      case "+":
        output.push(a + b);
        break;
      case "-":
        output.push(a - b);
        break;
      case "*":
        output.push(a * b);
        break;
      case "/":
        output.push(a / b);
        break;
    }
  };

  // Process each token in the expression
  for (let i = 0; i < parsedTokens.length; i++) {
    let token = parsedTokens[i];
    // Push numbers to the output stack
    if (typeof token === "number") {
      output.push(token);
    }
    // Push opening parenthesis to the operators stack
    else if (token === "(") {
      operators.push(token);
    }
    // Compute closing parenthesis, until the matching opening parenthesis is found
    else if (token === ")") {
      while (operators.at(-1) !== "(") {
        compute();
      }
      // Remove the opening parenthesis from the stack
      operators.pop();
    }
    // If the token is an operator (+, -, *, /)
    else {
      // Handle signed numbers (e.g., "-5" or "+3")
      if (
        (token === "-" || token === "+") &&
        (i === 0 || parsedTokens[i - 1] === "(")
      ) {
        output.push(0); // Treat it as "0 - 5" or "0 + 3"
      }
      // While the precedence of the current operator is less than or equal to the operator on top of the stack,
      // compute the result of the top two numbers in the output stack
      while (
        operators.length &&
        precedence[token] <= precedence[operators.at(-1)]
      ) {
        compute();
      }
      // Push the current operator to the operators stack
      operators.push(token);
    }
  }
  // Compute any remaining operations in the stacks
  while (operators.length) {
    compute();
  }

  if (isNaN(output[0])) {
    throw new Error(
      "[resolveCssCalc] Resolving math expression resulted in NaN"
    );
  }
  return output[0] + resultUnit;
};
