// HOME Screen - Portfolio View (Coinbase Style with Zen Dots)
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';

interface Asset {
  id: string;
  name: string;
  image_url: string | null;
  size: string | null;
  category: string | null;
  stockx_sku: string | null;
  current_price: number;
  entry_price: number | null;
  pnl_dollars: number | null;
  pnl_percent: number | null;
  last_price_update: string | null;
}

interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_pnl_dollars: number | null;
  total_pnl_percent: number | null;
  asset_count: number;
}

interface PriceHistory {
  price: number;
  created_at: string;
}

export default function HomeScreen() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [ownedAssets, setOwnedAssets] = useState<Asset[]>([]);
  const [priceHistories, setPriceHistories] = useState<Record<string, PriceHistory[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const handleImageError = (assetId: string) => {
    setFailedImages(prev => new Set(prev).add(assetId));
  };

  const fetchPortfolio = useCallback(async () => {
    if (!session) return;

    try {
      // Fetch portfolio summary with P&L
      const { data: summaryData, error: summaryError } = await supabase.rpc('get_portfolio_summary');
      if (!summaryError && summaryData && summaryData.length > 0) {
        setSummary(summaryData[0]);
      }

      // Fetch assets with P&L
      const { data: assets, error: assetsError } = await supabase.rpc('get_portfolio_with_pnl');
      if (!assetsError && assets) {
        setOwnedAssets(assets);

        // Fetch price history for sparklines
        const histories: Record<string, PriceHistory[]> = {};
        for (const asset of assets) {
          const { data: history } = await supabase.rpc('get_price_history', {
            p_asset_id: asset.id,
            p_days: 7,
          });
          if (history) {
            histories[asset.id] = history;
          }
        }
        setPriceHistories(histories);
      }
    } catch (e) {
      console.error('Error fetching portfolio:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchPortfolio();
    }, [fetchPortfolio])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPortfolio();
  }, [fetchPortfolio]);

  const handleRefreshPrices = async () => {
    if (updatingPrices) return;

    try {
      setUpdatingPrices(true);

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/update-prices/all`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (response.ok) {
        Alert.alert('Prices Updated', `Updated ${result.successful} of ${result.total} assets`);
        fetchPortfolio();
      } else {
        Alert.alert('Update Failed', result.error || 'Could not update prices');
      }
    } catch (e) {
      console.error('Error updating prices:', e);
      Alert.alert('Error', 'Failed to update prices');
    } finally {
      setUpdatingPrices(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
  };

  const formatPnL = (value: number | null) => {
    if (value === null) return '--';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${formatPrice(value)}`;
  };

  const formatPnLPercent = (value: number | null) => {
    if (value === null) return '';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  // Simple text-based sparkline using unicode block characters
  const renderSparkline = (assetId: string) => {
    const history = priceHistories[assetId];
    if (!history || history.length < 2) return null;

    const prices = history.map(h => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

    const sparkline = prices.map(price => {
      const normalized = (price - min) / range;
      const index = Math.min(Math.floor(normalized * blocks.length), blocks.length - 1);
      return blocks[index];
    }).join('');

    const isUp = prices[prices.length - 1] >= prices[0];

    return (
      <Text style={[styles.sparkline, isUp ? styles.sparklineUp : styles.sparklineDown]}>
        {sparkline}
      </Text>
    );
  };

  const renderAssetCard = ({ item }: { item: Asset }) => {
    const isPositive = item.pnl_dollars !== null && item.pnl_dollars >= 0;
    const pnlColor = item.pnl_dollars === null ? theme.textSecondary : isPositive ? theme.success : theme.error;
    const showImage = item.image_url && !failedImages.has(item.id);

    return (
      <Pressable style={styles.assetCard} onPress={() => router.push(`/asset/${item.id}`)}>
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
          {item.size && <Text style={styles.cardSize}>Size {item.size}</Text>}

          <View style={styles.priceRow}>
            <View>
              <Text style={styles.cardPrice}>{formatPrice(item.current_price)}</Text>
              <Text style={[styles.cardPnl, { color: pnlColor }]}>
                {formatPnL(item.pnl_dollars)} {formatPnLPercent(item.pnl_percent)}
              </Text>
            </View>

            <View style={styles.sparklineContainer}>
              {renderSparkline(item.id)}
            </View>
          </View>
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
      <Pressable style={styles.emptyButton} onPress={() => router.push('/(tabs)/bloom')}>
        <Text style={styles.emptyButtonText}>Browse assets</Text>
      </Pressable>
    </View>
  );

  const totalPnlColor = summary?.total_pnl_dollars === null || summary?.total_pnl_dollars === undefined
    ? theme.textSecondary
    : summary.total_pnl_dollars >= 0 ? theme.success : theme.error;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Portfolio</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.refreshButton}
            onPress={handleRefreshPrices}
            disabled={updatingPrices}
          >
            {updatingPrices ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Text style={styles.refreshIcon}>↻</Text>
            )}
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

      {/* Portfolio Value */}
      <View style={styles.valueSection}>
        <Text style={styles.valueLabel}>Total balance</Text>
        <Text style={styles.valueAmount}>{formatPrice(summary?.total_value || 0)}</Text>

        {summary?.total_pnl_dollars !== null && summary?.total_pnl_dollars !== undefined && (
          <View style={styles.totalPnlRow}>
            <Text style={[styles.totalPnl, { color: totalPnlColor }]}>
              {formatPnL(summary.total_pnl_dollars)}
            </Text>
            <Text style={[styles.totalPnlPercent, { color: totalPnlColor }]}>
              {formatPnLPercent(summary.total_pnl_percent)}
            </Text>
          </View>
        )}
      </View>

      {/* Assets Section */}
      <View style={styles.assetsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your assets</Text>
          <Text style={styles.assetCount}>{summary?.asset_count || 0}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : ownedAssets.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={ownedAssets}
            renderItem={renderAssetCard}
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
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: theme.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refreshButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: {
    fontSize: 22,
    color: theme.accent,
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
  valueSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  valueLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  valueAmount: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: theme.textPrimary,
    letterSpacing: -1,
  },
  totalPnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  totalPnl: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalPnlPercent: {
    fontSize: 14,
    fontWeight: '500',
  },
  assetsSection: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: theme.textPrimary,
  },
  assetCount: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  gridContent: {
    paddingHorizontal: 12,
    paddingBottom: 100,
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
  },
  cardImageContainer: {
    backgroundColor: '#FFF',
    padding: 8,
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
  cardName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
    lineHeight: 16,
  },
  cardSize: {
    fontSize: 11,
    color: theme.textSecondary,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.accent,
  },
  cardPnl: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  sparklineContainer: {
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  sparkline: {
    fontSize: 10,
    letterSpacing: -1,
  },
  sparklineUp: {
    color: theme.success,
  },
  sparklineDown: {
    color: theme.error,
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
});
