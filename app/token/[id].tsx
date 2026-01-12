// Token Detail Screen - Ownership-first model with status-specific views
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Web-compatible alert/confirm
const showAlert = (title: string, message: string, buttons?: Array<{text: string, onPress?: () => void, style?: string}>) => {
  if (Platform.OS === 'web') {
    // On web, use window.alert for simple alerts, window.confirm for confirmations
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';
import CostBasisEditor from '../../components/CostBasisEditor';
import OwnedPosition from '../../components/OwnedPosition';
import PriceChart, { PricePoint, RangeOption } from '../../components/PriceChart';
import StatsRow from '../../components/StatsRow';

interface TokenDetail {
  id: string;
  order_id: string;
  sku: string;
  product_name: string;
  size: string;
  product_image_url: string | null;
  purchase_price: number;
  purchase_date: string;
  custody_type: 'bloom' | 'home'; // Bloom vault or user's home
  vault_location: string | null;
  verification_photos: string[] | null;
  verified_at: string | null;
  is_exchange_eligible: boolean;
  current_value: number | null;
  pnl_dollars: number | null;
  pnl_percent: number | null;
  is_listed_for_sale: boolean;
  listing_price: number | null;
  status: 'acquiring' | 'in_custody' | 'listed' | 'redeeming' | 'shipped' | 'redeemed' | 'shipping_to_bloom';
  match_status?: 'matched' | 'pending';
  matched_asset_id?: string | null;
  last_price_checked_at?: string | null;
  last_price_updated_at?: string | null;
  // Redemption fields
  redemption_name: string | null;
  redemption_address_line1: string | null;
  redemption_city: string | null;
  redemption_state: string | null;
  redemption_zip: string | null;
  redemption_requested_at: string | null;
  redemption_shipped_at: string | null;
  redemption_delivered_at: string | null;
  redemption_tracking_number: string | null;
  redemption_tracking_carrier: string | null;
}

interface AssetDetails {
  id: string;
  name: string | null;
  description: string | null;
  brand: string | null;
  category: string | null;
  stockx_sku: string | null;
  price_source: string | null;
  catalog_item?: {
    brand: string | null;
    model: string | null;
    colorway_name: string | null;
    style_code: string | null;
    release_year: number | null;
  } | null;
}

interface TokenAttributes {
  condition?: string | null;
  brand?: string | null;
}

const PRICE_RANGES: RangeOption[] = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'ALL', days: 'all' },
];

const SIZE_OPTIONS = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'];
const LAST_SIZE_KEY = 'last_market_size';

export default function TokenDetailScreen() {
  const { id, sell } = useLocalSearchParams<{ id: string; sell?: string }>();
  const { session } = useAuth();
  const [token, setToken] = useState<TokenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [showListingModal, setShowListingModal] = useState(false);
  const [listingPrice, setListingPrice] = useState('');
  const [listingLoading, setListingLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [sellTriggered, setSellTriggered] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertType, setAlertType] = useState<'above' | 'below'>('above');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [showCostBasisModal, setShowCostBasisModal] = useState(false);
  const [showSellSheet, setShowSellSheet] = useState(false);
  const [showMarketSheet, setShowMarketSheet] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [statsHistory, setStatsHistory] = useState<PricePoint[]>([]);
  const [selectedRange, setSelectedRange] = useState<RangeOption>(PRICE_RANGES[0]);
  const [assetDetails, setAssetDetails] = useState<AssetDetails | null>(null);
  const [tokenAttributes, setTokenAttributes] = useState<TokenAttributes | null>(null);
  const [marketplaceSize, setMarketplaceSize] = useState('');

  const handleMarketplaceSizeSelect = async (size: string) => {
    setMarketplaceSize(size);
    try {
      await AsyncStorage.setItem(LAST_SIZE_KEY, size);
    } catch (e) {
      console.error('Failed to persist size', e);
    }
  };

  const fetchToken = useCallback(async () => {
    if (!id || !session) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_token_detail', { p_token_id: id });

      if (!error && data && data.length > 0) {
        setToken(data[0]);
      }
    } catch (e) {
      console.error('Error fetching token:', e);
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  const fetchAssetDetails = useCallback(async (assetId: string) => {
    const { data, error } = await supabase
      .from('assets')
      .select('id, name, description, brand, category, stockx_sku, price_source, catalog_item:catalog_items (brand, model, colorway_name, style_code, release_year)')
      .eq('id', assetId)
      .maybeSingle();

    if (!error && data) {
      setAssetDetails(data as AssetDetails);
    } else {
      setAssetDetails(null);
    }
  }, []);

  const fetchTokenAttributes = useCallback(async (tokenId: string) => {
    const { data, error } = await supabase
      .from('tokens')
      .select('attributes')
      .eq('id', tokenId)
      .maybeSingle();

    if (!error && data?.attributes) {
      setTokenAttributes(data.attributes as TokenAttributes);
    } else {
      setTokenAttributes(null);
    }
  }, []);

  const fetchPriceHistory = useCallback(async (assetId: string, range: RangeOption) => {
    const query = supabase
      .from('asset_price_points')
      .select('price, ts')
      .eq('asset_id', assetId)
      .order('ts', { ascending: true });

    if (range.days !== 'all') {
      const start = new Date(Date.now() - range.days * 24 * 60 * 60 * 1000).toISOString();
      query.gte('ts', start);
    }

    const { data, error } = await query;

    if (!error && data) {
      const parsed = data.map((point: { price: number | string; ts: string }) => ({
        price: Number(point.price),
        recorded_at: point.ts,
      }));
      setPriceHistory(parsed);
    } else {
      setPriceHistory([]);
    }
  }, []);

  const fetchStatsHistory = useCallback(async (assetId: string) => {
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('asset_price_points')
      .select('price, ts')
      .eq('asset_id', assetId)
      .gte('ts', start)
      .order('ts', { ascending: true });

    if (!error && data) {
      const parsed = data.map((point: { price: number | string; ts: string }) => ({
        price: Number(point.price),
        recorded_at: point.ts,
      }));
      setStatsHistory(parsed);
    } else {
      setStatsHistory([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchToken();
    }, [fetchToken])
  );

  useEffect(() => {
    if (token?.matched_asset_id) {
      fetchAssetDetails(token.matched_asset_id);
      fetchStatsHistory(token.matched_asset_id);
    } else {
      setAssetDetails(null);
      setStatsHistory([]);
    }
  }, [token?.matched_asset_id, fetchAssetDetails, fetchStatsHistory]);

  useEffect(() => {
    if (token?.matched_asset_id) {
      fetchPriceHistory(token.matched_asset_id, selectedRange);
    } else {
      setPriceHistory([]);
    }
  }, [token?.matched_asset_id, fetchPriceHistory, selectedRange]);

  useEffect(() => {
    if (token?.id) {
      fetchTokenAttributes(token.id);
    }
  }, [token?.id, fetchTokenAttributes]);

  useEffect(() => {
    if (token?.size) {
      setMarketplaceSize(token.size);
      return;
    }
    AsyncStorage.getItem(LAST_SIZE_KEY)
      .then((value) => {
        if (value) setMarketplaceSize(value);
      })
      .catch((e) => console.error('Failed to load size', e));
  }, [token?.size]);

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined || price === 0) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
  };

  const formatMoneyValue = (price: number | null | undefined) => {
    if (price === null || price === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
  };

  const formatChange = (delta: number | null, percent: number | null) => {
    if (delta === null) return '—';
    const sign = delta >= 0 ? '+' : '';
    const percentLabel =
      percent === null ? '--' : `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
    return `${sign}${formatMoneyValue(delta)} (${percentLabel})`;
  };

  // Build sell URL for marketplace
  const buildMarketplaceUrl = (marketplace: string) => {
    const size = token?.size || marketplaceSize;
    const searchQuery = token ? `${token.product_name} ${size || ''}`.trim() : '';
    const query = encodeURIComponent(searchQuery);
    switch (marketplace) {
      case 'stockx': return `https://stockx.com/search?s=${query}`;
      case 'goat': return `https://www.goat.com/search?query=${query}`;
      case 'ebay': return `https://www.ebay.com/sch/i.html?_nkw=${query}`;
      default: return `https://www.google.com/search?q=${query}`;
    }
  };

  const formatTimeAgo = (dateString?: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const rangeChange = useMemo(() => {
    if (priceHistory.length < 2) return null;
    const first = priceHistory[0]?.price ?? 0;
    const last = priceHistory[priceHistory.length - 1]?.price ?? 0;
    const delta = last - first;
    const percent = first > 0 ? (delta / first) * 100 : null;
    return { delta, percent };
  }, [priceHistory]);

  const dayChange = useMemo(() => {
    if (statsHistory.length < 2) return { delta: null, percent: null };
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = statsHistory.filter(
      (point) => new Date(point.recorded_at).getTime() >= cutoff
    );
    if (recent.length < 2) return { delta: null, percent: null };
    const first = recent[0]?.price ?? 0;
    const last = recent[recent.length - 1]?.price ?? 0;
    const delta = last - first;
    const percent = first > 0 ? (delta / first) * 100 : null;
    return { delta, percent };
  }, [statsHistory]);

  const statsChange7d = useMemo(() => {
    if (statsHistory.length < 2) return { delta: null, percent: null };
    const first = statsHistory[0]?.price ?? 0;
    const last = statsHistory[statsHistory.length - 1]?.price ?? 0;
    const delta = last - first;
    const percent = first > 0 ? (delta / first) * 100 : null;
    return { delta, percent };
  }, [statsHistory]);

  const rangeHighLow = useMemo(() => {
    if (priceHistory.length < 2) return null;
    const prices = priceHistory.map((point) => point.price);
    return {
      high: Math.max(...prices),
      low: Math.min(...prices),
    };
  }, [priceHistory]);

  const hasValue = token?.current_value !== null && token?.current_value !== undefined;
  const cashOutEstimate = token && hasValue
    ? Math.round(token.current_value * 0.88 * 100) / 100
    : 0;

  const handleListForSale = () => {
    if (!token?.is_exchange_eligible) {
      showAlert(
        'Not Exchange Eligible',
        'This token must be verified in Bloom custody before it can be listed for sale.'
      );
      return;
    }
    // Pre-fill with current value as suggested price
    setListingPrice(token.current_value?.toString() || '');
    setShowListingModal(true);
  };

  const handleConfirmListing = async () => {
    if (!token) return;

    const price = parseFloat(listingPrice);
    if (isNaN(price) || price < 50 || price > 50000) {
      showAlert('Invalid Price', 'Price must be between $50 and $50,000');
      return;
    }

    try {
      setListingLoading(true);
      const { data, error } = await supabase.rpc('list_token_for_sale', {
        p_token_id: token.id,
        p_listing_price: price,
      });

      if (error) throw error;

      if (data?.success) {
        setShowListingModal(false);
        showAlert(
          'Listed Successfully',
          `Your ${token.product_name} is now listed for ${formatPrice(price)}.`,
          [{ text: 'OK', onPress: fetchToken }]
        );
      } else {
        throw new Error(data?.error || 'Failed to list token');
      }
    } catch (e: any) {
      console.error('Listing failed:', e);
      showAlert('Listing Failed', e.message || 'Please try again.');
    } finally {
      setListingLoading(false);
    }
  };

  const handleUnlist = async () => {
    if (!token) return;

    const doUnlist = async () => {
      try {
        console.log('Attempting to unlist token:', token.id);

        const { data, error } = await supabase.rpc('unlist_token', {
          p_token_id: token.id,
        });

        console.log('Unlist RPC response:', { data, error });

        if (error) {
          console.error('RPC error:', error);
          throw error;
        }

        // Handle both direct object and potential array response
        const result = Array.isArray(data) ? data[0] : data;

        if (result?.success) {
          showAlert('Unlisted', 'Your token has been removed from the exchange.');
          fetchToken();
        } else {
          throw new Error(result?.error || 'Failed to unlist token');
        }
      } catch (e: any) {
        console.error('Unlist failed:', e);
        showAlert('Failed', e.message || 'Please try again.');
      }
    };

    showAlert(
      'Remove Listing',
      'Are you sure you want to remove this listing from the exchange?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doUnlist },
      ]
    );
  };

  const handleRedeem = () => {
    if (token?.status !== 'in_custody') {
      showAlert('Not Available', 'This token is not available for redemption.');
      return;
    }
    // Show warning before navigating to redemption flow
    showAlert(
      'Ship to Me?',
      'This will ship the physical item to you. Once shipped, this token can no longer be traded on the exchange.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            router.push({
              pathname: '/redeem/[tokenId]',
              params: { tokenId: token.id },
            });
          },
        },
      ]
    );
  };

  const handleSellEntry = () => {
    if (!token) return;
    if (token.match_status === 'pending' || !hasValue) {
      showAlert('Needs match', 'Match this item to enable pricing and selling.');
      return;
    }
    if (token.custody_type === 'bloom') {
      handleListForSale();
      return;
    }
    showAlert(
      'Coming Soon',
      `Marketplace selling is coming soon. You’ll receive ~${formatPrice(cashOutEstimate)} after fees.`
    );
  };

  const handleSendToBloom = () => {
    showAlert(
      'Send to Bloom',
      'To move this item into Bloom custody, ship it directly from the source to Bloom. We will add the official flow here.',
    );
  };

  const handleSaveAlert = async () => {
    if (!token || !session) return;
    if (!token.matched_asset_id) {
      showAlert('Match required', 'Match this item to enable price alerts.');
      return;
    }

    const threshold = parseFloat(alertThreshold);
    if (Number.isNaN(threshold) || threshold <= 0) {
      showAlert('Invalid threshold', 'Enter a valid dollar amount.');
      return;
    }

    try {
      const { error } = await supabase
        .from('price_alerts')
        .insert({
          user_id: session.user.id,
          asset_id: token.matched_asset_id,
          type: alertType,
          threshold,
        });

      if (error) throw error;
      setShowAlertModal(false);
      setAlertThreshold('');
      showAlert('Alert set', "We'll notify you when the price hits your target.");
    } catch (e: any) {
      showAlert('Failed to set alert', e.message || 'Please try again.');
    }
  };

  const handleSaveCostBasis = async (value: string) => {
    if (!token || !session) return;

    const costBasis = parseFloat(value);
    if (Number.isNaN(costBasis) || costBasis < 0) {
      showAlert('Invalid amount', 'Enter a valid dollar amount.');
      return;
    }

    try {
      const { error } = await supabase
        .from('tokens')
        .update({ purchase_price: costBasis })
        .eq('id', token.id);

      if (error) throw error;
      const updatedPnl =
        token.current_value && costBasis > 0
          ? token.current_value - costBasis
          : null;
      const updatedPercent =
        token.current_value && costBasis > 0
          ? ((token.current_value - costBasis) / costBasis) * 100
          : null;
      setToken((prev) =>
        prev
          ? {
              ...prev,
              purchase_price: costBasis,
              pnl_dollars: updatedPnl,
              pnl_percent: updatedPercent,
            }
          : prev
      );
      setShowCostBasisModal(false);
      showAlert('Cost basis updated', 'Your P&L will now reflect this purchase price.');
    } catch (e: any) {
      showAlert('Failed to update', e.message || 'Please try again.');
    }
  };

  const handleRemove = () => {
    showAlert(
      'Remove from Portfolio?',
      'This will permanently remove this item from your portfolio. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // First delete any related token_transfers
              await supabase
                .from('token_transfers')
                .delete()
                .eq('token_id', token?.id);

              // Then delete the token
              const { error } = await supabase
                .from('tokens')
                .delete()
                .eq('id', token?.id);

              if (error) throw error;

              showAlert('Removed', 'Item removed from portfolio.');
              router.back();
            } catch (e: any) {
              showAlert('Error', e.message || 'Failed to remove item.');
            }
          },
        },
      ]
    );
  };

  // Status helpers
  const isInCustody = token?.status === 'in_custody';
  const isListed = token?.status === 'listed';
  const isBloomCustody = token?.custody_type === 'bloom';
  const isHomeCustody = token?.custody_type === 'home';

  const statusLabel = isBloomCustody
    ? 'IN BLOOM'
    : isHomeCustody
      ? 'AT HOME'
      : 'WATCHLIST';

  useEffect(() => {
    if (!token || sell !== '1' || sellTriggered) return;
    setSellTriggered(true);

    if (isListed || isInCustody) {
      handleSellEntry();
    } else {
      showAlert('Sell not available', 'This item cannot be sold right now.');
    }
  }, [token, sell, sellTriggered, isListed, isInCustody]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Token</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Token</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Token not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const updatedLabel = formatTimeAgo(token.last_price_updated_at || token.last_price_checked_at);
  const catalogItem = assetDetails?.catalog_item;
  const conditionLabel = tokenAttributes?.condition ? `Condition: ${tokenAttributes.condition}` : null;
  const metaLine = [token.sku, token.size ? `Size ${token.size}` : null, conditionLabel]
    .filter(Boolean)
    .join(' · ');
  const priceLabel =
    hasValue && token.current_value && token.current_value > 0
      ? formatMoneyValue(token.current_value)
      : token.match_status === 'pending'
        ? 'Needs match'
        : 'Updating...';
  const changeLabel = rangeChange
    ? formatChange(rangeChange.delta, rangeChange.percent)
    : null;
  const bestPriceLabel =
    assetDetails?.price_source && hasValue
      ? `Best price: ${formatMoneyValue(token.current_value)} on ${assetDetails.price_source}`
      : null;
  const marketplaceRows = assetDetails?.price_source && hasValue
    ? [{ name: assetDetails.price_source, price: token.current_value }]
    : [];
  const statsItems = [
    { label: 'Market Value', value: formatMoneyValue(token.current_value) },
    { label: 'Day Change', value: formatChange(dayChange.delta, dayChange.percent) },
    { label: '7D Change', value: formatChange(statsChange7d.delta, statsChange7d.percent) },
    {
      label: 'Range High/Low',
      value: rangeHighLow
        ? `${formatMoneyValue(rangeHighLow.high)} / ${formatMoneyValue(rangeHighLow.low)}`
        : '—',
    },
  ];
  const factItems = [
    { label: 'Style Code', value: catalogItem?.style_code || token.sku || assetDetails?.stockx_sku || '—' },
    { label: 'Size', value: token.size || '—' },
    { label: 'Brand', value: catalogItem?.brand || assetDetails?.brand || tokenAttributes?.brand || '—' },
    { label: 'Colorway', value: catalogItem?.colorway_name || '—' },
  ];
  const holdingDays = token.purchase_date
    ? Math.max(0, Math.floor((Date.now() - new Date(token.purchase_date).getTime()) / 86400000))
    : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Ticker */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{token.product_name}</Text>
        <Pressable style={styles.moreButton} onPress={() => setShowMoreMenu(true)}>
          <Text style={styles.moreButtonText}>•••</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroImage}>
            {token.product_image_url && !imageError ? (
              <Image
                source={{ uri: token.product_image_url }}
                style={styles.heroImageAsset}
                resizeMode="contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={[styles.heroImageAsset, styles.placeholderImage]}>
                <Text style={styles.placeholderText}>{token.product_name.charAt(0)}</Text>
              </View>
            )}
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.assetName}>{token.product_name}</Text>
            {metaLine ? <Text style={styles.assetMeta}>{metaLine}</Text> : null}
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusBadge,
                  statusLabel === 'IN BLOOM' && styles.statusBadgeBloom,
                  statusLabel === 'AT HOME' && styles.statusBadgeHome,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    statusLabel === 'IN BLOOM' && styles.statusBadgeTextBloom,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
              {updatedLabel ? (
                <Text style={styles.updatedLabel}>Updated {updatedLabel}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.priceStrip}>
          <View style={styles.priceMainRow}>
            <Text style={styles.priceValue}>{priceLabel}</Text>
            {changeLabel ? (
              <View
                style={[
                  styles.changePill,
                  rangeChange && rangeChange.delta >= 0 ? styles.changeUp : styles.changeDown,
                ]}
              >
                <Text style={styles.changeText}>{changeLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.priceSubLabel}>
            Market price (best){assetDetails?.price_source ? ` · ${assetDetails.price_source}` : ''}
          </Text>
          {bestPriceLabel ? (
            <Text style={styles.bestPriceLabel}>{bestPriceLabel}</Text>
          ) : null}
        </View>

        <PriceChart
          data={priceHistory}
          ranges={PRICE_RANGES}
          selectedRange={selectedRange}
          onRangeChange={setSelectedRange}
        />
        <StatsRow stats={statsItems} />

        {(isHomeCustody || isBloomCustody) && (
          <OwnedPosition
            costBasis={token.purchase_price}
            pnlDollars={token.pnl_dollars}
            pnlPercent={token.pnl_percent}
            formatPrice={formatMoneyValue}
            onEditCostBasis={() => setShowCostBasisModal(true)}
            holdingDays={holdingDays}
          />
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Marketplaces</Text>
          {marketplaceRows.length > 0 && (
            <Text style={styles.marketSubLabel}>
              Across {marketplaceRows.length} marketplace{marketplaceRows.length > 1 ? 's' : ''}
            </Text>
          )}
          {marketplaceRows.length > 0 ? (
            marketplaceRows.map((row) => (
              <View key={row.name} style={styles.marketRow}>
                <Text style={styles.marketName}>{row.name}</Text>
                <Text style={styles.marketPrice}>{formatMoneyValue(row.price)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.sectionBody}>Marketplace breakdown coming soon.</Text>
          )}
        </View>

        {/* About Section - only show if description exists */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.sectionBody}>
            {assetDetails?.description || 'Price tracking active.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Facts</Text>
          <View style={styles.factsGrid}>
            {factItems.map((item) => (
              <View key={item.label} style={styles.factCell}>
                <Text style={styles.factLabel}>{item.label}</Text>
                <Text style={styles.factValue}>{String(item.value)}</Text>
              </View>
            ))}
          </View>
        </View>

        {token.status === 'shipped' && token.redemption_tracking_number ? (
          <View style={styles.trackingSection}>
            <Text style={styles.trackingNumber}>
              {token.redemption_tracking_carrier}: {token.redemption_tracking_number}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Action Buttons - State-Driven */}
      <View style={styles.actionContainer}>
        {/* Listed status info */}
        {isListed && (
          <View style={styles.listedInfo}>
            <Text style={styles.listedLabel}>Listed for {formatPrice(token.listing_price)}</Text>
          </View>
        )}

        {/* WATCHLIST: Buy + Set Price Alert */}
        {statusLabel === 'WATCHLIST' ? (
          <>
            <Pressable style={styles.actionButton} onPress={() => setShowMarketSheet(true)}>
              <Text style={styles.actionButtonText}>Buy</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => setShowAlertModal(true)}>
              <Text style={styles.secondaryButtonText}>Set Price Alert</Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* OWNED: Sell + custody-specific action */}
            <Pressable style={styles.actionButton} onPress={() => setShowSellSheet(true)}>
              <Text style={styles.actionButtonText}>Sell</Text>
            </Pressable>
            {isHomeCustody && isInCustody && (
              <Pressable style={styles.secondaryButton} onPress={handleSendToBloom}>
                <Text style={styles.secondaryButtonText}>Send to Bloom</Text>
              </Pressable>
            )}
            {isBloomCustody && isInCustody && (
              <Pressable style={styles.secondaryButton} onPress={handleRedeem}>
                <Text style={styles.secondaryButtonText}>Ship to Me</Text>
              </Pressable>
            )}
          </>
        )}

        <Pressable style={styles.tertiaryButton} onPress={() => setShowMarketSheet(true)}>
          <Text style={styles.tertiaryButtonText}>View marketplaces</Text>
        </Pressable>
      </View>

      {/* Sell Routing Sheet */}
      <Modal
        visible={showSellSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSellSheet(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSellSheet(false)}>
          <View style={styles.sellSheetContent}>
            <Text style={styles.modalTitle}>Sell Options</Text>
            <Text style={styles.sellSheetSubtitle}>
              {token.product_name} · Size {token.size || marketplaceSize || '—'}
            </Text>

            {!token.size && (
              <View style={styles.marketSizeSection}>
                <Text style={styles.marketSizeLabel}>Select size</Text>
                <View style={styles.marketSizeGrid}>
                  {SIZE_OPTIONS.map((size) => (
                    <Pressable
                      key={size}
                      style={[
                        styles.marketSizeChip,
                        marketplaceSize === size && styles.marketSizeChipActive,
                      ]}
                      onPress={() => handleMarketplaceSizeSelect(size)}
                    >
                      <Text
                        style={[
                          styles.marketSizeChipText,
                          marketplaceSize === size && styles.marketSizeChipTextActive,
                        ]}
                      >
                        {size}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Bloom Exchange option for eligible items */}
            {isBloomCustody && token.is_exchange_eligible && (
              <Pressable
                style={[styles.sellOption, styles.sellOptionHighlight]}
                onPress={() => {
                  setShowSellSheet(false);
                  handleListForSale();
                }}
              >
                <Text style={styles.sellOptionTitle}>Bloom Exchange</Text>
                <Text style={styles.sellOptionDesc}>Instant transfer, lowest fees</Text>
              </Pressable>
            )}

            {/* External marketplaces */}
            {['stockx', 'goat', 'ebay'].map((marketplace) => (
              <Pressable
                key={marketplace}
                style={[
                  styles.sellOption,
                  !token.size && !marketplaceSize && styles.sellOptionDisabled,
                ]}
                onPress={() => {
                  if (!token.size && !marketplaceSize) return;
                  Linking.openURL(buildMarketplaceUrl(marketplace));
                  setShowSellSheet(false);
                }}
                disabled={!token.size && !marketplaceSize}
              >
                <Text style={styles.sellOptionTitle}>{marketplace.toUpperCase()}</Text>
                <Text style={styles.sellOptionDesc}>Open and list there</Text>
              </Pressable>
            ))}

            <Pressable style={styles.modalCancel} onPress={() => setShowSellSheet(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Marketplaces Sheet */}
      <Modal
        visible={showMarketSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMarketSheet(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMarketSheet(false)}>
          <View style={styles.sellSheetContent}>
            <Text style={styles.modalTitle}>Marketplaces</Text>
            <Text style={styles.sellSheetSubtitle}>
              {token.product_name} · Size {token.size || marketplaceSize || '—'}
            </Text>

            {!token.size && (
              <View style={styles.marketSizeSection}>
                <Text style={styles.marketSizeLabel}>Select size</Text>
                <View style={styles.marketSizeGrid}>
                  {SIZE_OPTIONS.map((size) => (
                    <Pressable
                      key={size}
                      style={[
                        styles.marketSizeChip,
                        marketplaceSize === size && styles.marketSizeChipActive,
                      ]}
                      onPress={() => handleMarketplaceSizeSelect(size)}
                    >
                      <Text
                        style={[
                          styles.marketSizeChipText,
                          marketplaceSize === size && styles.marketSizeChipTextActive,
                        ]}
                      >
                        {size}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {['stockx', 'goat', 'ebay'].map((marketplace) => (
              <Pressable
                key={marketplace}
                style={[
                  styles.sellOption,
                  !token.size && !marketplaceSize && styles.sellOptionDisabled,
                ]}
                onPress={() => {
                  if (!token.size && !marketplaceSize) return;
                  Linking.openURL(buildMarketplaceUrl(marketplace));
                  setShowMarketSheet(false);
                }}
                disabled={!token.size && !marketplaceSize}
              >
                <Text style={styles.sellOptionTitle}>{marketplace.toUpperCase()}</Text>
                <Text style={styles.sellOptionDesc}>View recent listings</Text>
              </Pressable>
            ))}

            <Pressable style={styles.modalCancel} onPress={() => setShowMarketSheet(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Listing Modal */}
      <Modal
        visible={showListingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowListingModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Price</Text>
              <Pressable onPress={() => setShowListingModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.priceInputWrapper}>
                <Text style={styles.priceCurrency}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  value={listingPrice}
                  onChangeText={setListingPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textTertiary}
                  autoFocus
                />
              </View>

              <Text style={styles.feeNote}>
                You’ll receive ~{formatPrice((parseFloat(listingPrice) || 0) * 0.97)} after fees
              </Text>

              <Pressable
                style={[styles.modalButton, listingLoading && styles.modalButtonDisabled]}
                onPress={handleConfirmListing}
                disabled={listingLoading}
              >
                <Text style={styles.modalButtonText}>
                  {listingLoading ? 'Listing...' : 'List for Sale'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Overflow Menu */}
      <Modal
        visible={showMoreMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowMoreMenu(false)}>
          <View style={styles.menuContent}>
            {(isInCustody || isListed) && (
              <Pressable style={styles.menuItem} onPress={() => {
                setShowMoreMenu(false);
                handleSellEntry();
              }}>
                <Text style={styles.menuItemText}>{isListed ? 'Update Price' : 'Sell'}</Text>
              </Pressable>
            )}
            {isListed && (
              <Pressable style={styles.menuItem} onPress={() => {
                setShowMoreMenu(false);
                handleUnlist();
              }}>
                <Text style={styles.menuItemText}>Remove Listing</Text>
              </Pressable>
            )}
            <Pressable style={styles.menuItem} onPress={() => {
              setShowMoreMenu(false);
              setShowAlertModal(true);
            }}>
              <Text style={styles.menuItemText}>Set price alert</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => {
              setShowMoreMenu(false);
              handleRemove();
            }}>
              <Text style={styles.menuItemDanger}>Remove from Portfolio</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => setShowMoreMenu(false)}>
              <Text style={styles.menuItemText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Alert Modal */}
      <Modal
        visible={showAlertModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAlertModal(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowAlertModal(false)}>
          <View style={styles.alertModalContent}>
            <Text style={styles.modalTitle}>Set price alert</Text>
            <View style={styles.alertToggleRow}>
              <Pressable
                style={[styles.alertToggle, alertType === 'above' && styles.alertToggleActive]}
                onPress={() => setAlertType('above')}
              >
                <Text style={[styles.alertToggleText, alertType === 'above' && styles.alertToggleTextActive]}>
                  Above
                </Text>
              </Pressable>
              <Pressable
                style={[styles.alertToggle, alertType === 'below' && styles.alertToggleActive]}
                onPress={() => setAlertType('below')}
              >
                <Text style={[styles.alertToggleText, alertType === 'below' && styles.alertToggleTextActive]}>
                  Below
                </Text>
              </Pressable>
            </View>
            <View style={styles.alertInputRow}>
              <Text style={styles.alertCurrency}>$</Text>
              <TextInput
                style={styles.alertInput}
                value={alertThreshold}
                onChangeText={setAlertThreshold}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.textTertiary}
              />
            </View>
            <Pressable style={styles.modalButton} onPress={handleSaveAlert}>
              <Text style={styles.modalButtonText}>Save alert</Text>
            </Pressable>
            <Pressable style={styles.modalCancel} onPress={() => setShowAlertModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <CostBasisEditor
        visible={showCostBasisModal}
        initialValue={token.purchase_price}
        onClose={() => setShowCostBasisModal(false)}
        onSave={handleSaveCostBasis}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 24,
    color: theme.accent,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: theme.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  moreButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButtonText: {
    fontSize: 18,
    color: theme.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 180,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heroImage: {
    width: 96,
    height: 96,
    borderRadius: 14,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroImageAsset: {
    width: '100%',
    height: '100%',
  },
  heroInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  assetName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  assetMeta: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statusBadgeBloom: {
    backgroundColor: 'rgba(245, 166, 35, 0.2)',
    borderColor: '#F5A623',
  },
  statusBadgeHome: {
    backgroundColor: theme.backgroundSecondary,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    letterSpacing: 0.4,
  },
  statusBadgeTextBloom: {
    color: '#F5A623',
  },
  updatedLabel: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  priceStrip: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  priceMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  changePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  changeUp: {
    backgroundColor: theme.successBg,
  },
  changeDown: {
    backgroundColor: theme.errorBg,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  priceSubLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 6,
  },
  bestPriceLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 4,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: theme.textPrimary,
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  marketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  marketSubLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 8,
  },
  marketName: {
    fontSize: 14,
    color: theme.textPrimary,
    fontWeight: '600',
  },
  marketPrice: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  factsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  factCell: {
    width: '47%',
  },
  factLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  factValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: theme.textSecondary,
  },
  imageContainer: {
    backgroundColor: '#FFF',
    padding: 16,
    alignItems: 'center',
  },
  productImage: {
    width: '100%',
    aspectRatio: 1.4,
  },
  placeholderImage: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: theme.accent,
  },
  productInfo: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 15,
    color: theme.textSecondary,
  },
  custodyBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  custodyBadgeHome: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  custodyBadgeShipping: {
    backgroundColor: 'rgba(245, 166, 35, 0.2)',
  },
  custodyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  valueSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  valueLabel: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  valueAmount: {
    fontFamily: fonts.heading,
    fontSize: 44,
    color: theme.textPrimary,
    letterSpacing: -1,
  },
  pnlText: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
  },
  costBasisLink: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  addCostBasisCta: {
    fontSize: 14,
    color: theme.accent,
    fontWeight: '600',
    marginTop: 4,
  },
  updatedText: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 6,
  },
  statusNote: {
    fontSize: 15,
    color: theme.textSecondary,
    marginTop: 4,
  },
  trackingSection: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  trackingNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accent,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 12,
  },
  actionButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
  secondaryButton: {
    backgroundColor: theme.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  tertiaryButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  tertiaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  listedInfo: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  listedLabel: {
    fontSize: 15,
    color: theme.success,
    fontWeight: '500',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
  },
  alertModalContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
  },
  menuItem: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  menuItemDanger: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.error,
  },
  alertToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  alertToggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  alertToggleActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  alertToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  alertToggleTextActive: {
    color: theme.textInverse,
  },
  alertInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  alertCurrency: {
    fontSize: 28,
    fontWeight: '600',
    color: theme.textPrimary,
    marginRight: 4,
  },
  alertInput: {
    fontSize: 28,
    fontWeight: '600',
    color: theme.textPrimary,
    minWidth: 120,
    textAlign: 'center',
  },
  shippingInfo: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(245, 166, 35, 0.1)',
    borderRadius: 12,
    marginBottom: 12,
  },
  shippingInfoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  shippingInfoCode: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: '#F5A623',
    letterSpacing: 3,
    marginBottom: 8,
  },
  shippingInfoNote: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.textPrimary,
  },
  modalClose: {
    fontSize: 16,
    color: theme.accent,
  },
  modalBody: {
    padding: 16,
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  priceCurrency: {
    fontSize: 40,
    fontWeight: '600',
    color: theme.textPrimary,
    marginRight: 4,
  },
  priceInput: {
    fontSize: 40,
    fontWeight: '600',
    color: theme.textPrimary,
    minWidth: 120,
    textAlign: 'center',
  },
  feeNote: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalButtonDisabled: {
    backgroundColor: theme.card,
  },
  modalButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
  modalCancel: {
    marginTop: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    color: theme.textSecondary,
  },
  // New position page styles
  headerTicker: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: theme.textSecondary,
    flex: 1,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  priceHero: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  priceValue: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: theme.textPrimary,
    letterSpacing: -1,
  },
  stateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: theme.border,
  },
  stateBadgeBloom: {
    backgroundColor: 'rgba(245, 166, 35, 0.2)',
    borderColor: '#F5A623',
  },
  stateBadgeHome: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: theme.border,
  },
  stateBadgeShipping: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3B82F6',
  },
  stateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    letterSpacing: 0.5,
  },
  stateBadgeTextBloom: {
    color: '#F5A623',
  },
  pnlDelta: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
  },
  positionGrid: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: theme.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  positionRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  positionCell: {
    flex: 1,
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: theme.border,
  },
  positionLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  positionValue: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  positionEdit: {
    fontSize: 12,
    color: theme.accent,
    marginTop: 2,
  },
  positionValueAdd: {
    fontSize: 16,
    color: theme.accent,
    fontWeight: '600',
  },
  sellSheetContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  sellSheetSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  marketSizeSection: {
    marginBottom: 12,
  },
  marketSizeLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  marketSizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  marketSizeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  marketSizeChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  marketSizeChipText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: '600',
  },
  marketSizeChipTextActive: {
    color: theme.textInverse,
  },
  sellOption: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sellOptionDisabled: {
    opacity: 0.5,
  },
  sellOptionHighlight: {
    backgroundColor: 'rgba(245, 166, 35, 0.1)',
    borderColor: '#F5A623',
  },
  sellOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  sellOptionDesc: {
    fontSize: 13,
    color: theme.textSecondary,
  },
});
