// Asset Detail Screen (Coinbase Style with Price Chart)
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';
import CostBasisEditor from '../../components/CostBasisEditor';
import PositionCard from '../../components/PositionCard';
import PriceChart, { RangeOption } from '../../components/PriceChart';

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

interface PricePoint {
  price: number;
  recorded_at: string;
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
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [sellTriggered, setSellTriggered] = useState(false);
  const [showBuyIntent, setShowBuyIntent] = useState(false);
  const [showHomeBuyOptions, setShowHomeBuyOptions] = useState(false);
  const [matchingListing, setMatchingListing] = useState<ExchangeListing | null>(null);
  const [matchingListingLoading, setMatchingListingLoading] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertType, setAlertType] = useState<'above' | 'below'>('above');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [showCostBasisModal, setShowCostBasisModal] = useState(false);
  const [selectedRange, setSelectedRange] = useState<RangeOption>(PRICE_RANGES[0]);

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

        } catch (e) {
        console.error('Error fetching asset:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchAsset();
  }, [id]);

  // Fetch price history based on selected range
  useEffect(() => {
    const fetchPriceHistory = async () => {
      if (!id) return;
      const days = selectedRange.days === 'all' ? 3650 : selectedRange.days;
      const { data: historyData } = await supabase.rpc('get_price_history_for_chart', {
        p_asset_id: id,
        p_days: days,
      });
      if (historyData) {
        setPriceHistory(historyData);
      }
    };
    fetchPriceHistory();
  }, [id, selectedRange]);

  // Calculate day change from price history
  const dayChange = useMemo(() => {
    if (priceHistory.length < 2) return { delta: null, percent: null };
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = priceHistory.filter((p) => new Date(p.recorded_at).getTime() >= cutoff);
    if (recent.length < 2) return { delta: null, percent: null };
    const first = recent[0]?.price ?? 0;
    const last = recent[recent.length - 1]?.price ?? 0;
    const delta = last - first;
    const percent = first > 0 ? (delta / first) * 100 : null;
    return { delta, percent };
  }, [priceHistory]);

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
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

  const buildSearchQuery = () => {
    if (!asset) return '';
    const size = hasFixedSize ? asset.size : selectedSize;
    if (asset.stockx_sku) {
      return size ? `${asset.stockx_sku} ${size}` : asset.stockx_sku;
    }
    if (size) return `${asset.name} ${size}`;
    return asset.name;
  };

  const buildMarketplaceUrl = (marketplace: string) => {
    const query = encodeURIComponent(buildSearchQuery());
    switch (marketplace) {
      case 'stockx':
        return `https://stockx.com/search?s=${query}`;
      case 'goat':
        return `https://www.goat.com/search?query=${query}`;
      case 'ebay':
        return `https://www.ebay.com/sch/i.html?_nkw=${query}`;
      default:
        return `https://www.google.com/search?q=${query}`;
    }
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

  const handlePurchase = () => {
    if (!asset || !session) return;

    if (!hasFixedSize && !selectedSize) {
      Alert.alert('Select Size', 'Please select a size before purchasing.');
      return;
    }

    const size = hasFixedSize ? asset.size! : selectedSize!;

    // Navigate directly to confirm-order (ownership-first model)
    router.push({
      pathname: '/checkout/confirm-order',
      params: {
        asset_id: asset.id,
        asset_name: asset.name,
        asset_image: asset.image_url || '',
        size: size,
        price: asset.price.toString(),
        custody_status: asset.custody_status || 'available_to_acquire',
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
        .eq('id', asset.id);

      if (error) throw error;
      setShowCostBasisModal(false);
      // Update local state
      setAsset({ ...asset, purchase_price: costBasis });
      Alert.alert('Cost basis updated', 'Your P&L will now reflect this purchase price.');
    } catch (e: any) {
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
              <View
                style={[
                  styles.statusBadge,
                  isOwned && asset.location === 'bloom' && styles.statusBadgeBloom,
                  isOwned && asset.location === 'home' && styles.statusBadgeHome,
                  isOwned && asset.location === 'watchlist' && styles.statusBadgeWatchlist,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    isOwned && asset.location === 'bloom' && styles.statusBadgeTextBloom,
                    isOwned && asset.location === 'watchlist' && styles.statusBadgeTextWatchlist,
                  ]}
                >
                  {isOwned
                    ? asset.location === 'bloom'
                      ? 'IN BLOOM'
                      : asset.location === 'watchlist'
                        ? 'WATCHLIST'
                        : 'AT HOME'
                    : asset.custody_status === 'in_vault'
                      ? 'INSTANT'
                      : 'AVAILABLE'}
                </Text>
              </View>
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
        </View>

        {/* Price Chart */}
        <PriceChart
          data={priceHistory}
          ranges={PRICE_RANGES}
          selectedRange={selectedRange}
          onRangeChange={setSelectedRange}
        />

        {/* Position Card for owned assets */}
        {isOwned && (
          <PositionCard
            marketValue={asset.price}
            costBasis={asset.purchase_price}
            pnlDollars={asset.purchase_price ? asset.price - asset.purchase_price : null}
            pnlPercent={asset.purchase_price ? ((asset.price - asset.purchase_price) / asset.purchase_price) * 100 : null}
            dayChangeDollars={dayChange.delta}
            dayChangePercent={dayChange.percent}
            formatPrice={formatPrice}
            onEditCostBasis={() => setShowCostBasisModal(true)}
          />
        )}

        {/* Size & Location/Delivery Info */}
        <View style={styles.infoRow}>
          <Text style={styles.infoText}>
            Size {hasFixedSize ? asset.size : selectedSize || '—'} · {
              isOwned
                ? (asset.location === 'bloom' ? 'Bloom Custody' : asset.location === 'watchlist' ? 'Watchlist' : 'Home')
                : (asset.custody_status === 'in_vault' ? 'Instant transfer' : 'Ships to Bloom')
            }
          </Text>
        </View>

        {/* Size Selector */}
        {!isOwned && isAvailable && !hasFixedSize && (
          <View style={styles.sizeSection}>
            <View style={styles.sizeGrid}>
              {AVAILABLE_SIZES.map((size) => (
                <Pressable
                  key={size}
                  style={[
                    styles.sizeButton,
                    selectedSize === size && styles.sizeButtonSelected,
                  ]}
                  onPress={() => setSelectedSize(size)}
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

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.sectionBody}>
            {asset.description || 'No description available yet.'}
          </Text>
        </View>

        {/* Facts Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Facts</Text>
          <View style={styles.factsGrid}>
            {asset.category && (
              <View style={styles.factCell}>
                <Text style={styles.factLabel}>Category</Text>
                <Text style={styles.factValue}>{asset.category}</Text>
              </View>
            )}
            {asset.stockx_sku && (
              <View style={styles.factCell}>
                <Text style={styles.factLabel}>Style Code</Text>
                <Text style={styles.factValue}>{asset.stockx_sku}</Text>
              </View>
            )}
            {(hasFixedSize || selectedSize) && (
              <View style={styles.factCell}>
                <Text style={styles.factLabel}>Size</Text>
                <Text style={styles.factValue}>{hasFixedSize ? asset.size : selectedSize}</Text>
              </View>
            )}
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Location</Text>
              <Text style={styles.factValue}>
                {isOwned
                  ? asset.location === 'bloom'
                    ? 'Bloom Custody'
                    : asset.location === 'watchlist'
                      ? 'Watchlist'
                      : 'At Home'
                  : asset.custody_status === 'in_vault'
                    ? 'Bloom Vault'
                    : 'Available'}
              </Text>
            </View>
            <View style={styles.factCell}>
              <Text style={styles.factLabel}>Asset ID</Text>
              <Text style={styles.factValue}>{asset.id}</Text>
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
            <Text style={styles.staleNote}>Bloom price updating · Route Home still available</Text>
          )}
        </View>
      )}

      {!isOwned && !isAvailable && (
        <View style={styles.actionContainer}>
          <View style={styles.unavailableBadge}>
            <Text style={styles.unavailableText}>Currently Unavailable</Text>
          </View>
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
                <Text style={styles.intentNoticeText}>Bloom pricing is updating. Route Home is still available.</Text>
              </View>
            )}

            <Pressable
              style={styles.intentOption}
              onPress={() => {
                setShowBuyIntent(false);
                setShowHomeBuyOptions(true);
              }}
            >
              <Text style={styles.intentOptionTitle}>Route Home</Text>
              <Text style={styles.intentOptionDesc}>Best all-in price across marketplaces</Text>
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
                setShowBuyIntent(false);
                handlePurchase();
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
                  handlePurchase();
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

      {/* Route Home Modal */}
      <Modal
        visible={showHomeBuyOptions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHomeBuyOptions(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowHomeBuyOptions(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Route Home</Text>
            <Text style={styles.intentSubtitle}>We send you to the best marketplace</Text>

            <View style={styles.intentCard}>
              <Text style={styles.intentOptionTitle}>Your selection</Text>
              <Text style={styles.intentOptionDesc}>
                {asset.name} · {hasFixedSize ? asset.size : selectedSize || 'Size —'}
              </Text>
            </View>

            {['stockx', 'goat', 'ebay'].map((marketplace) => (
              <Pressable
                key={marketplace}
                style={styles.routeOption}
                onPress={() => {
                  Linking.openURL(buildMarketplaceUrl(marketplace));
                  setShowHomeBuyOptions(false);
                }}
              >
                <Text style={styles.routeOptionTitle}>{marketplace.toUpperCase()}</Text>
                <Text style={styles.routeOptionDesc}>Open search and checkout</Text>
              </Pressable>
            ))}

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
  unavailableBadge: {
    backgroundColor: theme.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  unavailableText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
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
