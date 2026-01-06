// HOME Screen - Portfolio View (Coinbase Style with Zen Dots)
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fonts, theme } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';

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
  custody_type: 'bloom'; // All tokens are Bloom custody
  is_exchange_eligible: boolean;
  current_value: number;
  pnl_dollars: number | null;
  pnl_percent: number | null;
  status: 'acquiring' | 'in_custody' | 'listed' | 'redeeming' | 'shipped' | 'redeemed';
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
}

// Legacy asset interface (for backwards compatibility)
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


export default function HomeScreen() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [tokenSummary, setTokenSummary] = useState<TokenPortfolioSummary | null>(null);
  const [ownedAssets, setOwnedAssets] = useState<Asset[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const handleImageError = (assetId: string) => {
    setFailedImages(prev => new Set(prev).add(assetId));
  };

  const fetchPortfolio = useCallback(async () => {
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
      default:
        return { label: '', color: theme.textSecondary, icon: '' };
    }
  };

  // Render token card - minimal design with status badge
  const renderTokenCard = ({ item }: { item: Token }) => {
    const showImage = item.product_image_url && !failedImages.has(item.id);
    const statusConfig = getStatusConfig(item.status);
    const showStatusBadge = item.status !== 'in_custody'; // Only show badge for non-ready states

    return (
      <Pressable style={styles.assetCard} onPress={() => router.push(`/token/${item.id}`)}>
        <View style={styles.cardImageContainer}>
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

        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{item.product_name}</Text>
          <View style={styles.cardMetaRow}>
            <Text style={styles.cardMeta}>
              Size {item.size} · {formatPrice(item.current_value)}
            </Text>
            {item.status === 'in_custody' && (
              <Text style={[styles.statusDot, { color: theme.success }]}>●</Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  // Legacy: Render asset card - minimal design
  const renderAssetCard = ({ item }: { item: Asset }) => {
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
          <Text style={styles.cardMeta}>
            Size {item.size} · {formatPrice(item.current_price)}
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
      <Pressable style={styles.emptyButton} onPress={() => router.push('/(tabs)/exchange')}>
        <Text style={styles.emptyButtonText}>Browse assets</Text>
      </Pressable>
    </View>
  );

  // Calculate combined totals (tokens + legacy assets)
  const combinedTotalValue = (tokenSummary?.total_value || 0) + (summary?.total_value || 0);
  const combinedTotalPnl = (tokenSummary?.total_pnl_dollars || 0) + (summary?.total_pnl_dollars || 0);
  const hasItems = tokens.length > 0 || ownedAssets.length > 0;

  const totalPnlColor = combinedTotalPnl === 0
    ? theme.textSecondary
    : combinedTotalPnl >= 0 ? theme.success : theme.error;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, styles.headerTitleAccent]}>Bloom</Text>
        <View style={styles.headerRight}>
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
        <Text style={styles.valueAmount}>{formatPrice(combinedTotalValue)}</Text>
        {hasItems && (
          <Text style={[styles.totalPnl, { color: totalPnlColor }]}>
            {formatPnL(combinedTotalPnl)} today
          </Text>
        )}
      </View>

      {/* Assets */}
      <View style={styles.assetsSection}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : !hasItems ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={[...tokens, ...ownedAssets] as any[]}
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
  headerTitleAccent: {
    color: theme.accent,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  valueAmount: {
    fontFamily: fonts.heading,
    fontSize: 40,
    color: theme.textPrimary,
    letterSpacing: -1,
  },
  totalPnl: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
  },
  assetsSection: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
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
    borderColor: 'rgba(255, 215, 181, 0.25)',
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
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
    lineHeight: 17,
  },
  cardMeta: {
    fontSize: 12,
    color: theme.textSecondary,
    flex: 1,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusDot: {
    fontSize: 10,
    marginLeft: 4,
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
