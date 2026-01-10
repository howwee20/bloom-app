const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { fetchPrice } = require('./lib/stockx');

// CURRENT (BROKEN) FORMULA
const OLD_PROCESSING_RATE = 0.0483;  // 4.83% - WRONG
const OLD_TAX_RATE = 0.06;
const OLD_SHIPPING = 14.95;
const OLD_VOLATILITY_BUFFER = 1.015;  // 1.5% extra - WRONG

function oldCalculation(lowestAsk) {
  const processingFee = Math.round(lowestAsk * OLD_PROCESSING_RATE * 100) / 100;
  const taxBase = lowestAsk + processingFee;  // Tax on ask + processing - WRONG
  const estimatedTax = Math.round(taxBase * OLD_TAX_RATE * 100) / 100;
  const landedCost = lowestAsk + processingFee + estimatedTax + OLD_SHIPPING;
  const bloomPrice = Math.ceil(landedCost * OLD_VOLATILITY_BUFFER * 100) / 100;  // Buffer - WRONG

  return {
    lowestAsk,
    processingFee,
    taxBase,
    estimatedTax,
    shipping: OLD_SHIPPING,
    landedCost,
    volatilityBuffer: OLD_VOLATILITY_BUFFER,
    bloomPrice,
    overcharge: bloomPrice - lowestAsk
  };
}

// NEW (CORRECT) FORMULA - Michigan All-In
const NEW_PROCESSING_RATE = 0.03;  // 3%
const NEW_TAX_RATE = 0.06;         // 6%
const NEW_SHIPPING = 14.95;

function newCalculation(lowestAsk) {
  const processingFee = Math.round(lowestAsk * NEW_PROCESSING_RATE * 100) / 100;
  const shipping = NEW_SHIPPING;
  const michiganTax = Math.round(lowestAsk * NEW_TAX_RATE * 100) / 100;
  const bloomPrice = Math.round((lowestAsk + processingFee + shipping + michiganTax) * 100) / 100;

  return {
    lowestAsk,
    processingFee,
    shipping,
    michiganTax,
    bloomPrice,
    overcharge: bloomPrice - lowestAsk
  };
}

async function debug() {
  console.log('='.repeat(70));
  console.log('PRICE DEBUG: Nike SB Dunk Low Nardwuar (DO9392-700) Size 10');
  console.log('='.repeat(70));

  // Fetch real price from StockX
  const data = await fetchPrice('DO9392-700', '10');
  const ask = data.lowestAsk;

  console.log('\n📡 RAW API RESPONSE:');
  console.log('   StockX Lowest Ask: $' + ask);
  console.log('   Highest Bid: $' + data.highestBid);

  // OLD CALCULATION
  const old = oldCalculation(ask);
  console.log('\n❌ OLD (BROKEN) CALCULATION:');
  console.log('   Base Ask:           $' + old.lowestAsk.toFixed(2));
  console.log('   + Processing (4.83%): $' + old.processingFee.toFixed(2));
  console.log('   Tax Base:           $' + old.taxBase.toFixed(2));
  console.log('   + Tax (6% of base):   $' + old.estimatedTax.toFixed(2));
  console.log('   + Shipping:           $' + old.shipping.toFixed(2));
  console.log('   = Landed Cost:        $' + old.landedCost.toFixed(2));
  console.log('   × 1.015 Buffer:       $' + old.bloomPrice.toFixed(2));
  console.log('   ─────────────────────────────');
  console.log('   TOTAL OVERCHARGE:     $' + old.overcharge.toFixed(2) + ' (!' + Math.round(old.overcharge / ask * 100) + '% markup)');

  // NEW CALCULATION
  const newCalc = newCalculation(ask);
  console.log('\n✅ NEW (CORRECT) CALCULATION:');
  console.log('   Base Ask:           $' + newCalc.lowestAsk.toFixed(2));
  console.log('   + Processing (3%):    $' + newCalc.processingFee.toFixed(2));
  console.log('   + Shipping:           $' + newCalc.shipping.toFixed(2));
  console.log('   + MI Tax (6%):        $' + newCalc.michiganTax.toFixed(2));
  console.log('   ─────────────────────────────');
  console.log('   BLOOM PRICE:          $' + newCalc.bloomPrice.toFixed(2));
  console.log('   TOTAL FEES:           $' + newCalc.overcharge.toFixed(2) + ' (' + Math.round(newCalc.overcharge / ask * 100) + '% over ask)');

  // COMPARISON
  console.log('\n📊 COMPARISON:');
  console.log('   OLD Price: $' + old.bloomPrice.toFixed(2));
  console.log('   NEW Price: $' + newCalc.bloomPrice.toFixed(2));
  console.log('   SAVINGS:   $' + (old.bloomPrice - newCalc.bloomPrice).toFixed(2));
  console.log('='.repeat(70));
}

debug().catch(console.error);
