// Asset Detail Screen (Coinbase Style with Price Chart)
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Available shoe sizes
const AVAILABLE_SIZES = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'];

// Staleness threshold (4 hours in minutes)
const STALE_MINUTES = 240;

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
  last_price_update: string | null;
  price_24h_ago: number | null;
  price_change: number | null;
  price_change_percent: number | null;
}

interface PricePoint {
  price: number;
  recorded_at: string;
}

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

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

        // Fetch price history for chart
        const { data: historyData } = await supabase
          .rpc('get_price_history_for_chart', { p_asset_id: id, p_days: 7 });

        if (historyData) {
          setPriceHistory(historyData);
        }
      } catch (e) {
        console.error('Error fetching asset:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchAsset();
  }, [id]);

  const formatPrice = (price: number) => {
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

  // Simple SVG-like line chart using View components
  const renderPriceChart = () => {
    if (priceHistory.length < 2) return null;

    const prices = priceHistory.map(p => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const chartWidth = SCREEN_WIDTH - 32;
    const chartHeight = 80;
    const isUp = prices[prices.length - 1] >= prices[0];
    const lineColor = isUp ? theme.success : theme.error;

    // Create points for the chart
    const points = prices.map((price, index) => ({
      x: (index / (prices.length - 1)) * chartWidth,
      y: chartHeight - ((price - min) / range) * chartHeight,
    }));

    return (
      <View style={styles.chartContainer}>
        <View style={[styles.chart, { width: chartWidth, height: chartHeight }]}>
          {/* Render line segments */}
          {points.slice(0, -1).map((point, index) => {
            const nextPoint = points[index + 1];
            const dx = nextPoint.x - point.x;
            const dy = nextPoint.y - point.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            return (
              <View
                key={index}
                style={[
                  styles.chartLine,
                  {
                    width: length,
                    backgroundColor: lineColor,
                    left: point.x,
                    top: point.y,
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: 'left center',
                  },
                ]}
              />
            );
          })}

          {/* Current price dot */}
          <View
            style={[
              styles.chartDot,
              {
                backgroundColor: lineColor,
                left: points[points.length - 1].x - 4,
                top: points[points.length - 1].y - 4,
              },
            ]}
          />
        </View>

        {/* Chart labels */}
        <View style={styles.chartLabels}>
          <Text style={styles.chartLabel}>7d ago</Text>
          <Text style={styles.chartLabel}>Now</Text>
        </View>
      </View>
    );
  };

  const isOwned = asset?.owner_id === session?.user?.id;
  const isAvailable = asset?.status === 'listed' || asset?.owner_id === null;
  const hasFixedSize = asset?.size !== null;
  const hasChange = asset?.price_change !== null && asset?.price_change !== 0;
  const isPositive = (asset?.price_change || 0) >= 0;
  const changeColor = hasChange ? (isPositive ? theme.success : theme.error) : theme.textSecondary;

  // Check if price is stale (older than 4 hours)
  const isStale = !asset?.last_price_update ||
    ((Date.now() - new Date(asset.last_price_update).getTime()) / 60000) > STALE_MINUTES;

  const handlePurchase = async () => {
    if (!asset || !session) return;

    if (!hasFixedSize && !selectedSize) {
      Alert.alert('Select Size', 'Please select a size before purchasing.');
      return;
    }

    const size = hasFixedSize ? asset.size! : selectedSize!;

    Alert.alert(
      'Confirm purchase',
      `Buy ${asset.name} (Size ${size}) for ${formatPrice(asset.price)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue to Payment',
          style: 'default',
          onPress: async () => {
            try {
              setPurchasing(true);

              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-checkout`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    asset_id: asset.id,
                    size: size,
                    success_url: 'https://bloom.app/checkout/success',
                    cancel_url: 'https://bloom.app/checkout/cancel',
                  }),
                }
              );

              const result = await response.json();

              if (!response.ok) {
                throw new Error(result.error || 'Failed to create checkout');
              }

              if (result.url) {
                await Linking.openURL(result.url);

                Alert.alert(
                  'Complete Payment',
                  'A payment page has opened in your browser. Complete the payment to finalize your purchase.',
                  [{ text: 'OK', onPress: () => router.back() }]
                );
              }
            } catch (e: any) {
              console.error('Purchase failed:', e);
              Alert.alert('Purchase failed', e.message || 'Please try again.');
            } finally {
              setPurchasing(false);
            }
          },
        },
      ]
    );
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
                [{ text: 'Browse marketplace', onPress: () => router.replace('/(tabs)/bloom') }]
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
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Image */}
        {asset.image_url && !imageError ? (
          <Image
            source={{ uri: asset.image_url }}
            style={styles.assetImage}
            resizeMode="contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={[styles.assetImage, styles.placeholderImage]}>
            <Text style={styles.placeholderText}>{asset.name.charAt(0)}</Text>
          </View>
        )}

        {/* Price Section with Change */}
        <View style={styles.priceSection}>
          <Text style={styles.priceLabel}>All-in Price</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>{formatPrice(asset.price)}</Text>
            {hasChange && (
              <View style={[styles.changeBadge, { backgroundColor: isPositive ? theme.successBg : theme.errorBg }]}>
                <Text style={[styles.changeArrow, { color: changeColor }]}>
                  {isPositive ? '▲' : '▼'}
                </Text>
                <Text style={[styles.changeBadgeText, { color: changeColor }]}>
                  {formatPercentChange(asset.price_change_percent)}
                </Text>
              </View>
            )}
          </View>

          {hasChange && (
            <Text style={[styles.changeDetail, { color: changeColor }]}>
              {formatPriceChange(asset.price_change)} (24h)
            </Text>
          )}

          <Text style={styles.priceSubtext}>
            Includes 6.3% MI tax, 4.8% processing & $14.95 shipping
          </Text>

          {asset.last_price_update && (
            <Text style={styles.updateTime}>
              Updated {formatTimeAgo(asset.last_price_update)}
            </Text>
          )}
        </View>

        {/* Price Chart */}
        {priceHistory.length >= 2 && (
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>7 Day Price History</Text>
            {renderPriceChart()}
          </View>
        )}

        {/* Size Selector */}
        {!isOwned && isAvailable && !hasFixedSize && (
          <View style={styles.sizeSection}>
            <Text style={styles.sectionTitle}>Select Size</Text>
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

        {/* Details */}
        <View style={styles.detailsSection}>
          {(hasFixedSize || selectedSize) && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Size</Text>
              <Text style={styles.detailValue}>{hasFixedSize ? asset.size : selectedSize}</Text>
            </View>
          )}
          {asset.category && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{asset.category}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <Text style={styles.detailValue}>
              {isOwned ? 'In Your Wallet' : 'Ships to Vault'}
            </Text>
          </View>
        </View>

        {/* How it works */}
        {!isOwned && isAvailable && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How It Works</Text>
            <Text style={styles.sectionText}>
              1. Complete payment at the all-in price{'\n'}
              2. We purchase from StockX and ship to our vault{'\n'}
              3. Your token appears in your wallet once delivered{'\n'}
              4. Trade or redeem anytime
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Button */}
      {!isOwned && isAvailable && (
        <View style={styles.actionContainer}>
          {isStale ? (
            <View style={styles.staleBadge}>
              <Text style={styles.staleText}>Price Updating...</Text>
              <Text style={styles.staleSubtext}>Check back shortly</Text>
            </View>
          ) : (
            <Pressable
              style={[
                styles.actionButton,
                (purchasing || (!hasFixedSize && !selectedSize)) && styles.actionButtonDisabled
              ]}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  (purchasing || (!hasFixedSize && !selectedSize)) && styles.actionButtonTextDisabled
                ]}
              >
                {purchasing ? 'Processing...' : !hasFixedSize && !selectedSize ? 'Select Size to Buy' : 'Buy Now'}
              </Text>
            </Pressable>
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
          <Pressable
            style={[styles.sellButton, selling && styles.sellButtonDisabled]}
            onPress={handleSell}
            disabled={selling}
          >
            <Text style={[styles.sellButtonText, selling && styles.sellButtonTextDisabled]}>
              {selling ? 'Listing...' : 'Sell'}
            </Text>
          </Pressable>
        </View>
      )}
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
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
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
  priceSection: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  priceLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  priceValue: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: theme.textPrimary,
    letterSpacing: -0.5,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  changeArrow: {
    fontSize: 10,
    fontWeight: '700',
  },
  changeBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  changeDetail: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  priceSubtext: {
    fontSize: 12,
    color: theme.textTertiary,
    marginTop: 8,
  },
  updateTime: {
    fontSize: 11,
    color: theme.textTertiary,
    marginTop: 4,
  },
  chartSection: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  chartContainer: {
    marginTop: 12,
  },
  chart: {
    position: 'relative',
  },
  chartLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
  },
  chartDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  chartLabel: {
    fontSize: 11,
    color: theme.textTertiary,
  },
  sizeSection: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
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
  detailsSection: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  detailLabel: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  detailValue: {
    fontSize: 16,
    color: theme.textPrimary,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionText: {
    fontSize: 16,
    color: theme.textPrimary,
    lineHeight: 24,
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
  sellButton: {
    backgroundColor: theme.error,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  sellButtonDisabled: {
    backgroundColor: theme.card,
  },
  sellButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  sellButtonTextDisabled: {
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
