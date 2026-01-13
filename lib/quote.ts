// Quote helper for Buy flow
// Uses existing price data from database via RPC
// Returns freshness states: 'fresh' | 'stale' | 'missing'

import { supabase } from './supabase';

export type Freshness = 'fresh' | 'stale' | 'missing';

export interface Quote {
  available: boolean;
  freshness: Freshness;
  marketplace?: string;
  price?: number;
  fees?: number;
  shipping?: number;
  total?: number;
  updatedAt?: string;
  minutesAgo?: number;
  reasonUnavailable?: string;
  lineItems?: { label: string; amount: number }[];
}

export interface QuoteResult {
  quote: Quote;
  loading: boolean;
  error: string | null;
}

export interface PriceRefreshRequest {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priceBefore?: number;
  priceAfter?: number;
  createdAt: string;
  completedAt?: string;
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
 * Returns freshness state: 'fresh', 'stale', or 'missing'
 */
export async function getBuyQuote(styleCode: string): Promise<Quote> {
  if (!styleCode) {
    return {
      available: false,
      freshness: 'missing',
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
        freshness: 'missing',
        reasonUnavailable: 'Could not load price',
      };
    }

    if (!data || data.length === 0) {
      return {
        available: false,
        freshness: 'missing',
        reasonUnavailable: 'No price available',
      };
    }

    const row = data[0];
    const freshness = (row.freshness || 'missing') as Freshness;

    if (!row.available) {
      return {
        available: false,
        freshness,
        reasonUnavailable: row.reason_unavailable || 'No price available',
        updatedAt: row.updated_at,
        minutesAgo: row.minutes_ago,
      };
    }

    const lineItems: { label: string; amount: number }[] = [];
    if (row.price) lineItems.push({ label: 'Item price', amount: row.price });
    if (row.fees) lineItems.push({ label: 'Est. fees', amount: row.fees });
    if (row.shipping) lineItems.push({ label: 'Shipping', amount: row.shipping });

    return {
      available: true,
      freshness,
      marketplace: row.marketplace,
      price: row.price,
      fees: row.fees,
      shipping: row.shipping,
      total: row.total,
      updatedAt: row.updated_at,
      minutesAgo: row.minutes_ago,
      lineItems,
    };
  } catch (e) {
    console.error('Quote fetch error:', e);
    return {
      available: false,
      freshness: 'missing',
      reasonUnavailable: 'Could not load price',
    };
  }
}

/**
 * Request a price refresh for a style code
 * Returns the refresh request ID for polling
 */
export async function requestPriceRefresh(styleCode: string, size?: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('request_price_refresh', {
      p_style_code: styleCode,
      p_size: size,
    });

    if (error) {
      console.error('Price refresh request error:', error);
      return null;
    }

    return data as string;
  } catch (e) {
    console.error('Price refresh error:', e);
    return null;
  }
}

/**
 * Trigger a real price refresh via edge function
 */
export async function triggerPriceRefresh(
  styleCode: string,
  accessToken: string,
  size?: string
): Promise<{ success: boolean; requestId?: string; priceAfter?: number; error?: string }> {
  try {
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/refresh-price`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          style_code: styleCode,
          size,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || 'Refresh failed' };
    }

    return {
      success: result.success,
      requestId: result.request_id,
      priceAfter: result.price_after,
      error: result.error,
    };
  } catch (e: any) {
    console.error('Trigger refresh error:', e);
    return { success: false, error: e.message || 'Refresh failed' };
  }
}

/**
 * Format time ago for freshness display
 */
export function formatTimeAgo(minutesAgo: number | undefined | null): string {
  if (minutesAgo === null || minutesAgo === undefined) return 'Unknown';
  if (minutesAgo < 1) return 'Just now';
  if (minutesAgo < 60) return `${Math.round(minutesAgo)}m ago`;
  if (minutesAgo < 1440) return `${Math.round(minutesAgo / 60)}h ago`;
  return `${Math.round(minutesAgo / 1440)}d ago`;
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
