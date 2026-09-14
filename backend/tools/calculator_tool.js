const math = require('mathjs');

/**
 * Calculator Tool
 * Evaluates mathematical and logical expressions for problem solving.
 */
class CalculatorTool {
  constructor() {
    this.name = 'calculator_tool';
    this.description = 'Exact mathematical computation engine for verifying numerical GATE calculations.';
  }

  evaluate(expression) {
    try {
      // Clean expression
      const sanitized = expression.replace(/[^0-9\+\-\*\/\^\(\)\.\,\s\%]/g, '');
      const result = math.evaluate(sanitized);
      return {
        expression,
        result,
        success: true
      };
    } catch (err) {
      return {
        expression,
        error: err.message,
        success: false
      };
    }
  }

  calculateAverage(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) return 0;
    const sum = numbers.reduce((a, b) => a + Number(b), 0);
    return Number((sum / numbers.length).toFixed(4));
  }
}

module.exports = new CalculatorTool();
