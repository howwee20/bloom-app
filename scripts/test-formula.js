// Test the corrected Michigan all-in pricing formula
// Expected: $302 base → $350.54 total (from real StockX checkout)

const PROCESSING_RATE = 0.04831;  // 4.831%
const TAX_RATE = 0.06;            // 6%
const SHIPPING_FEE = 14.95;

function calculateAllInPrice(base) {
  const processingFee = Math.round(base * PROCESSING_RATE * 100) / 100;
  const salesTax = Math.round((base + processingFee) * TAX_RATE * 100) / 100;
  const total = Math.round((base + processingFee + salesTax + SHIPPING_FEE) * 100) / 100;

  return {
    base,
    processingFee,
    salesTax,
    shippingFee: SHIPPING_FEE,
    total,
  };
}

console.log('='.repeat(60));
console.log('MICHIGAN ALL-IN PRICING FORMULA TEST');
console.log('='.repeat(60));
console.log();
console.log('Formula:');
console.log('  processingFee = base × 4.831%');
console.log('  salesTax = (base + processingFee) × 6%');
console.log('  total = base + processingFee + salesTax + $14.95');
console.log();

// Test case from user's screenshot
const testBase = 302;
const result = calculateAllInPrice(testBase);

console.log('Test Case: $302 base price (from StockX checkout screenshot)');
console.log('-'.repeat(40));
console.log(`  Base:           $${result.base.toFixed(2)}`);
console.log(`  Processing Fee: $${result.processingFee.toFixed(2)} (${testBase} × ${PROCESSING_RATE * 100}%)`);
console.log(`  Sales Tax:      $${result.salesTax.toFixed(2)} ((${testBase} + ${result.processingFee}) × ${TAX_RATE * 100}%)`);
console.log(`  Shipping:       $${result.shippingFee.toFixed(2)}`);
console.log(`  ─────────────────────`);
console.log(`  Total:          $${result.total.toFixed(2)}`);
console.log();

// Expected values from screenshot
const expected = {
  base: 302.00,
  processingFee: 14.59,
  salesTax: 19.00,
  shippingFee: 14.95,
  total: 350.54,
};

console.log('Expected (from screenshot):');
console.log(`  Base:           $${expected.base.toFixed(2)}`);
console.log(`  Processing Fee: $${expected.processingFee.toFixed(2)}`);
console.log(`  Sales Tax:      $${expected.salesTax.toFixed(2)}`);
console.log(`  Shipping:       $${expected.shippingFee.toFixed(2)}`);
console.log(`  Total:          $${expected.total.toFixed(2)}`);
console.log();

// Verify each component
const checks = [
  { name: 'Processing Fee', actual: result.processingFee, expected: expected.processingFee },
  { name: 'Sales Tax', actual: result.salesTax, expected: expected.salesTax },
  { name: 'Total', actual: result.total, expected: expected.total },
];

console.log('Verification:');
let allPassed = true;
checks.forEach(check => {
  const passed = Math.abs(check.actual - check.expected) < 0.01;
  const status = passed ? '✓' : '✗';
  console.log(`  ${status} ${check.name}: ${check.actual.toFixed(2)} ${passed ? '==' : '!='} ${check.expected.toFixed(2)}`);
  if (!passed) allPassed = false;
});

console.log();
console.log('='.repeat(60));
console.log(allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
console.log('='.repeat(60));

// Additional test cases
console.log();
console.log('Additional test cases:');
console.log('-'.repeat(40));
[100, 150, 250, 400, 500].forEach(base => {
  const r = calculateAllInPrice(base);
  console.log(`  $${base.toString().padStart(3)} → $${r.total.toFixed(2)} (fees: $${(r.total - base).toFixed(2)})`);
});
