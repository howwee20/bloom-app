// HOME Screen - Minimalist Coin + Command Bar
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  FlatList,
  Image,
  Keyboard,
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
import { CommandBar, parseCommand, getSearchQuery } from '../../components/CommandBar';
import { CoinDisplay } from '../../components/CoinDisplay';

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

const MARKETPLACE_LABELS: Record<string, string> = {
  stockx: 'StockX',
};
const MARKETPLACE_FEES: Record<string, { feeRate: number; shipping: number }> = {
  stockx: { feeRate: 0.12, shipping: 14 },
};

// Command bar offer interface
interface BloomOffer {
  offer_id: string;
  catalog_item_id: string | null;
  title: string;
  image: string | null;
  price: number;
  total_estimate: number;
  currency: 'USD';
  source: string;
  condition: 'new' | 'used' | 'deadstock';
  source_url: string;
  last_updated_at: string;
}

// Source colors for offer cards
const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  stockx: { label: 'StockX', color: '#006340' },
  ebay: { label: 'eBay', color: '#E53238' },
  goat: { label: 'GOAT', color: '#000000' },
  grailed: { label: 'Grailed', color: '#7B1FA2' },
  adidas: { label: 'Adidas', color: '#000000' },
  nike: { label: 'Nike', color: '#F36F21' },
  catalog: { label: 'Catalog', color: '#888888' },
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
  custody_type: 'bloom' | 'home';
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
  const [showSellModal, setShowSellModal] = useState(false);
  const [showSellOptions, setShowSellOptions] = useState(false);
  const [selectedSellItem, setSelectedSellItem] = useState<SellItem | null>(null);
  const [showBloomMarketOptions, setShowBloomMarketOptions] = useState(false);
  const [marketplaceSellLoading, setMarketplaceSellLoading] = useState(false);
  const [showExchangeListing, setShowExchangeListing] = useState(false);
  const [exchangeListingPrice, setExchangeListingPrice] = useState('');
  const [exchangeListingLoading, setExchangeListingLoading] = useState(false);
  const [exchangeListingSuccess, setExchangeListingSuccess] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(2 * 60 * 1000);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isFocused, setIsFocused] = useState(true);

  // Tokens modal state
  const [showTokensModal, setShowTokensModal] = useState(false);

  // Command bar state
  const [commandActive, setCommandActive] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandResults, setCommandResults] = useState<BloomOffer[]>([]);
  const [commandLoading, setCommandLoading] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<BloomOffer | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buySize, setBuySize] = useState('');
  const [purchasing, setPurchasing] = useState(false);
  const commandDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleImageError = (assetId: string) => {
    setFailedImages(prev => new Set(prev).add(assetId));
  };

  // Command bar handlers
  const handleCommandQueryChange = (query: string) => {
    setCommandQuery(query);

    if (commandDebounceRef.current) {
      clearTimeout(commandDebounceRef.current);
    }

    const searchQuery = getSearchQuery(query);
    if (!searchQuery) {
      setCommandResults([]);
      setCommandLoading(false);
      return;
    }

    setCommandLoading(true);
    commandDebounceRef.current = setTimeout(async () => {
      try {
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/get-offers?q=${encodeURIComponent(searchQuery)}&limit=20`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setCommandResults(data.offers || []);
        } else {
          setCommandResults([]);
        }
      } catch (error) {
        console.error('Command search error:', error);
        setCommandResults([]);
      } finally {
        setCommandLoading(false);
      }
    }, 300);
  };

  const handleCommandFocus = () => {
    setCommandActive(true);
  };

  const handleCommandClear = () => {
    setCommandQuery('');
    setCommandActive(false);
    setCommandResults([]);
    setCommandLoading(false);
    Keyboard.dismiss();
  };

  const handleCommandSubmit = () => {
    const intent = parseCommand(commandQuery);

    if (intent.type === 'sell') {
      setShowSellModal(true);
      return;
    }
  };

  const handleSelectOffer = (offer: BloomOffer) => {
    setSelectedOffer(offer);
    setShowBuyModal(true);
  };

  const handleConfirmBuy = async (destination: 'bloom' | 'home') => {
    if (!selectedOffer || !session?.user?.id || !buySize.trim()) return;

    setPurchasing(true);
    try {
      const { error } = await supabase.rpc('create_order_intent', {
        p_catalog_item_id: selectedOffer.catalog_item_id,
        p_size: buySize.trim(),
        p_destination: destination,
        p_marketplace: selectedOffer.source,
        p_source_url: selectedOffer.source_url,
        p_quoted_total: selectedOffer.total_estimate,
      });

      if (error) throw error;

      setShowBuyModal(false);
      setSelectedOffer(null);
      setBuySize('');
      handleCommandClear();

      showAlert('Order Placed', `Your order for ${selectedOffer.title} has been submitted.`);
    } catch (e) {
      console.error('Purchase error:', e);
      showAlert('Error', 'Failed to place order. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const fetchPortfolio = useCallback(async (options?: { silent?: boolean }) => {
    if (!session) return;

    try {
      // Fetch token portfolio summary
      const { data: tokenSummaryData, error: tokenSummaryError } = await supabase.rpc('get_token_portfolio_summary');
      if (!tokenSummaryError && tokenSummaryData && tokenSummaryData.length > 0) {
        setTokenSummary(tokenSummaryData[0]);
      }

      // Fetch tokens
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
    } catch (e) {
      console.error('Error fetching portfolio:', e);
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

  const isForeground = appState === 'active';

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

  // Format helpers
  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined || price === 0) return 'Updating...';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
  };

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

  // Calculate totals
  const tokenTotal = tokenSummary?.total_value || 0;
  const legacyTotal = summary?.total_value || 0;
  const displayedTotalValue = tokenTotal + legacyTotal;

  // Calculate daily change (using PnL as proxy for now)
  const tokenDailyChange = tokenSummary?.total_pnl_dollars || 0;
  const legacyDailyChange = summary?.total_pnl_dollars || 0;
  const displayedDailyChange = tokenDailyChange + legacyDailyChange;

  // Build sell items list
  const sellableTokens: SellItem[] = tokens
    .filter(t => t.status === 'in_custody' || t.status === 'listed')
    .map(t => ({
      id: t.id,
      type: 'token' as const,
      name: t.product_name,
      size: t.size,
      sku: t.sku,
      subtitle: `Size ${t.size || '—'}`,
      custodyLabel: t.custody_type === 'bloom' ? 'Bloom' : 'Home',
      custodyType: t.custody_type,
      value: t.current_value || t.purchase_price,
      imageUrl: t.product_image_url,
    }));

  const sellableAssets: SellItem[] = ownedAssets
    .filter(a => a.location === 'home' || a.location === 'bloom')
    .map(a => ({
      id: a.id,
      type: 'asset' as const,
      name: a.name,
      size: a.size,
      sku: a.stockx_sku,
      subtitle: a.size ? `Size ${a.size}` : (a.category || '—'),
      custodyLabel: a.location === 'bloom' ? 'Bloom' : 'Home',
      custodyType: (a.location === 'bloom' ? 'bloom' : 'home') as 'bloom' | 'home',
      value: a.current_price,
      imageUrl: a.image_url,
    }));

  const sortedSellItems = [...sellableTokens, ...sellableAssets].sort((a, b) => {
    if (a.custodyType === 'bloom' && b.custodyType !== 'bloom') return -1;
    if (a.custodyType !== 'bloom' && b.custodyType === 'bloom') return 1;
    return b.value - a.value;
  });

  const isBloomCustody = selectedSellItem?.custodyType === 'bloom';
  const canListOnExchange = selectedSellItem?.type === 'token' && selectedSellItem?.custodyType === 'bloom';
  const showMarketplaceCards = !isBloomCustody || showBloomMarketOptions;

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
        console.warn('Exchange listing insert error:', insertError);
      }

      setExchangeListingSuccess(true);
      fetchPortfolio({ silent: true });

      setTimeout(() => {
        closeExchangeListing();
      }, 1500);
    } catch (e: any) {
      showAlert('Listing failed', e.message || 'Please try again.');
    } finally {
      setExchangeListingLoading(false);
    }
  };

  // Render token card for the modal
  const renderTokenItem = ({ item }: { item: Token }) => {
    const statusConfig = getStatusConfig(item.status);
    const pnlColor = getPnlColor(item.pnl_dollars);
    const isBloom = item.custody_type === 'bloom';

    return (
      <Pressable
        style={[styles.tokenItem, isBloom && styles.tokenItemBloom]}
        onPress={() => router.push(`/token/${item.id}`)}
      >
        <View style={styles.tokenImageContainer}>
          {item.product_image_url && !failedImages.has(item.id) ? (
            <Image
              source={{ uri: item.product_image_url }}
              style={styles.tokenImage}
              resizeMode="contain"
              onError={() => handleImageError(item.id)}
            />
          ) : (
            <View style={[styles.tokenImage, styles.tokenImagePlaceholder]}>
              <Text style={styles.tokenImagePlaceholderText}>
                {item.product_name.charAt(0)}
              </Text>
            </View>
          )}
          {statusConfig.label && (
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.color }]}>
              <Text style={styles.statusBadgeText}>{statusConfig.label}</Text>
            </View>
          )}
        </View>
        <View style={styles.tokenInfo}>
          <Text style={styles.tokenName} numberOfLines={1}>{item.product_name}</Text>
          <Text style={styles.tokenSize}>Size {item.size}</Text>
          <View style={styles.tokenValueRow}>
            <Text style={styles.tokenValue}>{formatPrice(item.current_value)}</Text>
            {item.pnl_dollars !== null && item.pnl_dollars !== 0 && (
              <Text style={[styles.tokenPnl, { color: pnlColor }]}>
                {formatPnL(item.pnl_dollars)}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  // Combine all items for the tokens modal
  const allItems = [...tokens];

  return (
    <SafeAreaView style={styles.container}>
      {/* Main content area */}
      {commandActive ? (
        // Command Results view when searching
        <View style={styles.commandResultsSection}>
          {commandLoading ? (
            <View style={styles.commandLoadingContainer}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={styles.commandLoadingText}>Finding best prices...</Text>
            </View>
          ) : commandResults.length > 0 ? (
            <FlatList
              data={commandResults}
              renderItem={({ item }) => {
                const sourceConfig = SOURCE_CONFIG[item.source] || { label: item.source, color: '#888' };
                return (
                  <Pressable
                    style={styles.offerCard}
                    onPress={() => handleSelectOffer(item)}
                  >
                    <View style={[styles.offerSourceBadge, { backgroundColor: sourceConfig.color }]}>
                      <Text style={styles.offerSourceText}>{sourceConfig.label}</Text>
                    </View>
                    <View style={styles.offerImageContainer}>
                      {item.image ? (
                        <Image
                          source={{ uri: item.image }}
                          style={styles.offerImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={[styles.offerImage, styles.offerImagePlaceholder]}>
                          <Text style={styles.offerImagePlaceholderText}>
                            {item.title.charAt(0)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.offerTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.offerPrice}>{formatPrice(item.total_estimate)}</Text>
                  </Pressable>
                );
              }}
              keyExtractor={(item) => item.offer_id}
              numColumns={2}
              columnWrapperStyle={styles.commandGridRow}
              contentContainerStyle={styles.commandGridContent}
              showsVerticalScrollIndicator={false}
            />
          ) : getSearchQuery(commandQuery) ? (
            <View style={styles.commandNoResults}>
              <Text style={styles.commandNoResultsTitle}>No matches</Text>
              <Text style={styles.commandNoResultsSubtitle}>Try a different search</Text>
            </View>
          ) : (
            <View style={styles.commandHint}>
              <Text style={styles.commandHintText}>Search for sneakers, apparel, or type "sell" to list items</Text>
            </View>
          )}
        </View>
      ) : (
        // Default view - Coin centered
        <View style={styles.coinContainer}>
          {loading ? (
            <ActivityIndicator size="large" color={theme.accent} />
          ) : (
            <CoinDisplay
              totalValue={displayedTotalValue}
              dailyChange={displayedDailyChange}
              onPress={() => setShowTokensModal(true)}
            />
          )}
        </View>
      )}

      {/* Tokens Modal - shown when tapping the coin */}
      <Modal
        visible={showTokensModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTokensModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowTokensModal(false)}>
          <View style={styles.tokensModalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Your Holdings</Text>

            {allItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No items yet</Text>
                <Text style={styles.emptySubtitle}>Use the command bar to buy something</Text>
              </View>
            ) : (
              <FlatList
                data={allItems}
                renderItem={renderTokenItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.tokensList}
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
        </Pressable>
      </Modal>

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
                  <Text style={styles.emptySellSubtitle}>Buy something first using the command bar</Text>
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
              <ScrollView showsVerticalScrollIndicator={false} style={styles.marketplaceScroll}>
                {marketplaceOptions.map((mp) => {
                  const isBest = mp.id === bestOptionId;
                  return (
                    <Pressable
                      key={mp.id}
                      style={[styles.marketplaceCard, isBest && styles.marketplaceCardBest]}
                      onPress={() => handleMarketplaceSellRequest(mp.id)}
                      disabled={marketplaceSellLoading}
                    >
                      <View style={styles.marketplaceCardHeader}>
                        <Text style={styles.marketplaceName}>{mp.name}</Text>
                        {isBest && <Text style={styles.bestBadge}>BEST</Text>}
                      </View>
                      <View style={styles.marketplaceRow}>
                        <Text style={styles.marketplaceLabel}>Sale price</Text>
                        <Text style={styles.marketplaceValue}>{formatCurrency(mp.gross)}</Text>
                      </View>
                      <View style={styles.marketplaceRow}>
                        <Text style={styles.marketplaceLabel}>Fees (~{(MARKETPLACE_FEES[mp.id].feeRate * 100).toFixed(0)}%)</Text>
                        <Text style={styles.marketplaceValueNeg}>-{formatCurrency(mp.feeEstimate)}</Text>
                      </View>
                      <View style={styles.marketplaceRow}>
                        <Text style={styles.marketplaceLabel}>Shipping</Text>
                        <Text style={styles.marketplaceValueNeg}>-{formatCurrency(mp.shipping)}</Text>
                      </View>
                      <View style={[styles.marketplaceRow, styles.marketplaceRowTotal]}>
                        <Text style={styles.marketplaceLabelTotal}>You receive</Text>
                        <Text style={styles.marketplaceValueTotal}>{formatCurrency(mp.net)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              style={styles.modalCancel}
              onPress={() => {
                setShowSellOptions(false);
                setShowBloomMarketOptions(false);
                setSelectedSellItem(null);
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Exchange Listing Modal */}
      <Modal
        visible={showExchangeListing}
        transparent
        animationType="slide"
        onRequestClose={closeExchangeListing}
      >
        <Pressable style={styles.modalOverlay} onPress={closeExchangeListing}>
          <View style={styles.modalContent}>
            {exchangeListingSuccess ? (
              <View style={styles.successState}>
                <Text style={styles.successIcon}>✓</Text>
                <Text style={styles.successTitle}>Listed!</Text>
                <Text style={styles.successSubtitle}>Your item is now on the Bloom Exchange</Text>
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
                        Size {selectedSellItem.size || '—'}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.priceInputSection}>
                  <Text style={styles.priceInputLabel}>Your asking price</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={styles.priceInputPrefix}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={exchangeListingPrice}
                      onChangeText={setExchangeListingPrice}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={theme.textTertiary}
                    />
                  </View>
                  <Text style={styles.priceInputHint}>
                    Market price: {formatPrice(selectedSellItem?.value)}
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.listButton,
                    exchangeListingLoading && styles.listButtonDisabled,
                  ]}
                  onPress={handleConfirmExchangeListing}
                  disabled={exchangeListingLoading}
                >
                  {exchangeListingLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.listButtonText}>List for Sale</Text>
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

      {/* Buy Modal */}
      <Modal
        visible={showBuyModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowBuyModal(false);
          setSelectedOffer(null);
          setBuySize('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Buy</Text>

            {selectedOffer && (
              <>
                <View style={styles.buyOfferPreview}>
                  {selectedOffer.image ? (
                    <Image source={{ uri: selectedOffer.image }} style={styles.buyOfferImage} />
                  ) : (
                    <View style={[styles.buyOfferImage, styles.offerImagePlaceholder]}>
                      <Text style={styles.offerImagePlaceholderText}>
                        {selectedOffer.title.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.buyOfferTitle} numberOfLines={2}>{selectedOffer.title}</Text>
                  <Text style={styles.buyOfferPrice}>{formatPrice(selectedOffer.total_estimate)}</Text>
                </View>

                <View style={styles.sizeInputSection}>
                  <Text style={styles.sizeInputLabel}>Size</Text>
                  <TextInput
                    style={styles.sizeInput}
                    value={buySize}
                    onChangeText={setBuySize}
                    placeholder="e.g. 10, M, OS"
                    placeholderTextColor={theme.textTertiary}
                    autoCapitalize="characters"
                  />
                </View>

                <Text style={styles.destinationLabel}>Where should we send it?</Text>

                <Pressable
                  style={[
                    styles.buyModalButton,
                    styles.buyModalButtonPrimary,
                    (!buySize.trim() || purchasing) && styles.buyModalButtonDisabled,
                  ]}
                  onPress={() => handleConfirmBuy('bloom')}
                  disabled={!buySize.trim() || purchasing}
                >
                  {purchasing ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.buyModalButtonText}>Store in Bloom Vault</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[
                    styles.buyModalButton,
                    styles.buyModalButtonSecondary,
                    (!buySize.trim() || purchasing) && styles.buyModalButtonDisabled,
                  ]}
                  onPress={() => handleConfirmBuy('home')}
                  disabled={!buySize.trim() || purchasing}
                >
                  <Text style={styles.buyModalButtonTextSecondary}>Ship to My Address</Text>
                </Pressable>
              </>
            )}

            <Pressable
              style={styles.modalCancel}
              onPress={() => {
                setShowBuyModal(false);
                setSelectedOffer(null);
                setBuySize('');
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Command Bar - always at bottom */}
      <CommandBar
        query={commandQuery}
        onChangeQuery={handleCommandQueryChange}
        onFocus={handleCommandFocus}
        onClear={handleCommandClear}
        onSubmit={handleCommandSubmit}
        isActive={commandActive}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  // Coin container - centered
  coinContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100, // Space for command bar
  },
  // Command results section
  commandResultsSection: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 80, // Space for command bar at top
    paddingHorizontal: 12,
  },
  commandLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  commandLoadingText: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  commandGridContent: {
    paddingBottom: 100,
  },
  commandGridRow: {
    justifyContent: 'space-between',
  },
  commandNoResults: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandNoResultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  commandNoResultsSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
  },
  commandHint: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  commandHintText: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  // Offer cards
  offerCard: {
    width: '47%',
    backgroundColor: theme.card,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  offerSourceBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 1,
  },
  offerSourceText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  offerImageContainer: {
    backgroundColor: '#FFF',
    padding: 8,
  },
  offerImage: {
    width: '100%',
    aspectRatio: 1,
  },
  offerImagePlaceholder: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerImagePlaceholderText: {
    fontSize: 32,
    fontWeight: '600',
    color: theme.accent,
  },
  offerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
    padding: 12,
    paddingBottom: 4,
    lineHeight: 18,
  },
  offerPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  // Tokens modal
  tokensModalContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 48,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  tokensList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  tokenItem: {
    flexDirection: 'row',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  tokenItemBloom: {
    borderColor: theme.accent,
    borderWidth: 2,
  },
  tokenImageContainer: {
    width: 80,
    height: 80,
    backgroundColor: '#FFF',
    position: 'relative',
  },
  tokenImage: {
    width: '100%',
    height: '100%',
  },
  tokenImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  tokenImagePlaceholderText: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.accent,
  },
  statusBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  tokenInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  tokenName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  tokenSize: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  tokenValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  tokenPnl: {
    fontSize: 12,
    fontWeight: '600',
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
  modalCancel: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  // Empty states
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
  },
  emptySellState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptySellTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptySellSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  // Sell modals
  sellPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: theme.backgroundSecondary,
  },
  sellPickRowBloom: {
    backgroundColor: 'rgba(245, 196, 154, 0.15)',
    borderWidth: 1,
    borderColor: theme.accent,
  },
  sellPickRowHome: {
    borderWidth: 1,
    borderColor: theme.border,
  },
  sellPickLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sellPickThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFF',
  },
  sellOptionPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  sellOptionPlaceholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.accent,
  },
  sellPickText: {
    marginLeft: 12,
    flex: 1,
  },
  sellPickName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  sellPickMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sellPickMeta: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  sellPickBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sellPickBadgeBloom: {
    backgroundColor: theme.accent,
  },
  sellPickBadgeHome: {
    backgroundColor: theme.backgroundTertiary,
  },
  sellPickBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sellPickBadgeTextBloom: {
    color: '#FFF',
  },
  sellPickBadgeTextHome: {
    color: theme.textSecondary,
  },
  sellPickValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
    marginLeft: 12,
  },
  sellHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sellHeaderImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#FFF',
  },
  sellHeaderText: {
    marginLeft: 16,
    flex: 1,
  },
  sellHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  sellHeaderMeta: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  sellDecisionBlock: {
    marginBottom: 16,
  },
  sellDecisionPrimary: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  sellDecisionPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  sellDecisionSecondary: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sellDecisionSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  sellDecisionSubtext: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  marketplaceScroll: {
    maxHeight: 300,
  },
  marketplaceCard: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  marketplaceCardBest: {
    borderColor: theme.success,
    borderWidth: 2,
  },
  marketplaceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  marketplaceName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  bestBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.success,
    backgroundColor: theme.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  marketplaceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  marketplaceRowTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  marketplaceLabel: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  marketplaceLabelTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  marketplaceValue: {
    fontSize: 13,
    color: theme.textPrimary,
  },
  marketplaceValueNeg: {
    fontSize: 13,
    color: theme.error,
  },
  marketplaceValueTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.success,
  },
  // Exchange listing
  priceInputSection: {
    marginBottom: 24,
  },
  priceInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  priceInputPrefix: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.textSecondary,
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: theme.textPrimary,
    paddingVertical: 16,
  },
  priceInputHint: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 8,
  },
  listButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  listButtonDisabled: {
    opacity: 0.5,
  },
  listButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  successState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  successIcon: {
    fontSize: 48,
    color: theme.success,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  // Buy modal
  buyOfferPreview: {
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  buyOfferImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#FFF',
    marginBottom: 12,
  },
  buyOfferTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  buyOfferPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  sizeInputSection: {
    marginBottom: 24,
  },
  sizeInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  sizeInput: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  destinationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 12,
  },
  buyModalButton: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  buyModalButtonPrimary: {
    backgroundColor: theme.accent,
  },
  buyModalButtonSecondary: {
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  buyModalButtonDisabled: {
    opacity: 0.5,
  },
  buyModalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  buyModalButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
});
