// Asset Detail Screen (Coinbase Style with Price Chart)
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';
import CostBasisEditor from '../../components/CostBasisEditor';
import OwnedPosition from '../../components/OwnedPosition';
import PriceChart, { PricePoint, RangeOption } from '../../components/PriceChart';
import StatsRow from '../../components/StatsRow';

// Available shoe sizes
const AVAILABLE_SIZES = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'];

// Staleness threshold (4 hours in minutes)
const STALE_MINUTES = 240;

// Price chart range options
const PRICE_RANGES: RangeOption[] = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'ALL', days: 'all' },
];

const LAST_SIZE_KEY = 'last_market_size';
const MARKETPLACE_LABELS: Record<string, string> = {
  stockx: 'StockX',
  goat: 'GOAT',
  ebay: 'eBay',
};

interface Asset {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  owner_id: string | null;
  status: string;
  size: string | null;
  description: string | null;
  provenance: string | null;
  category: string | null;
  brand: string | null;
  stockx_sku: string | null;
  last_price_update: string | null;
  last_price_checked_at: string | null;
  last_price_updated_at: string | null;
  updated_at_pricing: string | null;
  price_24h_ago: number | null;
  price_change: number | null;
  price_change_percent: number | null;
  custody_status: 'in_vault' | 'available_to_acquire' | null;
  location: 'home' | 'bloom' | 'watchlist' | null;
  purchase_price: number | null;
}

interface CatalogDetails {
  brand: string | null;
  colorway_name: string | null;
  style_code: string | null;
}

interface ExchangeListing {
  id: string;
  sku: string;
  product_name: string;
  size: string | null;
  product_image_url: string | null;
  listing_price: number;
}

export default function AssetDetailScreen() {
  const { id, sell } = useLocalSearchParams<{ id: string; sell?: string }>();
  const { session } = useAuth();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [statsHistory, setStatsHistory] = useState<PricePoint[]>([]);
  const [catalogDetails, setCatalogDetails] = useState<CatalogDetails | null>(null);
  const [priceSource, setPriceSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [sellTriggered, setSellTriggered] = useState(false);
  const [showBuyIntent, setShowBuyIntent] = useState(false);
  const [showHomeBuyOptions, setShowHomeBuyOptions] = useState(false);
  const [marketplaceLane, setMarketplaceLane] = useState<'a' | 'b'>('b');
  const [matchingListing, setMatchingListing] = useState<ExchangeListing | null>(null);
  const [matchingListingLoading, setMatchingListingLoading] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertType, setAlertType] = useState<'above' | 'below'>('above');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [showCostBasisModal, setShowCostBasisModal] = useState(false);
  const [selectedRange, setSelectedRange] = useState<RangeOption>(PRICE_RANGES[0]);

  const handleSizeSelect = async (size: string) => {
    setSelectedSize(size);
    try {
      await AsyncStorage.setItem(LAST_SIZE_KEY, size);
    } catch (e) {
      console.error('Failed to persist size', e);
    }
  };

  const loadPriceHistory = async (assetId: string, range: RangeOption) => {
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
      setPriceHistory(
        data.map((point: { price: number | string; ts: string }) => ({
          price: Number(point.price),
          recorded_at: point.ts,
        }))
      );
    } else {
      setPriceHistory([]);
    }
  };

  const loadStatsHistory = async (assetId: string) => {
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('asset_price_points')
      .select('price, ts')
      .eq('asset_id', assetId)
      .gte('ts', start)
      .order('ts', { ascending: true });

    if (!error && data) {
      setStatsHistory(
        data.map((point: { price: number | string; ts: string }) => ({
          price: Number(point.price),
          recorded_at: point.ts,
        }))
      );
    } else {
      setStatsHistory([]);
    }
  };

  const loadCatalogDetails = async (assetId: string) => {
    const { data, error } = await supabase
      .from('assets')
      .select('price_source, catalog_item:catalog_items (brand, colorway_name, style_code)')
      .eq('id', assetId)
      .maybeSingle();

    if (!error && data) {
      setCatalogDetails((data.catalog_item as CatalogDetails) || null);
      setPriceSource((data.price_source as string) || null);
    } else {
      setCatalogDetails(null);
      setPriceSource(null);
    }
  };

  useEffect(() => {
    const fetchAsset = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setImageError(false);

        // Fetch asset with price change data
        const { data: assetData, error: assetError } = await supabase
          .rpc('get_asset_with_price_change', { p_asset_id: id });

        if (!assetError && assetData && assetData.length > 0) {
          setAsset(assetData[0]);
          if (assetData[0].size) {
            setSelectedSize(assetData[0].size);
          }
        } else {
          // Fallback to direct query
          const { data, error } = await supabase
            .from('assets')
            .select('*')
            .eq('id', id)
            .maybeSingle();

          if (!error && data) {
            setAsset({
              ...data,
              price_24h_ago: null,
              price_change: null,
              price_change_percent: null,
            });
            if (data.size) {
              setSelectedSize(data.size);
            }
          }
        }

        await Promise.all([
          loadPriceHistory(id, selectedRange),
          loadStatsHistory(id),
          loadCatalogDetails(id),
        ]);
      } catch (e) {
        console.error('Error fetching asset:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchAsset();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    loadPriceHistory(id, selectedRange);
  }, [id, selectedRange]);

  useEffect(() => {
    if (asset?.size) return;
    if (selectedSize) return;
    AsyncStorage.getItem(LAST_SIZE_KEY)
      .then((value) => {
        if (value) setSelectedSize(value);
      })
      .catch((e) => console.error('Failed to load size', e));
  }, [asset?.size, selectedSize]);

  // Calculate day change from 7D stats history
  const dayChange = useMemo(() => {
    if (statsHistory.length < 2) return { delta: null, percent: null };
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = statsHistory.filter((p) => new Date(p.recorded_at).getTime() >= cutoff);
    if (recent.length < 2) return { delta: null, percent: null };
    const first = recent[0]?.price ?? 0;
    const last = recent[recent.length - 1]?.price ?? 0;
    const delta = last - first;
    const percent = first > 0 ? (delta / first) * 100 : null;
    return { delta, percent };
  }, [statsHistory]);

  const change7d = useMemo(() => {
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

  const formatPrice = (price: number | null | undefined) => {
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
    return `${sign}${formatPrice(delta)} (${percentLabel})`;
  };

  const formatPriceChange = (change: number | null) => {
    if (change === null || change === 0) return null;
    const sign = change >= 0 ? '+' : '';
    return `${sign}${formatPrice(change)}`;
  };

  const formatPercentChange = (percent: number | null) => {
    if (percent === null || percent === 0) return null;
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const formatTimeAgo = (dateString: string | null) => {
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

  const isOwned = asset?.owner_id === session?.user?.id;
  const isAvailable = asset?.status === 'listed' || asset?.owner_id === null;
  const hasFixedSize = asset?.size !== null;
  const hasChange = asset?.price_change !== null && asset?.price_change !== 0;
  const isPositive = (asset?.price_change || 0) >= 0;
  const changeColor = hasChange ? (isPositive ? theme.success : theme.error) : theme.textSecondary;
  const canBuy = hasFixedSize || Boolean(selectedSize);

  const pricingUpdatedAt = asset?.updated_at_pricing || asset?.last_price_checked_at || asset?.last_price_updated_at || asset?.last_price_update;

  // Check if price is stale (older than 4 hours)
  const isStale = !pricingUpdatedAt ||
    ((Date.now() - new Date(pricingUpdatedAt).getTime()) / 60000) > STALE_MINUTES;

  const statusLabel = asset?.location === 'watchlist'
    ? 'WATCHLIST'
    : isOwned
      ? asset?.location === 'bloom'
        ? 'IN BLOOM'
        : 'AT HOME'
      : null;

  const normalizedPriceSource = priceSource?.toLowerCase() || null;
  const sourceLabel = normalizedPriceSource
    ? (MARKETPLACE_LABELS[normalizedPriceSource] || normalizedPriceSource)
    : null;
  const bestPriceLabel = sourceLabel
    ? `Best price: ${formatPrice(asset?.price)} on ${sourceLabel}`
    : null;

  const marketplaceRows = normalizedPriceSource && asset?.price
    ? [{
        id: normalizedPriceSource,
        name: MARKETPLACE_LABELS[normalizedPriceSource] || normalizedPriceSource.toUpperCase(),
        price: asset.price,
      }]
    : [];

  const statsItems = [
    { label: 'Market Value', value: formatPrice(asset?.price) },
    { label: 'Day Change', value: formatChange(dayChange.delta, dayChange.percent) },
    { label: '7D Change', value: formatChange(change7d.delta, change7d.percent) },
    {
      label: 'Range High/Low',
      value: rangeHighLow
        ? `${formatPrice(rangeHighLow.high)} / ${formatPrice(rangeHighLow.low)}`
        : '—',
    },
  ];

  const handleMarketplaceCheckout = (marketplaceId: string) => {
    if (!asset || !session) return;

    if (!hasFixedSize && !selectedSize) {
      Alert.alert('Select Size', 'Please select a size before purchasing.');
      return;
    }

    const size = hasFixedSize ? asset.size! : selectedSize!;

    router.push({
      pathname: '/checkout/confirm-order',
      params: {
        asset_id: asset.id,
        asset_name: asset.name,
        asset_image: asset.image_url || '',
        size,
        price: asset.price.toString(),
        lane: marketplaceLane,
        marketplace: marketplaceId,
      },
    });
  };

  useEffect(() => {
    if (!asset || sell !== '1' || sellTriggered) return;
    if (!isOwned) return;
    setSellTriggered(true);
    handleSell();
  }, [asset, sell, sellTriggered, isOwned]);

  useEffect(() => {
    const loadMatchingListing = async () => {
      if (!showBuyIntent || !session || !asset?.stockx_sku) {
        setMatchingListing(null);
        setMatchingListingLoading(false);
        return;
      }

      const sizeToMatch = hasFixedSize ? asset.size : selectedSize;
      if (!sizeToMatch) {
        setMatchingListing(null);
        setMatchingListingLoading(false);
        return;
      }

      try {
        setMatchingListingLoading(true);
        const { data, error } = await supabase.rpc('get_exchange_listings');
        if (error) throw error;

        const matches = (data || []).filter((listing: any) =>
          listing.sku === asset.stockx_sku && listing.size === sizeToMatch
        );
        if (matches.length === 0) {
          setMatchingListing(null);
          return;
        }

        const best = matches.reduce((lowest: any, current: any) => {
          if (!lowest || current.listing_price < lowest.listing_price) return current;
          return lowest;
        }, null);
        setMatchingListing(best);
      } catch (e) {
        console.error('Error loading exchange listings:', e);
        setMatchingListing(null);
      } finally {
        setMatchingListingLoading(false);
      }
    };

    loadMatchingListing();
  }, [showBuyIntent, session, asset?.stockx_sku, selectedSize, hasFixedSize]);

  const handlePurchase = (options?: { marketplace?: string; lane?: 'a' | 'b' }) => {
    if (!asset || !session) return;

    if (!hasFixedSize && !selectedSize) {
      Alert.alert('Select Size', 'Please select a size before purchasing.');
      return;
    }

    const size = hasFixedSize ? asset.size! : selectedSize!;

    const marketplaceId = options?.marketplace || normalizedPriceSource || 'stockx';
    const laneValue = options?.lane || 'b';

    // Navigate directly to confirm-order
    router.push({
      pathname: '/checkout/confirm-order',
      params: {
        asset_id: asset.id,
        asset_name: asset.name,
        asset_image: asset.image_url || '',
        size: size,
        price: asset.price.toString(),
        lane: laneValue,
        marketplace: marketplaceId,
      },
    });
  };

  const handleSell = async () => {
    if (!asset || !session) return;

    Alert.alert(
      'List for sale',
      `List ${asset.name} on the marketplace?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'List',
          style: 'destructive',
          onPress: async () => {
            try {
              setSelling(true);

              const { error } = await supabase
                .from('assets')
                .update({
                  owner_id: null,
                  status: 'listed',
                })
                .eq('id', asset.id)
                .eq('owner_id', session.user.id);

              if (error) throw error;

              Alert.alert(
                'Listed successfully',
                `${asset.name} is now available on the marketplace.`,
                [{ text: 'Browse marketplace', onPress: () => router.replace('/(tabs)/exchange') }]
              );
            } catch (e: any) {
              console.error('Listing failed:', e);
              Alert.alert('Listing failed', e.message || 'Please try again.');
            } finally {
              setSelling(false);
            }
          },
        },
      ]
    );
  };

  const handleSaveAlert = async () => {
    if (!asset || !session) return;

    const threshold = parseFloat(alertThreshold);
    if (Number.isNaN(threshold) || threshold <= 0) {
      Alert.alert('Invalid threshold', 'Enter a valid dollar amount.');
      return;
    }

    try {
      const { error } = await supabase
        .from('price_alerts')
        .insert({
          user_id: session.user.id,
          asset_id: asset.id,
          type: alertType,
          threshold,
        });

      if (error) throw error;
      setShowAlertModal(false);
      setAlertThreshold('');
      Alert.alert('Alert set', "We'll notify you when the price hits your target.");
    } catch (e: any) {
      Alert.alert('Failed to set alert', e.message || 'Please try again.');
    }
  };

  const handleSaveCostBasis = async (value: string) => {
    if (!asset || !session) return;

    const costBasis = parseFloat(value);
    if (Number.isNaN(costBasis) || costBasis < 0) {
      Alert.alert('Invalid amount', 'Enter a valid dollar amount.');
      return;
    }

    try {
      const { error } = await supabase
        .from('assets')
        .update({ purchase_price: costBasis })
        .eq('id', asset.id)
        .eq('owner_id', session.user.id);

      if (error) throw error;

      // Update local state
      setAsset({ ...asset, purchase_price: costBasis });
      setShowCostBasisModal(false);
      Alert.alert('Saved', 'Cost basis updated successfully.');
    } catch (e: any) {
      console.error('Cost basis update error:', e);
      Alert.alert('Failed to update', e.message || 'Please try again.');
    }
  };

  const handleRemove = () => {
    if (!asset || !session) return;

    Alert.alert(
      'Remove from Portfolio',
      `Are you sure you want to remove ${asset.name} from your portfolio?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('assets')
                .delete()
                .eq('id', asset.id)
                .eq('owner_id', session.user.id);

              if (error) throw error;

              router.back();
            } catch (e: any) {
              console.error('Remove failed:', e);
              Alert.alert('Remove failed', e.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!asset) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>Close</Text>
          </Pressable>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Asset not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{asset.name}</Text>
        <Pressable style={styles.moreButton} onPress={() => setShowMoreMenu(true)}>
          <Text style={styles.moreButtonText}>•••</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Row */}
        <View style={styles.heroRow}>
          <View style={styles.heroImage}>
            {asset.image_url && !imageError ? (
              <Image
                source={{ uri: asset.image_url }}
                style={styles.heroImageAsset}
                resizeMode="contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={[styles.heroImageAsset, styles.heroPlaceholder]}>
                <Text style={styles.heroPlaceholderText}>{asset.name.charAt(0)}</Text>
              </View>
            )}
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>{asset.name}</Text>
            {asset.stockx_sku && <Text style={styles.heroMeta}>{asset.stockx_sku}</Text>}
            <View style={styles.statusRow}>
              {statusLabel && (
                <View
                  style={[
                    styles.statusBadge,
                    statusLabel === 'IN BLOOM' && styles.statusBadgeBloom,
                    statusLabel === 'AT HOME' && styles.statusBadgeHome,
                    statusLabel === 'WATCHLIST' && styles.statusBadgeWatchlist,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      statusLabel === 'IN BLOOM' && styles.statusBadgeTextBloom,
                      statusLabel === 'WATCHLIST' && styles.statusBadgeTextWatchlist,
                    ]}
                  >
                    {statusLabel}
                  </Text>
                </View>
              )}
              {pricingUpdatedAt && (
                <Text style={styles.updatedLabel}>Updated {formatTimeAgo(pricingUpdatedAt)}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Price Strip */}
        <View style={styles.priceStrip}>
          <View style={styles.priceMainRow}>
            <Text style={styles.priceValueLarge}>{formatPrice(asset.price)}</Text>
            {hasChange && (
              <View style={[styles.changePill, isPositive ? styles.changeUp : styles.changeDown]}>
                <Text style={styles.changeText}>
                  {formatPriceChange(asset.price_change)} ({formatPercentChange(asset.price_change_percent)})
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.priceSubLabel}>Market price (best)</Text>
          {bestPriceLabel ? (
            <Text style={styles.bestPriceLabel}>{bestPriceLabel}</Text>
          ) : null}
        </View>

        {/* Price Chart */}
        <PriceChart
          data={priceHistory}
          ranges={PRICE_RANGES}
          selectedRange={selectedRange}
          onRangeChange={setSelectedRange}
        />

        <StatsRow stats={statsItems} />

        {/* Owned Position */}
        {isOwned && (
          <OwnedPosition
            costBasis={asset.purchase_price}
            pnlDollars={asset.purchase_price ? asset.price - asset.purchase_price : null}
            pnlPercent={asset.purchase_price ? ((asset.price - asset.purchase_price) / asset.purchase_price) * 100 : null}
            formatPrice={formatPrice}
            onEditCostBasis={() => setShowCostBasisModal(true)}
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
              <View key={row.id} style={styles.marketRow}>
                <Text style={styles.marketName}>{row.name}</Text>
                <Text style={styles.marketPrice}>{formatPrice(row.price)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.sectionBody}>Marketplace breakdown coming soon.</Text>
          )}
        </View>

        {/* Size & Location Info */}
        <View style={styles.infoRow}>
          <Text style={styles.infoText}>
            Size {hasFixedSize ? asset.size : selectedSize || '—'}
            {isOwned && ` · ${asset.location === 'bloom' ? 'Bloom Custody' : asset.location === 'watchlist' ? 'Watchlist' : 'Home'}`}
          </Text>
        </View>

        {/* Size Selector */}
        {!isOwned && !hasFixedSize && (
          <View style={styles.sizeSection}>
            <View style={styles.sizeGrid}>
              {AVAILABLE_SIZES.map((size) => (
                <Pressable
                  key={size}
                  style={[
                    styles.sizeButton,
                    selectedSize === size && styles.sizeButtonSelected,
                  ]}
                  onPress={() => handleSizeSelect(size)}
                >
                  <Text
                    style={[
                      styles.sizeButtonText,
                      selectedSize === size && styles.sizeButtonTextSelected,
                    ]}
                  >
                    {size}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.sectionBody}>
            {asset.description || 'Price tracking active.'}
          </Text>
        </View>

        {/* Facts Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Facts</Text>
          <View style={styles.factsGrid}>
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Style Code</Text>
              <Text style={styles.factValue}>
                {catalogDetails?.style_code || asset.stockx_sku || '—'}
              </Text>
            </View>
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Size</Text>
              <Text style={styles.factValue}>{hasFixedSize ? asset.size : selectedSize || '—'}</Text>
            </View>
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Brand</Text>
              <Text style={styles.factValue}>{catalogDetails?.brand || asset.brand || '—'}</Text>
            </View>
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Colorway</Text>
              <Text style={styles.factValue}>{catalogDetails?.colorway_name || '—'}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Action Button */}
      {!isOwned && isAvailable && (
        <View style={styles.actionContainer}>
          <Pressable
            style={[
              styles.actionButton,
              (purchasing || !canBuy) && styles.actionButtonDisabled
            ]}
            onPress={() => setShowBuyIntent(true)}
            disabled={purchasing || !canBuy}
          >
            <Text
              style={[
                styles.actionButtonText,
                (purchasing || !canBuy) && styles.actionButtonTextDisabled
              ]}
            >
              {purchasing ? 'Processing...' : !canBuy ? 'Select Size' : 'Buy'}
            </Text>
          </Pressable>
          {isStale && (
            <Text style={styles.staleNote}>Bloom price updating · Ship to me still available</Text>
          )}
        </View>
      )}

      {!isOwned && !isAvailable && (
        <View style={styles.actionContainer}>
          <Pressable
            style={[styles.actionButton, !canBuy && styles.actionButtonDisabled]}
            onPress={() => {
              setMarketplaceLane('a');
              setShowHomeBuyOptions(true);
            }}
            disabled={!canBuy}
          >
            <Text style={[styles.actionButtonText, !canBuy && styles.actionButtonTextDisabled]}>
              {!canBuy ? 'Select Size' : 'Choose marketplace'}
            </Text>
          </Pressable>
          <Text style={styles.unavailableNote}>No Bloom inventory yet</Text>
        </View>
      )}

      {isOwned && (
        <View style={styles.actionContainer}>
          <View style={styles.ownedBadge}>
            <Text style={styles.ownedText}>You own this asset</Text>
          </View>
        </View>
      )}

      {/* Buy Intent Modal */}
      <Modal
        visible={showBuyIntent}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBuyIntent(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBuyIntent(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Buy</Text>
            <Text style={styles.intentSubtitle}>Choose how you want to own it</Text>

            {isStale && (
              <View style={styles.intentNotice}>
                <Text style={styles.intentNoticeText}>Bloom pricing is updating. Ship to me is still available.</Text>
              </View>
            )}

            <Pressable
              style={styles.intentOption}
              onPress={() => {
                setMarketplaceLane('a');
                setShowBuyIntent(false);
                setShowHomeBuyOptions(true);
              }}
            >
              <Text style={styles.intentOptionTitle}>Ship to me</Text>
              <Text style={styles.intentOptionDesc}>Bloom executes the best marketplace</Text>
            </Pressable>

            <Pressable
              style={[
                styles.intentOption,
                styles.intentOptionPrimary,
                (!canBuy || isStale) && styles.intentOptionDisabled,
              ]}
              onPress={() => {
                if (!canBuy) {
                  Alert.alert('Select Size', 'Choose a size to continue.');
                  return;
                }
                if (isStale) {
                  Alert.alert('Price Updating', 'Bloom pricing is updating. Try again shortly.');
                  return;
                }
                setMarketplaceLane('b');
                setShowBuyIntent(false);
                setShowHomeBuyOptions(true);
              }}
            >
              <Text style={styles.intentOptionTitle}>Ship to Bloom</Text>
              <Text style={styles.intentOptionDesc}>Bloom custody, verified on arrival</Text>
            </Pressable>

            <Pressable
              style={[
                styles.intentOption,
                styles.intentOptionSecondary,
                (!canBuy || isStale || (!matchingListing && asset?.custody_status !== 'in_vault')) && styles.intentOptionDisabled,
              ]}
              onPress={() => {
                if (!canBuy) {
                  Alert.alert('Select Size', 'Choose a size to continue.');
                  return;
                }
                if (isStale) {
                  Alert.alert('Price Updating', 'Bloom pricing is updating. Try again shortly.');
                  return;
                }
                if (asset?.custody_status === 'in_vault') {
                  setShowBuyIntent(false);
                  handlePurchase({ marketplace: 'bloom', lane: 'b' });
                  return;
                }
                if (matchingListing) {
                  setShowBuyIntent(false);
                  router.push({ pathname: '/exchange/buy', params: { listing_id: matchingListing.id } });
                  return;
                }
                Alert.alert('No instant inventory', 'No Bloom custody listing is available for this size yet.');
              }}
            >
              <View style={styles.intentOptionRow}>
                <Text style={styles.intentOptionTitle}>Instant Transfer</Text>
                {matchingListingLoading && <ActivityIndicator size="small" color={theme.textPrimary} />}
              </View>
              <Text style={styles.intentOptionDesc}>
                {asset?.custody_status === 'in_vault'
                  ? 'Already in Bloom custody'
                  : matchingListing
                  ? `From ${formatPrice(matchingListing.listing_price)} in Bloom custody`
                  : 'Bloom custody only'}
              </Text>
            </Pressable>

            <Pressable style={styles.modalCancel} onPress={() => setShowBuyIntent(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Marketplace Selection Modal */}
      <Modal
        visible={showHomeBuyOptions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHomeBuyOptions(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowHomeBuyOptions(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose Marketplace</Text>
            <Text style={styles.intentSubtitle}>Bloom executes this purchase for you</Text>

            <View style={styles.intentCard}>
              <Text style={styles.intentOptionTitle}>Your selection</Text>
              <Text style={styles.intentOptionDesc}>
                {asset.name} · {hasFixedSize ? asset.size : selectedSize || 'Size —'}
              </Text>
              <Text style={styles.intentOptionDesc}>
                {marketplaceLane === 'a' ? 'Ship to me' : 'Ship to Bloom'}
              </Text>
            </View>

            {marketplaceRows.length > 0 ? (
              marketplaceRows.map((marketplace) => (
                <Pressable
                  key={marketplace.id}
                  style={styles.routeOption}
                  onPress={() => {
                    setShowHomeBuyOptions(false);
                    handleMarketplaceCheckout(marketplace.id);
                  }}
                >
                  <Text style={styles.routeOptionTitle}>{marketplace.name}</Text>
                  <Text style={styles.routeOptionDesc}>Buy at {formatPrice(marketplace.price)}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.sectionBody}>Updating prices...</Text>
            )}

            <Pressable style={styles.modalCancel} onPress={() => setShowHomeBuyOptions(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
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
            {isOwned && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setShowMoreMenu(false);
                  handleSell();
                }}
              >
                <Text style={styles.menuItemText}>{selling ? 'Listing...' : 'Sell'}</Text>
              </Pressable>
            )}
            {isOwned && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setShowMoreMenu(false);
                  setShowAlertModal(true);
                }}
              >
                <Text style={styles.menuItemText}>Set price alert</Text>
              </Pressable>
            )}
            {isOwned && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setShowMoreMenu(false);
                  handleRemove();
                }}
              >
                <Text style={[styles.menuItemText, styles.menuItemTextDestructive]}>Remove from Portfolio</Text>
              </Pressable>
            )}
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
        <Pressable style={styles.modalOverlay} onPress={() => setShowAlertModal(false)}>
          <View style={styles.modalContent}>
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

      {/* Cost Basis Editor */}
      <CostBasisEditor
        visible={showCostBasisModal}
        initialValue={asset?.purchase_price ?? null}
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
  backText: {
    fontSize: 16,
    color: theme.accent,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: theme.textPrimary,
    flex: 1,
    textAlign: 'center',
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
  // Hero layout styles
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
  heroPlaceholder: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: theme.accent,
  },
  heroInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  heroName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  heroMeta: {
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
  statusBadgeWatchlist: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3B82F6',
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
  statusBadgeTextWatchlist: {
    color: '#3B82F6',
  },
  updatedLabel: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  // Price strip styles
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
  priceValueLarge: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: theme.textPrimary,
    letterSpacing: -1,
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
  // Section styles
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
  // Facts grid styles
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
  assetImage: {
    width: '100%',
    aspectRatio: 1.4,
    backgroundColor: '#FFF',
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 64,
    color: theme.accent,
  },
  infoRow: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 15,
    color: theme.textSecondary,
  },
  sizeSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sizeButton: {
    width: '22%',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  sizeButtonSelected: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  sizeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  sizeButtonTextSelected: {
    color: theme.textInverse,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  actionButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: theme.card,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
  actionButtonTextDisabled: {
    color: theme.textSecondary,
  },
  ownedBadge: {
    backgroundColor: theme.successBg,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  ownedText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.success,
  },
  unavailableNote: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  staleBadge: {
    backgroundColor: theme.warningBg,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  staleText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.warning,
  },
  staleSubtext: {
    fontSize: 13,
    color: theme.warning,
    opacity: 0.8,
    marginTop: 4,
  },
  staleNote: {
    fontSize: 12,
    color: theme.warning,
    textAlign: 'center',
    marginTop: 10,
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
  menuItem: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  menuItemTextDestructive: {
    color: theme.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  intentSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  intentNotice: {
    backgroundColor: theme.warningBg,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  intentNoticeText: {
    fontSize: 12,
    color: theme.warning,
    textAlign: 'center',
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
  intentOptionDisabled: {
    opacity: 0.5,
  },
  intentOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  intentOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  intentOptionDesc: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  intentCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 12,
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
  modalButton: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textInverse,
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
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
});
