// Quote helper for Buy flow
// Uses existing price data from database via RPC

import { supabase } from './supabase';

export interface Quote {
  available: boolean;
  marketplace?: string;
  price?: number;
  fees?: number;
  shipping?: number;
  total?: number;
  updatedAt?: string;
  reasonUnavailable?: string;
  lineItems?: { label: string; amount: number }[];
}

export interface QuoteResult {
  quote: Quote;
  loading: boolean;
  error: string | null;
}

// Fee and shipping estimates by marketplace
const MARKETPLACE_CONFIG: Record<string, { feeRate: number; shipping: number; label: string }> = {
  stockx: { feeRate: 0.12, shipping: 14, label: 'StockX' },
  goat: { feeRate: 0.10, shipping: 12, label: 'GOAT' },
  ebay: { feeRate: 0.13, shipping: 10, label: 'eBay' },
};

/**
 * Get a buy quote for a given style code
 * Uses database RPC to fetch existing price data
 */
export async function getBuyQuote(styleCode: string): Promise<Quote> {
  if (!styleCode) {
    return {
      available: false,
      reasonUnavailable: 'No style code provided',
    };
  }

  try {
    const { data, error } = await supabase.rpc('get_buy_quote', {
      p_style_code: styleCode,
    });

    if (error) {
      console.error('Quote RPC error:', error);
      return {
        available: false,
        reasonUnavailable: 'Updating prices...',
      };
    }

    if (!data || data.length === 0) {
      return {
        available: false,
        reasonUnavailable: 'Updating prices...',
      };
    }

    const row = data[0];

    if (!row.available) {
      return {
        available: false,
        reasonUnavailable: row.reason_unavailable || 'Updating prices...',
        updatedAt: row.updated_at,
      };
    }

    const lineItems: { label: string; amount: number }[] = [];
    if (row.price) lineItems.push({ label: 'Item price', amount: row.price });
    if (row.fees) lineItems.push({ label: 'Est. fees', amount: row.fees });
    if (row.shipping) lineItems.push({ label: 'Shipping', amount: row.shipping });

    return {
      available: true,
      marketplace: row.marketplace,
      price: row.price,
      fees: row.fees,
      shipping: row.shipping,
      total: row.total,
      updatedAt: row.updated_at,
      lineItems,
    };
  } catch (e) {
    console.error('Quote fetch error:', e);
    return {
      available: false,
      reasonUnavailable: 'Updating prices...',
    };
  }
}

/**
 * Calculate max total with buffer
 * Default: 5% buffer with minimum $10
 */
export function calculateMaxTotal(total: number, bufferPercent: number = 0.05, minBuffer: number = 10): number {
  const buffer = Math.max(total * bufferPercent, minBuffer);
  return Math.ceil(total + buffer);
}

/**
 * Format price for display
 */
export function formatPrice(price: number | undefined | null): string {
  if (price === null || price === undefined) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Format price with cents
 */
export function formatPriceWithCents(price: number | undefined | null): string {
  if (price === null || price === undefined) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/**
 * Get marketplace display label
 */
export function getMarketplaceLabel(marketplace: string | undefined | null): string {
  if (!marketplace) return 'Best Marketplace';
  return MARKETPLACE_CONFIG[marketplace.toLowerCase()]?.label || marketplace.toUpperCase();
}
