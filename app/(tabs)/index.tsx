// HOME Screen - Portfolio View (Coinbase Style with Zen Dots)
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fonts, theme } from '../../constants/Colors';

type CustodyFilter = 'bloom' | 'home' | 'watchlist';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';

// Web-compatible alert/confirm
const showAlert = (title: string, message: string, buttons?: Array<{text: string, onPress?: () => void, style?: string}>) => {
  if (Platform.OS === 'web') {
    if (buttons && buttons.length > 1) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) {
        const confirmButton = buttons.find(b => b.style === 'destructive' || b.text !== 'Cancel');
        confirmButton?.onPress?.();
      }
    } else {
      window.alert(`${title}\n\n${message}`);
      buttons?.[0]?.onPress?.();
    }
  } else {
    Alert.alert(title, message, buttons);
  }
};

const PRICE_FRESHNESS_MINUTES = 15;
const PRICE_STALE_HOURS = 24;
const MARKETPLACE_LABELS: Record<string, string> = {
  stockx: 'StockX',
};
const MARKETPLACE_FEES: Record<string, { feeRate: number; shipping: number }> = {
  stockx: { feeRate: 0.12, shipping: 14 },
};

// Token interface for ownership-first model
interface Token {
  id: string;
  order_id: string;
  sku: string;
  product_name: string;
  size: string;
  product_image_url: string | null;
  purchase_price: number;
  purchase_date: string;
  custody_type: 'bloom' | 'home'; // Bloom vault or user's home
  is_exchange_eligible: boolean;
  current_value: number | null;
  pnl_dollars: number | null;
  pnl_percent: number | null;
  match_status?: 'matched' | 'pending';
  last_price_checked_at?: string | null;
  last_price_updated_at?: string | null;
  status: 'acquiring' | 'in_custody' | 'listed' | 'redeeming' | 'shipped' | 'redeemed' | 'shipping_to_bloom';
}

interface TokenPortfolioSummary {
  total_value: number;
  total_cost: number;
  total_pnl_dollars: number | null;
  total_pnl_percent: number | null;
  token_count: number;
  in_custody_count: number;
  acquiring_count: number;
  redeeming_count: number;
  redeemed_count: number;
  bloom_count?: number;
  home_count?: number;
}

// Legacy asset interface (for backwards compatibility)
interface Asset {
  id: string;
  name: string;
  image_url: string | null;
  size: string | null;
  category: string | null;
  stockx_sku: string | null;
  catalog_item_id?: string | null;
  current_price: number;
  entry_price: number | null;
  pnl_dollars: number | null;
  pnl_percent: number | null;
  last_price_update: string | null;
  last_price_checked_at?: string | null;
  last_price_updated_at?: string | null;
  updated_at_pricing?: string | null;
  location?: 'home' | 'watchlist' | 'bloom';
}

interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_pnl_dollars: number | null;
  total_pnl_percent: number | null;
  asset_count: number;
}

interface TopMover {
  item_type: 'token' | 'asset';
  item_id: string;
  name: string;
  image_url: string | null;
  size: string | null;
  current_value: number;
  price_change: number;
  price_change_percent: number;
}

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  is_read: boolean;
}

interface WeeklyDigest {
  id: string;
  week_start: string;
  total_value: number | null;
  total_pnl_dollars: number | null;
  total_pnl_percent: number | null;
  created_at: string;
}

interface SellItem {
  id: string;
  type: 'token' | 'asset';
  name: string;
  size?: string | null;
  sku?: string | null;
  subtitle: string;
  custodyLabel: string;
  custodyType: 'home' | 'bloom';
  value: number;
  imageUrl: string | null;
}

export default function HomeScreen() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [tokenSummary, setTokenSummary] = useState<TokenPortfolioSummary | null>(null);
  const [ownedAssets, setOwnedAssets] = useState<Asset[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  // Buy Intent and Route Home modals removed - Buy button now navigates to /buy
  const [showSellModal, setShowSellModal] = useState(false);
  const [showSellOptions, setShowSellOptions] = useState(false);
  const [selectedSellItem, setSelectedSellItem] = useState<SellItem | null>(null);
  const [showBloomMarketOptions, setShowBloomMarketOptions] = useState(false);
  const [marketplaceSellLoading, setMarketplaceSellLoading] = useState(false);
  const [showExchangeListing, setShowExchangeListing] = useState(false);
  const [exchangeListingPrice, setExchangeListingPrice] = useState('');
  const [exchangeListingLoading, setExchangeListingLoading] = useState(false);
  const [exchangeListingSuccess, setExchangeListingSuccess] = useState(false);
  const [topMovers, setTopMovers] = useState<TopMover[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [weeklyDigest, setWeeklyDigest] = useState<WeeklyDigest | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [pollIntervalMs, setPollIntervalMs] = useState(2 * 60 * 1000);
  const [updateDelayed, setUpdateDelayed] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [now, setNow] = useState(Date.now());
  const [isFocused, setIsFocused] = useState(true);
  const [showBalanceBreakdown, setShowBalanceBreakdown] = useState(false);
  const [activeFilter, setActiveFilter] = useState<CustodyFilter>('bloom');

  const handleImageError = (assetId: string) => {
    setFailedImages(prev => new Set(prev).add(assetId));
  };

  const fetchPortfolio = useCallback(async (options?: { silent?: boolean }) => {
    if (!session) return;

    try {
      // Fetch token portfolio summary (ownership-first model)
      const { data: tokenSummaryData, error: tokenSummaryError } = await supabase.rpc('get_token_portfolio_summary');
      if (!tokenSummaryError && tokenSummaryData && tokenSummaryData.length > 0) {
        setTokenSummary(tokenSummaryData[0]);
      }

      // Fetch tokens (ownership-first model)
      const { data: tokenData, error: tokenError } = await supabase.rpc('get_user_tokens');
      if (!tokenError && tokenData) {
        setTokens(tokenData);
      }

      // Legacy: Fetch old portfolio summary with P&L
      const { data: summaryData, error: summaryError } = await supabase.rpc('get_portfolio_summary');
      if (!summaryError && summaryData && summaryData.length > 0) {
        setSummary(summaryData[0]);
      }

      // Legacy: Fetch assets with P&L
      const { data: assets, error: assetsError } = await supabase.rpc('get_portfolio_with_pnl');
      if (!assetsError && assets) {
        setOwnedAssets(assets);
      }

      const { data: moversData } = await supabase.rpc('get_user_top_movers', { p_limit: 3 });
      setTopMovers(moversData || []);

      const { data: notificationsData } = await supabase
        .from('notifications')
        .select('id, title, body, created_at, is_read')
        .order('created_at', { ascending: false })
        .limit(3);
      setNotifications((notificationsData as NotificationRow[]) || []);

      const { data: digestData } = await supabase
        .from('weekly_digests')
        .select('id, week_start, total_value, total_pnl_dollars, total_pnl_percent, created_at')
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      setWeeklyDigest((digestData as WeeklyDigest) || null);

      // Use last successful job timestamp only (truth source)
      const { data: lastJobUpdate, error: lastJobError } = await supabase.rpc('get_last_successful_price_update');
      if (!lastJobError && lastJobUpdate) {
        setLastUpdatedAt(new Date(lastJobUpdate));
      } else {
        setLastUpdatedAt(null);
      }
      setUpdateDelayed(false);
      setPollIntervalMs(2 * 60 * 1000);
    } catch (e) {
      console.error('Error fetching portfolio:', e);
      setUpdateDelayed(true);
      setPollIntervalMs((prev) => {
        if (prev <= 2 * 60 * 1000) return 5 * 60 * 1000;
        return 5 * 60 * 1000;
      });
    } finally {
      if (!options?.silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      setLoading(true);
      fetchPortfolio();
      return () => setIsFocused(false);
    }, [fetchPortfolio])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!session || appState !== 'active' || !isFocused) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [session, appState]);

  const isForeground = appState === 'active';

  useEffect(() => {
    if (!selectedSellItem) {
      setShowBloomMarketOptions(false);
      setExchangeListingPrice('');
      setExchangeListingSuccess(false);
      return;
    }
    setShowBloomMarketOptions(false);
    setExchangeListingPrice(
      Number.isFinite(selectedSellItem.value) ? selectedSellItem.value.toFixed(2) : ''
    );
    setExchangeListingSuccess(false);
  }, [selectedSellItem]);

  useEffect(() => {
    if (!session || !isForeground || !isFocused) return;
    if (loading) return;

    const interval = setInterval(() => {
      fetchPortfolio({ silent: true });
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [session, isForeground, isFocused, pollIntervalMs, fetchPortfolio, loading]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPortfolio();
  }, [fetchPortfolio]);

  // For market prices - shows "Updating..." when price is unavailable
  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined || price === 0) return 'Updating...';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
  };

  // For calculated values (fees, payouts) - always shows currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPnL = (value: number | null) => {
    if (value === null || value === 0) return '--';
    const sign = value >= 0 ? '+' : '';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
    return `${sign}${formatted}`;
  };

  // Get status config for token
  const getStatusConfig = (status: Token['status']) => {
    switch (status) {
      case 'in_custody':
        return { label: 'Ready', color: theme.success, icon: '●' };
      case 'acquiring':
        return { label: 'Acquiring...', color: '#F5A623', icon: '◐' };
      case 'listed':
        return { label: 'Listed', color: theme.accent, icon: '●' };
      case 'redeeming':
        return { label: 'Redeeming...', color: '#F5A623', icon: '◐' };
      case 'shipped':
        return { label: 'Shipped', color: '#F5A623', icon: '→' };
      case 'redeemed':
        return { label: 'Redeemed', color: theme.textSecondary, icon: '✓' };
      case 'shipping_to_bloom':
        return { label: 'SHIPPING TO BLOOM', color: '#F5A623', icon: '→' };
      default:
        return { label: '', color: theme.textSecondary, icon: '' };
    }
  };

  // Get P&L color based on value
  const getPnlColor = (value: number | null) => {
    if (value === null || value === 0) return theme.textSecondary;
    return value > 0 ? theme.success : theme.error;
  };

  // Format P&L with sign and percentage
  const formatPnLWithPercent = (dollars: number | null, percent: number | null) => {
    if (dollars === null || dollars === 0) return null;
    const sign = dollars > 0 ? '+' : '';
    const dollarStr = `${sign}$${Math.abs(dollars).toFixed(2)}`;
    const percentStr = percent !== null ? ` (${sign}${percent.toFixed(1)}%)` : '';
    return `${dollarStr}${percentStr}`;
  };

  const computePnl = (current: number | null | undefined, cost: number | null | undefined) => {
    if (current === null || current === undefined) return null;
    if (cost === null || cost === undefined || cost <= 0) return null;
    const delta = current - cost;
    const percent = cost > 0 ? (delta / cost) * 100 : null;
    return { delta, percent };
  };

  const formatRelativeTime = (date: Date) => {
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const isTimestampStale = (value?: string | null) => {
    if (!value) return true;
    const timestampMs = new Date(value).getTime();
    if (Number.isNaN(timestampMs)) return true;
    return (now - timestampMs) > PRICE_STALE_HOURS * 60 * 60 * 1000;
  };

  // Route Home helper functions removed - now handled in /buy screen

  const marketplaceOptions = selectedSellItem
    ? Object.entries(MARKETPLACE_FEES).map(([id, fees]) => {
        const gross = selectedSellItem.value || 0;
        const feeEstimate = Math.round(gross * fees.feeRate * 100) / 100;
        const shipping = fees.shipping;
        const net = Math.max(gross - feeEstimate - shipping, 0);
        return {
          id,
          name: MARKETPLACE_LABELS[id] || id.toUpperCase(),
          gross,
          feeEstimate,
          shipping,
          net,
        };
      })
    : [];

  const bestOptionId = marketplaceOptions.reduce((best, option) => {
    if (!best || option.net > best.net) return option;
    return best;
  }, null as null | (typeof marketplaceOptions)[number])?.id;

  const isBloomCustody = selectedSellItem?.custodyType === 'bloom';
  const canListOnExchange = selectedSellItem?.type === 'token' && selectedSellItem?.custodyType === 'bloom';
  const showMarketplaceCards = !isBloomCustody || showBloomMarketOptions;

  const handleOpenExchangeListing = () => {
    if (!selectedSellItem) return;
    if (selectedSellItem.type !== 'token' || selectedSellItem.custodyType !== 'bloom') {
      showAlert('Exchange requires Bloom custody', 'Only Bloom custody items can be listed on the exchange.');
      return;
    }
    setShowSellOptions(false);
    setShowExchangeListing(true);
  };

  const closeExchangeListing = () => {
    setShowExchangeListing(false);
    setExchangeListingLoading(false);
    setExchangeListingSuccess(false);
    setSelectedSellItem(null);
  };

  const handleMarketplaceSellRequest = async (marketplaceId: string) => {
    if (!selectedSellItem) return;
    if (!session?.user?.id) {
      showAlert('Not signed in', 'Please sign in to sell.');
      return;
    }
    if (selectedSellItem.type !== 'token') {
      showAlert('Unavailable', 'Marketplace selling is only supported for tokens right now.');
      return;
    }
    if (!selectedSellItem.size) {
      showAlert('Missing size', 'Add a size to continue.');
      return;
    }
    const fees = MARKETPLACE_FEES[marketplaceId];
    if (!fees) {
      showAlert('Unavailable', 'Marketplace pricing is not available yet.');
      return;
    }

    try {
      const gross = selectedSellItem.value || 0;
      if (gross <= 0) {
        showAlert('Price updating', 'Live pricing is updating. Try again shortly.');
        return;
      }
      setMarketplaceSellLoading(true);
      const feeEstimate = gross * fees.feeRate;
      const payoutEstimate = Math.max(gross - feeEstimate - fees.shipping, 0);

      const { error } = await supabase
        .from('marketplace_sell_requests')
        .insert({
          token_id: selectedSellItem.id,
          user_id: session.user.id,
          marketplace: marketplaceId,
          size: selectedSellItem.size,
          requested_price: gross,
          payout_estimate: payoutEstimate,
          status: 'requested',
        });

      if (error) throw error;

      setShowSellOptions(false);
      setSelectedSellItem(null);
      setShowBloomMarketOptions(false);
      showAlert('Sell request sent', 'Bloom will list it for you and notify you when it sells.');
    } catch (e: any) {
      showAlert('Request failed', e.message || 'Please try again.');
    } finally {
      setMarketplaceSellLoading(false);
    }
  };

  const handleConfirmExchangeListing = async () => {
    if (!selectedSellItem) return;
    if (!session?.user?.id) {
      showAlert('Not signed in', 'Please sign in to list on the exchange.');
      return;
    }
    if (selectedSellItem.type !== 'token' || selectedSellItem.custodyType !== 'bloom') {
      showAlert('Exchange requires Bloom custody', 'Only Bloom custody items can be listed on the exchange.');
      return;
    }

    const price = Number.parseFloat(exchangeListingPrice);
    if (Number.isNaN(price) || price < 50 || price > 50000) {
      showAlert('Invalid price', 'Price must be between $50 and $50,000.');
      return;
    }

    try {
      setExchangeListingLoading(true);
      const { data, error } = await supabase.rpc('list_token_for_sale', {
        p_token_id: selectedSellItem.id,
        p_listing_price: price,
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Failed to list token');
      }

      const { error: insertError } = await supabase
        .from('exchange_listings')
        .insert({
          user_id: session.user.id,
          token_id: selectedSellItem.id,
          ask_price: price,
          status: 'active',
        });

      if (insertError) {
        await supabase.rpc('unlist_token', { p_token_id: selectedSellItem.id });
        throw new Error(insertError.message || 'Failed to create exchange listing');
      }

      setExchangeListingSuccess(true);
      fetchPortfolio({ silent: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Please try again.';
      showAlert('Listing failed', message);
    } finally {
      setExchangeListingLoading(false);
    }
  };

  // Handle token removal
  const handleRemoveToken = async (token: Token) => {
    const doRemove = async () => {
      try {
        // First delete any related token_transfers
        await supabase
          .from('token_transfers')
          .delete()
          .eq('token_id', token.id);

        // Then delete the token
        const { error } = await supabase
          .from('tokens')
          .delete()
          .eq('id', token.id);

        if (error) throw error;

        showAlert('Removed', 'Item removed from portfolio.');
        fetchPortfolio();
      } catch (e: any) {
        showAlert('Error', e.message || 'Failed to remove item.');
      }
    };

    showAlert(
      'Remove from Portfolio?',
      `Remove "${token.product_name}" from your portfolio? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]
    );
  };

  // Render token card - brokerage style with P&L
  const renderTokenCard = ({ item }: { item: Token }) => {
    const showImage = item.product_image_url && !failedImages.has(item.id);
    const isPendingMatch = item.match_status === 'pending' || item.current_value === null;
    const pnlData = computePnl(item.current_value, item.purchase_price);
    const statusConfig = isPendingMatch
      ? { label: 'Needs match', color: theme.warning, icon: '●' }
      : getStatusConfig(item.status);
    const showStatusBadge = isPendingMatch || (item.status !== 'in_custody' && item.status !== undefined);
    const pnlStr = isPendingMatch ? null : formatPnLWithPercent(pnlData?.delta ?? null, pnlData?.percent ?? null);
    const pnlColor = getPnlColor(pnlData?.delta ?? null);
    const isBloom = item.custody_type === 'bloom';
    const pricingTimestamp = item.last_price_checked_at || item.last_price_updated_at || null;
    const isPriceStale = !isPendingMatch && isTimestampStale(pricingTimestamp);

    return (
      <Pressable
        style={[styles.assetCard, isBloom && styles.assetCardBloom]}
        onPress={() => router.push(`/token/${item.id}`)}
        onLongPress={() => handleRemoveToken(item)}
        delayLongPress={500}
      >
        <View style={[styles.cardImageContainer, isBloom && styles.cardImageContainerBloom]}>
          {showImage ? (
            <Image
              source={{ uri: item.product_image_url! }}
              style={styles.cardImage}
              resizeMode="contain"
              onError={() => handleImageError(item.id)}
            />
          ) : (
            <View style={[styles.cardImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{item.product_name.charAt(0)}</Text>
            </View>
          )}
          {/* Status badge overlay */}
          {showStatusBadge && (
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.color }]}>
              <Text style={styles.statusBadgeText}>{statusConfig.label}</Text>
            </View>
          )}
        </View>

        <View style={[styles.cardInfo, isBloom && styles.cardInfoBloom]}>
          <Text style={[styles.cardName, isBloom && styles.cardNameBloom]} numberOfLines={2}>
            {item.product_name}
          </Text>
          <Text
            style={[
              styles.cardPrice,
              isBloom && styles.cardPriceBloom,
              isPriceStale && styles.cardPriceStale,
            ]}
          >
            {isPendingMatch ? 'Needs match' : formatPrice(item.current_value)}
          </Text>
          {isPriceStale && (
            <View style={styles.priceStaleBadge}>
              <Text style={styles.priceStaleBadgeText}>Updating...</Text>
            </View>
          )}
          <View style={styles.cardPnlRow}>
            {pnlStr ? (
              <Text style={[styles.cardPnl, { color: pnlColor }]}>{pnlStr}</Text>
            ) : isPendingMatch ? (
              <Text style={[styles.cardMeta, isBloom && styles.cardMetaBloom]}>Add details to match</Text>
            ) : (
              <Text style={[styles.cardMetaCta, isBloom && styles.cardMetaBloom]}>Add what you paid</Text>
            )}
          </View>
          {item.size && !pnlStr && !isPendingMatch && (
            <Text style={[styles.cardMeta, isBloom && styles.cardMetaBloom]}>Size {item.size}</Text>
          )}
        </View>
        {/* Custody label */}
        <View style={[styles.custodyLabel, isBloom ? styles.custodyLabelBloom : styles.custodyLabelHome]}>
          <Text style={[styles.custodyLabelText, isBloom ? styles.custodyLabelTextBloom : styles.custodyLabelTextHome]}>
            {isBloom ? 'Bloom' : 'Home'}
          </Text>
        </View>
      </Pressable>
    );
  };

  // Handle asset removal (legacy)
  const handleRemoveAsset = async (asset: Asset) => {
    const doRemove = async () => {
      try {
        const { error } = await supabase
          .from('assets')
          .delete()
          .eq('id', asset.id);

        if (error) throw error;

        showAlert('Removed', 'Item removed from portfolio.');
        fetchPortfolio();
      } catch (e: any) {
        showAlert('Error', e.message || 'Failed to remove item.');
      }
    };

    showAlert(
      'Remove from Portfolio?',
      `Remove "${asset.name}" from your portfolio? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]
    );
  };

  // Legacy: Render asset card - brokerage style with P&L
  const renderAssetCard = ({ item }: { item: Asset }) => {
    const showImage = item.image_url && !failedImages.has(item.id);
    const isWatchlist = item.location === 'watchlist';
    const pnlData = computePnl(item.current_price, item.entry_price);
    const pnlStr = formatPnLWithPercent(pnlData?.delta ?? null, pnlData?.percent ?? null);
    const pnlColor = getPnlColor(pnlData?.delta ?? null);
    const pricingTimestamp = item.updated_at_pricing || item.last_price_checked_at || item.last_price_updated_at || item.last_price_update;
    const isPriceStale = isTimestampStale(pricingTimestamp);
    // Size only - no style code on cards (keep clean like Robinhood)
    const sizeLine = item.size ? `Size ${item.size}` : null;

    return (
      <Pressable
        style={styles.assetCard}
        onPress={() => router.push(`/asset/${item.id}`)}
        onLongPress={() => handleRemoveAsset(item)}
        delayLongPress={500}
      >
        <View style={styles.cardImageContainer}>
          {showImage ? (
            <Image
              source={{ uri: item.image_url! }}
              style={styles.cardImage}
              resizeMode="contain"
              onError={() => handleImageError(item.id)}
            />
          ) : (
            <View style={[styles.cardImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{item.name.charAt(0)}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          <Text style={[styles.cardPrice, isPriceStale && styles.cardPriceStale]}>
            {formatPrice(item.current_price)}
          </Text>
          {isPriceStale && (
            <View style={styles.priceStaleBadge}>
              <Text style={styles.priceStaleBadgeText}>Updating...</Text>
            </View>
          )}
          <View style={styles.cardPnlRow}>
            {pnlStr ? (
              <Text style={[styles.cardPnl, { color: pnlColor }]}>{pnlStr}</Text>
            ) : (
              <Text style={styles.cardMetaCta}>
                {isWatchlist ? 'Set target price' : 'Add what you paid'}
              </Text>
            )}
          </View>
          {sizeLine && !pnlStr && (
            <Text style={styles.cardMeta}>{sizeLine}</Text>
          )}
        </View>
        {/* Custody label */}
        <View style={[styles.custodyLabel, item.location === 'watchlist' ? styles.custodyLabelWatchlist : styles.custodyLabelHome]}>
          <Text style={[styles.custodyLabelText, item.location === 'watchlist' ? styles.custodyLabelTextWatchlist : styles.custodyLabelTextHome]}>
            {item.location === 'watchlist' ? 'Watchlist' : 'Home'}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No assets yet</Text>
      <Text style={styles.emptySubtitle}>
        Start building your collection
      </Text>
      <Pressable style={styles.emptyButton} onPress={() => router.push('/buy')}>
        <Text style={styles.emptyButtonText}>Start buying</Text>
      </Pressable>
    </View>
  );

  const ownedAssetsOnly = ownedAssets.filter(a => (a.location || 'home') !== 'watchlist');

  // Bloom custody tokens only (for balance calculation)
  const bloomTokens = tokens.filter(t =>
    t.custody_type === 'bloom' && (t.status === 'in_custody' || t.status === 'listed')
  );

  // Balance = bloom custody value only (this is THE number)
  const portfolioValue = bloomTokens.reduce((sum, t) => sum + (t.current_value ?? 0), 0);

  const portfolioPnl = bloomTokens.reduce((sum, t) => {
    if (t.current_value === null || t.purchase_price === null || t.purchase_price <= 0) return sum;
    return sum + (t.current_value - t.purchase_price);
  }, 0);

  // Home value (tokens at home + assets at home)
  const homeTokens = tokens.filter(t => t.custody_type === 'home');
  const homeAssets = ownedAssets.filter(a => (a.location || 'home') === 'home');
  const homeValue = homeTokens.reduce((sum, t) => sum + (t.current_value ?? 0), 0)
    + homeAssets.reduce((sum, a) => sum + (a.current_price ?? 0), 0);

  // Watchlist value (assets only - intent, not owned)
  const watchlistAssets = ownedAssets.filter(a => a.location === 'watchlist');
  const watchlistValue = watchlistAssets.reduce((sum, a) => sum + (a.current_price ?? 0), 0);

  // Filter counts for tabs
  const bloomCount = bloomTokens.length;
  const homeCount = homeTokens.length + homeAssets.length;
  const watchlistCount = watchlistAssets.length;

  // Filtered items based on active tab
  const filteredItems = (() => {
    if (activeFilter === 'bloom') {
      return bloomTokens;
    } else if (activeFilter === 'home') {
      return [...homeTokens, ...homeAssets];
    } else {
      return watchlistAssets;
    }
  })();

  // Always show bloom custody value - no toggles, no options
  const displayedTotalValue = portfolioValue;
  const displayedTotalPnl = portfolioPnl;
  const hasItems = tokens.length > 0 || ownedAssets.length > 0;

  const totalPnlColor = !displayedTotalPnl || displayedTotalPnl === 0
    ? theme.textSecondary
    : displayedTotalPnl >= 0 ? theme.success : theme.error;

  const sellItems: SellItem[] = [
    ...tokens
      .filter(token => token.match_status !== 'pending' && token.current_value !== null)
      .map(token => ({
        id: token.id,
        type: 'token' as const,
        name: token.product_name,
        size: token.size,
        sku: token.sku,
        subtitle: token.size ? `Size ${token.size}` : 'Size —',
        custodyLabel: token.custody_type === 'bloom' ? 'Bloom' : 'Home',
        custodyType: token.custody_type,
        value: token.current_value || 0,
        imageUrl: token.product_image_url,
      })),
    ...ownedAssetsOnly.map(asset => ({
      id: asset.id,
      type: 'asset' as const,
      name: asset.name,
      size: asset.size,
      sku: asset.stockx_sku,
      subtitle: asset.size ? `Size ${asset.size}` : asset.category || 'Asset',
      custodyLabel: 'Home',
      custodyType: 'home' as const,
      value: asset.current_price || 0,
      imageUrl: asset.image_url,
    })),
  ];
  const sortedSellItems = [...sellItems].sort((a, b) => b.value - a.value);
  const lastUpdatedLabel = lastUpdatedAt ? formatRelativeTime(lastUpdatedAt) : null;
  const pricingFresh = lastUpdatedAt
    ? (now - lastUpdatedAt.getTime()) <= PRICE_FRESHNESS_MINUTES * 60 * 1000
    : false;

  return (
    <SafeAreaView style={styles.container}>
      {/* Compact Header - Balance in row */}
      <View style={styles.headerArea}>
        <View style={styles.headerRow}>
          <Text style={styles.headerLogo}>Bloom</Text>
          <Pressable style={styles.headerCenter} onPress={() => setShowBalanceBreakdown(true)}>
            <View style={styles.headerBalanceRow}>
              <Text style={styles.headerBalance}>{formatPrice(displayedTotalValue)}</Text>
              {hasItems && displayedTotalPnl !== null && displayedTotalPnl !== 0 && (
                <Text style={[styles.headerPnl, { color: totalPnlColor }]}>
                  ({formatPnL(displayedTotalPnl)})
                </Text>
              )}
            </View>
            <Text style={styles.headerUpdated}>
              {pricingFresh && lastUpdatedLabel ? `Updated ${lastUpdatedLabel}` : 'Prices paused'}
            </Text>
          </Pressable>
          <Pressable style={styles.profileButton} onPress={() => router.push('/profile')}>
            <View style={styles.profileIcon}>
              <Text style={styles.profileIconText}>
                {session?.user?.email?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['bloom', 'home', 'watchlist'] as CustodyFilter[]).map((filter) => {
          const isActive = activeFilter === filter;
          const count = filter === 'bloom' ? bloomCount
            : filter === 'home' ? homeCount
            : watchlistCount;
          const label = filter.charAt(0).toUpperCase() + filter.slice(1);

          return (
            <Pressable
              key={filter}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {label} ({count})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Assets */}
      <View style={styles.assetsSection}>
        {notifications.length > 0 && (
          <View style={styles.alertsSection}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            {notifications.map((note) => (
              <View key={note.id} style={styles.alertItem}>
                <Text style={styles.alertTitle} numberOfLines={1}>{note.title}</Text>
                {note.body && <Text style={styles.alertBody} numberOfLines={2}>{note.body}</Text>}
              </View>
            ))}
          </View>
        )}

        {weeklyDigest && (
          <View style={styles.digestSection}>
            <Text style={styles.sectionTitle}>Weekly digest</Text>
            <View style={styles.digestCard}>
              <Text style={styles.digestLabel}>Portfolio value</Text>
              <Text style={styles.digestValue}>
                {weeklyDigest.total_value !== null ? formatPrice(weeklyDigest.total_value) : '—'}
              </Text>
              {weeklyDigest.total_pnl_dollars !== null && (
                <Text
                  style={[
                    styles.digestChange,
                    { color: (weeklyDigest.total_pnl_dollars || 0) >= 0 ? theme.success : theme.error },
                  ]}
                >
                  {formatPnL(weeklyDigest.total_pnl_dollars)} ({weeklyDigest.total_pnl_percent?.toFixed(1)}%)
                </Text>
              )}
            </View>
          </View>
        )}

        {topMovers.length > 0 && (
          <View style={styles.moversSection}>
            <Text style={styles.sectionTitle}>Top movers (24h)</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moversRow}
            >
              {topMovers.map((mover) => {
                const isUp = mover.price_change >= 0;
                const changeColor = isUp ? theme.success : theme.error;
                return (
                  <View key={`${mover.item_type}-${mover.item_id}`} style={styles.moverCard}>
                    {mover.image_url ? (
                      <Image source={{ uri: mover.image_url }} style={styles.moverImage} />
                    ) : (
                      <View style={[styles.moverImage, styles.sellOptionPlaceholder]}>
                        <Text style={styles.sellOptionPlaceholderText}>{mover.name.charAt(0)}</Text>
                      </View>
                    )}
                    <Text style={styles.moverName} numberOfLines={1}>{mover.name}</Text>
                    <Text style={styles.moverValue}>{formatPrice(mover.current_value)}</Text>
                    <Text style={[styles.moverChange, { color: changeColor }]}>
                      {isUp ? '▲' : '▼'} {formatPrice(Math.abs(mover.price_change))} ({mover.price_change_percent.toFixed(1)}%)
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyFilterState}>
            <Text style={styles.emptyFilterTitle}>
              {activeFilter === 'bloom' ? 'No items in Bloom custody' :
               activeFilter === 'home' ? 'No items at home' : 'No watchlist items'}
            </Text>
            <Text style={styles.emptyFilterSubtitle}>
              {activeFilter === 'bloom' ? 'Buy items to add them to your Bloom account' :
               activeFilter === 'home' ? 'Items you own but keep at home will show here' :
               'Add items to your watchlist to track prices'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredItems as any[]}
            renderItem={({ item }) => {
              // Check if it's a token (has custody_type) or legacy asset
              if ('custody_type' in item) {
                return renderTokenCard({ item: item as Token });
              } else {
                return renderAssetCard({ item: item as Asset });
              }
            }}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.accent}
              />
            }
          />
        )}
      </View>

      {/* Buy Intent Modal and Route Home Modal removed - now navigating to /buy */}

      {/* Sell Modal */}
      <Modal
        visible={showSellModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSellModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSellModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sell</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {sortedSellItems.length === 0 ? (
                <View style={styles.emptySellState}>
                  <Text style={styles.emptySellTitle}>Nothing to sell yet</Text>
                  <Text style={styles.emptySellSubtitle}>Add something you want to liquidate</Text>
                  <Pressable
                    style={styles.addToSellButton}
                    onPress={() => {
                      setShowSellModal(false);
                      router.push('/add-item');
                    }}
                  >
                    <Text style={styles.addToSellButtonText}>+ Add item to sell</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {sortedSellItems.map(item => {
                    const isBloom = item.custodyType === 'bloom';
                    return (
                    <Pressable
                      key={`${item.type}-${item.id}`}
                      style={[
                        styles.sellPickRow,
                        isBloom ? styles.sellPickRowBloom : styles.sellPickRowHome,
                      ]}
                      onPress={() => {
                        setShowSellModal(false);
                        setSelectedSellItem(item);
                        setShowSellOptions(true);
                      }}
                    >
                      <View style={styles.sellPickLeft}>
                        {item.imageUrl ? (
                          <Image source={{ uri: item.imageUrl }} style={styles.sellPickThumb} />
                        ) : (
                          <View style={[styles.sellPickThumb, styles.sellOptionPlaceholder]}>
                            <Text style={styles.sellOptionPlaceholderText}>
                              {item.name.charAt(0)}
                            </Text>
                          </View>
                        )}
                        <View style={styles.sellPickText}>
                          <Text style={styles.sellPickName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <View style={styles.sellPickMetaRow}>
                            <Text style={styles.sellPickMeta}>
                              {item.size ? `Size ${item.size}` : 'Size —'} · {item.custodyLabel}
                            </Text>
                            <View
                              style={[
                                styles.sellPickBadge,
                                isBloom ? styles.sellPickBadgeBloom : styles.sellPickBadgeHome,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.sellPickBadgeText,
                                  isBloom ? styles.sellPickBadgeTextBloom : styles.sellPickBadgeTextHome,
                                ]}
                              >
                                {item.custodyLabel}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                      <Text style={styles.sellPickValue}>{formatPrice(item.value)}</Text>
                    </Pressable>
                    );
                  })}
                  {/* Add something else to sell */}
                  <Pressable
                    style={styles.addToSellRow}
                    onPress={() => {
                      setShowSellModal(false);
                      router.push('/add-item');
                    }}
                  >
                    <Text style={styles.addToSellRowText}>+ Sell something else</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>

            <Pressable style={styles.modalCancel} onPress={() => setShowSellModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Sell Options Modal */}
      <Modal
        visible={showSellOptions}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowSellOptions(false);
          setShowBloomMarketOptions(false);
          setSelectedSellItem(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowSellOptions(false);
            setShowBloomMarketOptions(false);
            setSelectedSellItem(null);
          }}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{isBloomCustody ? 'Sell Options' : 'Best Sell Options'}</Text>

            {selectedSellItem && (
              <View style={styles.sellHeaderRow}>
                {selectedSellItem.imageUrl ? (
                  <Image source={{ uri: selectedSellItem.imageUrl }} style={styles.sellHeaderImage} />
                ) : (
                  <View style={[styles.sellHeaderImage, styles.sellOptionPlaceholder]}>
                    <Text style={styles.sellOptionPlaceholderText}>
                      {selectedSellItem.name.charAt(0)}
                    </Text>
                  </View>
                )}
                <View style={styles.sellHeaderText}>
                  <Text style={styles.sellHeaderTitle} numberOfLines={1}>
                    {selectedSellItem.name}
                  </Text>
                  <Text style={styles.sellHeaderMeta}>
                    {selectedSellItem.size ? `Size ${selectedSellItem.size}` : 'Size —'} · {selectedSellItem.custodyLabel}
                  </Text>
                </View>
              </View>
            )}

            {isBloomCustody && (
              <View style={styles.sellDecisionBlock}>
                <Pressable
                  style={styles.sellDecisionPrimary}
                  onPress={handleOpenExchangeListing}
                  disabled={!canListOnExchange}
                >
                  <Text style={styles.sellDecisionPrimaryText}>List on Bloom Exchange</Text>
                  <Text style={styles.sellDecisionSubtext}>Verified. Instant transfer eligible.</Text>
                </Pressable>
                <Pressable
                  style={styles.sellDecisionSecondary}
                  onPress={() => setShowBloomMarketOptions(true)}
                >
                  <Text style={styles.sellDecisionSecondaryText}>List on Market</Text>
                  <Text style={styles.sellDecisionSubtext}>Bloom lists it for you</Text>
                </Pressable>
              </View>
            )}

            {showMarketplaceCards && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {marketplaceOptions.map(option => (
                  <View key={option.id} style={styles.sellOptionCard}>
                    <View style={styles.sellOptionHeader}>
                      <Text style={styles.sellOptionName}>{option.name}</Text>
                      {option.id === bestOptionId && (
                        <View style={styles.bestBadge}>
                          <Text style={styles.bestBadgeText}>Best</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.sellOptionRow}>
                      <Text style={styles.sellOptionLabel}>Market</Text>
                      <Text style={styles.sellOptionValue}>{formatPrice(option.gross)}</Text>
                    </View>
                    <View style={styles.sellOptionRow}>
                      <Text style={styles.sellOptionLabel}>Fees</Text>
                      <Text style={styles.sellOptionValue}>-{formatCurrency(option.feeEstimate)}</Text>
                    </View>
                    <View style={styles.sellOptionRow}>
                      <Text style={styles.sellOptionLabel}>Shipping</Text>
                      <Text style={styles.sellOptionValue}>-{formatCurrency(option.shipping)}</Text>
                    </View>
                    <View style={styles.sellOptionRow}>
                      <Text style={styles.sellOptionLabelStrong}>Net payout</Text>
                      <Text style={styles.sellOptionValueStrong}>{formatCurrency(option.net)}</Text>
                    </View>
                    <Pressable
                      style={[styles.sellOptionButton, marketplaceSellLoading && styles.sellOptionButtonDisabled]}
                      onPress={() => {
                        if (!selectedSellItem) return;
                        handleMarketplaceSellRequest(option.id);
                      }}
                      disabled={marketplaceSellLoading}
                    >
                      <Text style={styles.sellOptionButtonText}>
                        {marketplaceSellLoading ? 'Submitting...' : 'Sell with Bloom'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            {showMarketplaceCards && (
              <Text style={styles.sellDisclaimer}>
                Estimates only. Final payout set at execution.
              </Text>
            )}

            <Pressable
              style={styles.modalCancel}
              onPress={() => {
                setShowSellOptions(false);
                setSelectedSellItem(null);
              }}
            >
              <Text style={styles.modalCancelText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Bloom Exchange Listing Modal */}
      <Modal
        visible={showExchangeListing}
        transparent
        animationType="slide"
        onRequestClose={closeExchangeListing}
      >
        <Pressable style={styles.modalOverlay} onPress={closeExchangeListing}>
          <View style={styles.modalContent}>
            {exchangeListingSuccess ? (
              <View style={styles.exchangeSuccess}>
                <Text style={styles.exchangeSuccessTitle}>Listed on Bloom Exchange</Text>
                <Text style={styles.exchangeSuccessSubtitle}>Your listing is now live.</Text>
                <Pressable style={styles.sellOptionButton} onPress={closeExchangeListing}>
                  <Text style={styles.sellOptionButtonText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>List on Bloom Exchange</Text>

                {selectedSellItem && (
                  <View style={styles.sellHeaderRow}>
                    {selectedSellItem.imageUrl ? (
                      <Image source={{ uri: selectedSellItem.imageUrl }} style={styles.sellHeaderImage} />
                    ) : (
                      <View style={[styles.sellHeaderImage, styles.sellOptionPlaceholder]}>
                        <Text style={styles.sellOptionPlaceholderText}>
                          {selectedSellItem.name.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.sellHeaderText}>
                      <Text style={styles.sellHeaderTitle} numberOfLines={1}>
                        {selectedSellItem.name}
                      </Text>
                      <Text style={styles.sellHeaderMeta}>
                        {selectedSellItem.size ? `Size ${selectedSellItem.size}` : 'Size —'} · Bloom custody
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.exchangeInputCard}>
                  <Text style={styles.exchangeInputLabel}>Ask price</Text>
                  <View style={styles.exchangeInputRow}>
                    <Text style={styles.exchangeCurrency}>$</Text>
                    <TextInput
                      style={styles.exchangeInput}
                      value={exchangeListingPrice}
                      onChangeText={setExchangeListingPrice}
                      placeholder="0.00"
                      placeholderTextColor={theme.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  {selectedSellItem && (
                    <Text style={styles.exchangeHint}>
                      Market value: {formatPrice(selectedSellItem.value)}
                    </Text>
                  )}
                </View>

                <Pressable
                  style={[
                    styles.sellOptionButton,
                    exchangeListingLoading && styles.sellOptionButtonDisabled,
                  ]}
                  onPress={handleConfirmExchangeListing}
                  disabled={exchangeListingLoading}
                >
                  {exchangeListingLoading ? (
                    <ActivityIndicator size="small" color={theme.textInverse} />
                  ) : (
                    <Text style={styles.sellOptionButtonText}>List on Exchange</Text>
                  )}
                </Pressable>

                <Pressable style={styles.modalCancel} onPress={closeExchangeListing}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Balance Breakdown Modal */}
      <Modal
        visible={showBalanceBreakdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBalanceBreakdown(false)}
      >
        <Pressable
          style={styles.breakdownOverlay}
          onPress={() => setShowBalanceBreakdown(false)}
        >
          <View style={styles.breakdownCard}>
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownLabelRow}>
                <View style={[styles.breakdownDot, { backgroundColor: theme.accent }]} />
                <Text style={styles.breakdownLabel}>Bloom</Text>
              </View>
              <Text style={styles.breakdownValue}>{formatPrice(portfolioValue)}</Text>
            </View>
            <Text style={styles.breakdownHint}>In custody</Text>

            <View style={styles.breakdownDivider} />

            <View style={styles.breakdownRow}>
              <View style={styles.breakdownLabelRow}>
                <View style={[styles.breakdownDot, { backgroundColor: theme.textTertiary }]} />
                <Text style={styles.breakdownLabel}>Home</Text>
              </View>
              <Text style={styles.breakdownValue}>{formatPrice(homeValue)}</Text>
            </View>
            <Text style={styles.breakdownHint}>Tracked</Text>

            <View style={styles.breakdownDivider} />

            <View style={styles.breakdownRow}>
              <View style={styles.breakdownLabelRow}>
                <View style={[styles.breakdownDot, { backgroundColor: theme.textSecondary }]} />
                <Text style={styles.breakdownLabel}>Watchlist</Text>
              </View>
              <Text style={styles.breakdownValue}>{formatPrice(watchlistValue)}</Text>
            </View>
            <Text style={styles.breakdownHint}>Intent</Text>
          </View>
        </Pressable>
      </Modal>

      {/* Fixed Bottom Bar - Buy and Sell only */}
      <View style={styles.bottomBar}>
        <Pressable style={styles.bottomButton} onPress={() => router.push('/buy')}>
          <Text style={styles.bottomButtonText}>Buy</Text>
        </Pressable>
        <Pressable
          style={[styles.bottomButton, styles.bottomButtonSecondary]}
          onPress={() => setShowSellModal(true)}
        >
          <Text style={[styles.bottomButtonText, styles.bottomButtonTextSecondary]}>
            Sell
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  headerArea: {
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLogo: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.accent,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  headerBalance: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: theme.textPrimary,
    letterSpacing: -0.5,
  },
  headerPnl: {
    fontSize: 14,
    fontWeight: '500',
  },
  headerUpdated: {
    fontSize: 10,
    color: theme.textTertiary,
    marginTop: 2,
  },
  profileButton: {
    padding: 4,
  },
  profileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIconText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textInverse,
  },
  // Filter Tabs
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.backgroundSecondary,
  },
  filterTabActive: {
    backgroundColor: theme.accent,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  filterTabTextActive: {
    color: theme.textInverse,
  },
  assetsSection: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
    paddingTop: 12,
  },
  gridContent: {
    paddingHorizontal: 12,
    paddingBottom: 120, // Extra space for fixed bottom bar
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  assetCard: {
    width: '47%',
    backgroundColor: theme.card,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  assetCardBloom: {
    borderColor: theme.accent,
    borderWidth: 2,
  },
  cardImageContainer: {
    backgroundColor: '#FFF',
    padding: 8,
  },
  cardImageContainerBloom: {
    backgroundColor: '#FFF',
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1.3,
  },
  placeholderImage: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: theme.accent,
  },
  cardInfo: {
    padding: 12,
  },
  cardInfoBloom: {
    backgroundColor: theme.accent,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
    lineHeight: 17,
  },
  cardNameBloom: {
    color: '#1A1A1A',
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  cardPriceStale: {
    color: theme.textSecondary,
  },
  cardPriceBloom: {
    color: '#1A1A1A',
  },
  cardMeta: {
    fontSize: 11,
    color: theme.textSecondary,
    flex: 1,
  },
  cardMetaBloom: {
    color: 'rgba(0, 0, 0, 0.6)',
  },
  cardMetaCta: {
    fontSize: 11,
    color: theme.accent,
    fontWeight: '600',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardPnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assetMetaStack: {
    flexDirection: 'column',
    gap: 2,
  },
  cardPnl: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  cardPnlBloom: {
    color: '#1A1A1A',
  },
  statusBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  priceStaleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.warningBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  priceStaleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.warning,
  },
  custodyLabel: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  custodyLabelBloom: {
    backgroundColor: '#1A1A1A',
  },
  custodyLabelHome: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  custodyLabelWatchlist: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  custodyLabelText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  custodyLabelTextBloom: {
    color: '#FFFFFF',
  },
  custodyLabelTextHome: {
    color: theme.textSecondary,
  },
  custodyLabelTextWatchlist: {
    color: '#3B82F6',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: theme.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textInverse,
  },
  emptyFilterState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyFilterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyFilterSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  alertsSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  alertItem: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  alertBody: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 4,
  },
  digestSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  digestCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  digestLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  digestValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  digestChange: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.success,
    marginTop: 4,
  },
  moversSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  moversRow: {
    gap: 12,
  },
  moverCard: {
    width: 140,
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  moverImage: {
    width: '100%',
    height: 80,
    borderRadius: 10,
    backgroundColor: '#FFF',
    marginBottom: 8,
  },
  moverName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  moverValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textPrimary,
    marginTop: 4,
  },
  moverChange: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },
  intentSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  intentOption: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  intentOptionPrimary: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  intentOptionSecondary: {
    backgroundColor: theme.card,
    borderColor: theme.border,
  },
  intentOptionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  intentOptionDesc: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  routeHomeInputCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 10,
    marginBottom: 12,
  },
  routeHomeInput: {
    fontSize: 14,
    color: theme.textPrimary,
    paddingVertical: 6,
  },
  routeOption: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  routeOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  routeOptionDesc: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  modalOption: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sellPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  sellPickRowHome: {
    backgroundColor: theme.card,
    borderColor: theme.border,
  },
  sellPickRowBloom: {
    backgroundColor: theme.accentLight,
    borderColor: theme.accentDark,
  },
  sellPickLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  sellPickThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#FFF',
  },
  sellPickText: {
    flex: 1,
  },
  sellPickName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  sellPickMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sellPickMeta: {
    fontSize: 12,
    color: theme.textSecondary,
    flexShrink: 1,
  },
  sellPickBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sellPickBadgeHome: {
    backgroundColor: theme.backgroundTertiary,
  },
  sellPickBadgeBloom: {
    backgroundColor: theme.accent,
  },
  sellPickBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sellPickBadgeTextHome: {
    color: theme.textSecondary,
  },
  sellPickBadgeTextBloom: {
    color: theme.textPrimary,
  },
  sellPickValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginLeft: 12,
    textAlign: 'right',
  },
  modalOptionDisabled: {
    opacity: 0.5,
  },
  modalOptionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  modalOptionTitleDisabled: {
    color: theme.textSecondary,
  },
  modalOptionDesc: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  sellDecisionBlock: {
    gap: 12,
    marginBottom: 12,
  },
  sellDecisionPrimary: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sellDecisionPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  sellDecisionSecondary: {
    backgroundColor: theme.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sellDecisionSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  sellDecisionSubtext: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  sellOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sellHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sellHeaderImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#FFF',
  },
  sellHeaderText: {
    flex: 1,
  },
  sellHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  sellHeaderMeta: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 4,
  },
  sellOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  sellOptionImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  sellOptionPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  sellOptionPlaceholderText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: theme.accent,
  },
  sellOptionText: {
    flex: 1,
  },
  sellOptionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  custodyTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 215, 181, 0.3)',
  },
  custodyTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  sellOptionValue: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  sellOptionCard: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sellOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sellOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  bestBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: theme.accent,
  },
  bestBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textInverse,
  },
  sellOptionLabel: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  sellOptionLabelStrong: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  sellOptionValueStrong: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  sellOptionButton: {
    marginTop: 12,
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sellOptionButtonDisabled: {
    opacity: 0.7,
  },
  sellOptionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textInverse,
  },
  exchangeInputCard: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.borderLight,
    marginBottom: 14,
  },
  exchangeInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  exchangeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exchangeCurrency: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  exchangeInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: theme.textPrimary,
    paddingVertical: 6,
  },
  exchangeHint: {
    marginTop: 6,
    fontSize: 12,
    color: theme.textSecondary,
  },
  exchangeSuccess: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  exchangeSuccessTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  exchangeSuccessSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  sellDisclaimer: {
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  emptySellState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptySellTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 6,
  },
  emptySellSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 16,
  },
  addToSellButton: {
    backgroundColor: theme.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  addToSellButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textInverse,
  },
  addToSellRow: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: 8,
  },
  addToSellRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.accent,
  },
  // Balance Breakdown Modal
  breakdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  breakdownValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  breakdownHint: {
    fontSize: 12,
    color: theme.textTertiary,
    marginLeft: 18,
    marginTop: 2,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 12,
  },
  // Fixed Bottom Bar - floating on cream background
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 34,
  },
  bottomButton: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bottomButtonSecondary: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textInverse,
  },
  bottomButtonTextSecondary: {
    color: theme.textPrimary,
  },
});
