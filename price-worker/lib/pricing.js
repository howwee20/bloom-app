/**
 * Michigan All-In Pricing Calculator
 *
 * Zero margin. Zero buffers. Exact cost to acquire from StockX.
 *
 * Formula:
 *   Base = StockX Lowest Ask
 *   + Processing Fee (3%)
 *   + Shipping ($14.95 flat)
 *   + Michigan Tax (6% of Base)
 *   = Bloom Price
 */

const PROCESSING_RATE = 0.03;   // 3% StockX processing
const SHIPPING = 14.95;         // Flat shipping
const MI_TAX_RATE = 0.06;       // 6% Michigan sales tax

/**
 * Calculate the Bloom price (Michigan All-In)
 * @param {number} lowestAsk - StockX lowest ask price
 * @returns {object} Pricing breakdown
 */
function calculateBloomPrice(lowestAsk) {
  if (!lowestAsk || lowestAsk <= 0) {
    throw new Error('Invalid lowest ask price');
  }

  const base = Number(lowestAsk);
  const processingFee = Math.round(base * PROCESSING_RATE * 100) / 100;
  const shipping = SHIPPING;
  const michiganTax = Math.round(base * MI_TAX_RATE * 100) / 100;
  const bloomPrice = Math.round((base + processingFee + shipping + michiganTax) * 100) / 100;

  return {
    base,
    processingFee,
    shipping,
    michiganTax,
    bloomPrice,
    totalFees: Math.round((processingFee + shipping + michiganTax) * 100) / 100
  };
}

module.exports = {
  calculateBloomPrice,
  PROCESSING_RATE,
  SHIPPING,
  MI_TAX_RATE
};
