// BLOOM Screen - Marketplace (Coinbase Style with Price Changes)
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';

interface Asset {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  owner_id: string | null;
  status: string;
  size: string | null;
  category: string | null;
  brand: string | null;
  last_price_update: string | null;
  price_change: number | null;
  price_change_percent: number | null;
}

export default function BloomScreen() {
  const { session } = useAuth();
  const [marketAssets, setMarketAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const handleImageError = (assetId: string) => {
    setFailedImages(prev => new Set(prev).add(assetId));
  };

  const fetchMarketAssets = useCallback(async () => {
    if (!session) return;

    try {
      // Use RPC function to get assets with price changes
      const { data: assets, error } = await supabase.rpc('get_market_assets_with_changes');

      if (!error && assets) {
        setMarketAssets(assets);
      } else {
        // Fallback to direct query if RPC fails
        const { data: fallbackAssets } = await supabase
          .from('assets')
          .select('*')
          .or('status.eq.listed,owner_id.is.null')
          .order('created_at', { ascending: false });

        if (fallbackAssets) {
          setMarketAssets(fallbackAssets.map(a => ({
            ...a,
            price_change: null,
            price_change_percent: null,
          })));
        }
      }
    } catch (e) {
      console.error('Error fetching market assets:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchMarketAssets();
    }, [fetchMarketAssets])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMarketAssets();
  }, [fetchMarketAssets]);

  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return marketAssets;
    const query = searchQuery.toLowerCase();
    return marketAssets.filter(
      (asset) =>
        asset.name.toLowerCase().includes(query) ||
        asset.category?.toLowerCase().includes(query) ||
        asset.brand?.toLowerCase().includes(query)
    );
  }, [marketAssets, searchQuery]);

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
    return `${sign}${percent.toFixed(1)}%`;
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

  const renderAssetCard = ({ item }: { item: Asset }) => {
    const showImage = item.image_url && !failedImages.has(item.id);
    const hasChange = item.price_change !== null && item.price_change !== 0;
    const isPositive = (item.price_change || 0) >= 0;
    const changeColor = hasChange ? (isPositive ? theme.success : theme.error) : theme.textSecondary;

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
              <Text style={styles.placeholderText}>{item.brand?.charAt(0) || item.name.charAt(0)}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          {item.size && <Text style={styles.cardSize}>Size {item.size}</Text>}

          <View style={styles.priceRow}>
            <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
            {hasChange && (
              <View style={styles.changeContainer}>
                <Text style={[styles.changeArrow, { color: changeColor }]}>
                  {isPositive ? '▲' : '▼'}
                </Text>
              </View>
            )}
          </View>

          {hasChange && (
            <View style={styles.changeRow}>
              <Text style={[styles.changeText, { color: changeColor }]}>
                {formatPriceChange(item.price_change)} ({formatPercentChange(item.price_change_percent)})
              </Text>
            </View>
          )}

          {item.last_price_update && (
            <Text style={styles.updateTime}>
              {formatTimeAgo(item.last_price_update)}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>
        {searchQuery ? 'No results found' : 'No assets available'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery ? 'Try a different search term' : 'Check back later for new listings'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={theme.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Text style={styles.clearButton}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Assets Section */}
      <View style={styles.assetsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All assets</Text>
          <Text style={styles.assetCount}>{filteredAssets.length}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : filteredAssets.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={filteredAssets}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: theme.textPrimary,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchIcon: {
    fontSize: 18,
    color: theme.textTertiary,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 17,
    color: theme.textPrimary,
  },
  clearButton: {
    fontSize: 14,
    color: theme.textTertiary,
    padding: 4,
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
    marginBottom: 16,
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.accent,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeArrow: {
    fontSize: 10,
    fontWeight: '700',
  },
  changeRow: {
    marginTop: 2,
  },
  changeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  updateTime: {
    fontSize: 9,
    color: theme.textTertiary,
    marginTop: 4,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
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
  },
});
