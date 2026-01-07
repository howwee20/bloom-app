// Bloom Custody Market - Instant transfer or Ship to Bloom
// Bloom is the intent router; custody items settle inside Bloom
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

// ============================================
// TYPES
// ============================================

interface ExchangeItem {
  id: string;
  source: 'bloom' | 'user';
  product_name: string;
  size: string | null;
  image_url: string | null;
  price: number;
  is_instant: boolean;
  seller_id: string | null;
  category: string | null;
  brand: string | null;
}

type FilterType = 'all' | 'instant' | 'acquire';

export default function ExchangeScreen() {
  const { session } = useAuth();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();

  // Filter: All / Instant / Ship to Bloom
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Unified inventory
  const [items, setItems] = useState<ExchangeItem[]>([]);

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (filterParam === 'instant' || filterParam === 'acquire' || filterParam === 'all') {
      setFilter(filterParam);
    }
  }, [filterParam]);

  const handleImageError = (id: string) => {
    setFailedImages(prev => new Set(prev).add(id));
  };

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchInventory = useCallback(async () => {
    if (!session) return;

    try {
      // Try unified RPC first
      const { data, error } = await supabase.rpc('get_unified_exchange_inventory');

      if (!error && data) {
        setItems(data);
      } else {
        // Fallback: fetch both sources and merge
        const [assetsRes, listingsRes] = await Promise.all([
          supabase.rpc('get_market_assets_with_changes'),
          supabase.rpc('get_exchange_listings')
        ]);

        const merged: ExchangeItem[] = [
          ...(assetsRes.data || []).map((a: any) => ({
            id: a.id,
            source: 'bloom' as const,
            product_name: a.name,
            size: a.size,
            image_url: a.image_url,
            price: a.price,
            is_instant: a.custody_status === 'in_vault',
            seller_id: null,
            category: a.category,
            brand: a.brand,
          })),
          ...(listingsRes.data || []).map((l: any) => ({
            id: l.id,
            source: 'user' as const,
            product_name: l.product_name,
            size: l.size,
            image_url: l.product_image_url,
            price: l.listing_price,
            is_instant: true, // User listings are always instant
            seller_id: l.seller_id,
            category: null,
            brand: null,
          })),
        ];

        // Sort: instant first, then by price
        merged.sort((a, b) => {
          if (a.is_instant !== b.is_instant) return a.is_instant ? -1 : 1;
          return a.price - b.price;
        });

        setItems(merged);
      }
    } catch (e) {
      console.error('Error fetching inventory:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchInventory();
    }, [fetchInventory])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInventory();
  }, [fetchInventory]);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const filteredItems = useMemo(() => {
    let result = items;

    // Filter by type
    if (filter === 'instant') {
      result = result.filter(item => item.is_instant);
    } else if (filter === 'acquire') {
      result = result.filter(item => !item.is_instant);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        item =>
          item.product_name.toLowerCase().includes(query) ||
          item.category?.toLowerCase().includes(query) ||
          item.brand?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [items, filter, searchQuery]);

  const instantCount = useMemo(() =>
    items.filter(i => i.is_instant).length
  , [items]);

  const acquireCount = useMemo(() =>
    items.filter(i => !i.is_instant).length
  , [items]);

  // ============================================
  // FORMATTERS
  // ============================================

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  // ============================================
  // RENDER: ITEM CARD
  // ============================================

  const renderItemCard = ({ item }: { item: ExchangeItem }) => {
    const showImage = item.image_url && !failedImages.has(item.id);

    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          if (item.source === 'user') {
            // User listing - go to exchange buy flow
            router.push({ pathname: '/exchange/buy', params: { listing_id: item.id } });
          } else {
            // Bloom asset - go to asset detail
            router.push(`/asset/${item.id}`);
          }
        }}
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
              <Text style={styles.placeholderText}>
                {item.brand?.charAt(0) || item.product_name.charAt(0)}
              </Text>
            </View>
          )}
          {/* Badge: Instant or Ship to Bloom */}
          <View style={[styles.badge, item.is_instant ? styles.instantBadge : styles.acquireBadge]}>
            <Text style={[styles.badgeText, item.is_instant ? styles.instantBadgeText : styles.acquireBadgeText]}>
              {item.is_instant ? 'Instant' : 'Ship to Bloom'}
            </Text>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{item.product_name}</Text>
          {item.size && <Text style={styles.cardSize}>Size {item.size}</Text>}
          <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
        </View>
      </Pressable>
    );
  };

  // ============================================
  // RENDER: EMPTY STATE
  // ============================================

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>
        {searchQuery
          ? 'No results found'
          : filter === 'instant'
          ? 'No instant inventory'
          : filter === 'acquire'
          ? 'Nothing to ship to Bloom yet'
          : 'No items available'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery ? 'Try a different search' : 'Check back soon'}
      </Text>
    </View>
  );

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Row */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {filter === 'instant' ? 'Instant Transfer' : filter === 'acquire' ? 'Ship to Bloom' : 'Market'}
        </Text>
        <Pressable
          style={styles.searchButton}
          onPress={() => {
            setSearchOpen(!searchOpen);
            if (searchOpen) setSearchQuery('');
          }}
        >
          <Text style={styles.searchIcon}>{searchOpen ? '✕' : '⌕'}</Text>
        </Pressable>
      </View>

      {/* Search Bar (expandable) */}
      {searchOpen && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        </View>
      )}

      {/* Filter Pills */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All ({items.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterPill, filter === 'instant' && styles.filterPillActive]}
          onPress={() => setFilter('instant')}
        >
          <View style={styles.filterContent}>
            <View style={styles.instantDot} />
            <Text style={[styles.filterText, filter === 'instant' && styles.filterTextActive]}>
              Instant Transfer ({instantCount})
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={[styles.filterPill, filter === 'acquire' && styles.filterPillActive]}
          onPress={() => setFilter('acquire')}
        >
          <Text style={[styles.filterText, filter === 'acquire' && styles.filterTextActive]}>
            Ship to Bloom ({acquireCount})
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderItemCard}
          keyExtractor={(item) => `${item.source}-${item.id}`}
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
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    fontSize: 20,
    color: theme.textPrimary,
  },
  searchButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.6)',
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
  },

  // Filter Pills
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterPillActive: {
    backgroundColor: theme.accent,
  },
  filterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  filterTextActive: {
    color: theme.textInverse,
  },
  instantDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },

  // Grid
  gridContent: {
    paddingHorizontal: 12,
    paddingBottom: 100,
  },
  gridRow: {
    justifyContent: 'space-between',
  },

  // Card
  card: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardImageContainer: {
    backgroundColor: '#FFF',
    padding: 8,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1.2,
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
    padding: 10,
  },
  cardName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
    lineHeight: 15,
  },
  cardSize: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.accent,
  },

  // Badges
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  instantBadge: {
    backgroundColor: '#22C55E',
  },
  acquireBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  instantBadgeText: {
    color: '#fff',
  },
  acquireBadgeText: {
    color: 'rgba(255,255,255,0.8)',
  },

  // Loading & Empty
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
});
