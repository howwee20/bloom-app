import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme, fonts } from '../constants/Colors';
import { supabase } from '../lib/supabase';

type BrandFilter = 'All' | 'Jordan' | 'Nike' | 'adidas' | 'New Balance' | 'Other';

interface CatalogItem {
  id: string;
  display_name: string;
  brand: string;
  model: string;
  colorway_name: string;
  style_code: string;
  release_year: number | null;
  image_url_thumb: string | null;
  popularity_rank: number;
}

const BRAND_FILTERS: BrandFilter[] = ['All', 'Jordan', 'Nike', 'adidas', 'New Balance', 'Other'];
const MAIN_BRANDS = ['Jordan', 'Nike', 'adidas', 'New Balance'];
const PAGE_SIZE = 50;

export default function BuyBrowseScreen() {
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogItem[]>([]);
  const [browseItems, setBrowseItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('All');

  // Fetch browse items with brand filter and pagination
  const fetchBrowseItems = useCallback(async (brand: BrandFilter, offset: number = 0) => {
    if (offset === 0) {
      setBrowseLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      let queryBuilder = supabase
        .from('catalog_items')
        .select('id, display_name, brand, model, colorway_name, style_code, release_year, image_url_thumb, popularity_rank')
        .order('popularity_rank', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      // Apply brand filter
      if (brand === 'Other') {
        queryBuilder = queryBuilder.not('brand', 'in', `(${MAIN_BRANDS.join(',')})`);
      } else if (brand !== 'All') {
        queryBuilder = queryBuilder.eq('brand', brand);
      }

      const { data, error: fetchError } = await queryBuilder;

      if (fetchError) throw fetchError;

      const items = (data as CatalogItem[]) || [];

      if (offset === 0) {
        setBrowseItems(items);
      } else {
        setBrowseItems(prev => [...prev, ...items]);
      }

      setHasMore(items.length === PAGE_SIZE);
    } catch (e) {
      console.error('Browse fetch error:', e);
      setError('Failed to load items.');
    } finally {
      setBrowseLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchBrowseItems(brandFilter, 0);
  }, []);

  // Handle brand filter change
  const handleBrandChange = (brand: BrandFilter) => {
    setBrandFilter(brand);
    setHasMore(true);
    fetchBrowseItems(brand, 0);
  };

  // Load more items
  const loadMore = () => {
    if (loadingMore || !hasMore || query.trim()) return;
    fetchBrowseItems(brandFilter, browseItems.length);
  };

  // Search with debounce
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setError(null);
      return;
    }

    const timer = setTimeout(() => {
      searchCatalog(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const searchCatalog = async (value: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: searchError } = await supabase.rpc('search_catalog_items', {
        q: value,
        limit_n: 30,
      });

      if (searchError) throw searchError;
      setSearchResults((data as CatalogItem[]) || []);
    } catch (e) {
      console.error('Search error:', e);
      setError('Search failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = (item: CatalogItem) => {
    // Navigate to Buy Detail screen
    router.push({
      pathname: '/buy/[id]',
      params: {
        id: item.id,
        name: item.display_name,
        style_code: item.style_code,
        image_url: item.image_url_thumb || '',
        brand: item.brand,
      },
    });
  };

  // Determine what to show
  const isSearching = query.trim().length > 0;
  const listData = isSearching ? searchResults : browseItems;
  const showEmptyState = !loading && !browseLoading && listData.length === 0;

  const renderItem = ({ item }: { item: CatalogItem }) => (
    <Pressable style={styles.tokenCard} onPress={() => handleSelectItem(item)}>
      <View style={styles.cardImageContainer}>
        {item.image_url_thumb ? (
          <Image source={{ uri: item.image_url_thumb }} style={styles.cardImage} resizeMode="contain" />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Text style={styles.cardImagePlaceholderText}>
              {item.display_name.charAt(0)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={2}>
          {item.display_name}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.style_code}
        </Text>
      </View>
    </Pressable>
  );

  const renderHeader = () => (
    <View style={styles.stickyHeader}>
      {/* Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search by name or style code"
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>✕</Text>
            </Pressable>
          )}
        </View>
        {loading && <ActivityIndicator style={styles.searchSpinner} size="small" color={theme.accent} />}
      </View>

      {/* Brand Filter Chips */}
      {!isSearching && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsContainer}
          style={styles.filterChipsScroll}
        >
          {BRAND_FILTERS.map((brand) => {
            const isActive = brandFilter === brand;
            return (
              <Pressable
                key={brand}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => handleBrandChange(brand)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {brand}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Section Header */}
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>
          {isSearching ? 'Search Results' : brandFilter === 'All' ? 'Browse All' : brandFilter}
        </Text>
        {(browseLoading || loading) && <ActivityIndicator size="small" color={theme.accent} />}
      </View>
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={styles.loadingMoreText}>Loading more...</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {/* Floating Close Button */}
        <Pressable style={styles.floatingClose} onPress={() => router.back()}>
          <Text style={styles.floatingCloseText}>✕</Text>
        </Pressable>

        {showEmptyState ? (
          <View style={styles.emptyWrapper}>
            {renderHeader()}
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {isSearching ? 'No matches found' : 'No items available'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {isSearching ? 'Try a different search term' : 'Check back later'}
              </Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListHeaderComponent={renderHeader}
            ListFooterComponent={renderFooter}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            showsVerticalScrollIndicator={false}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={10}
          />
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  keyboardView: {
    flex: 1,
  },
  floatingClose: {
    position: 'absolute',
    top: 8,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCloseText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stickyHeader: {
    backgroundColor: theme.background,
    paddingBottom: 8,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: theme.textPrimary,
    fontSize: 16,
    fontFamily: fonts.body,
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  searchSpinner: {
    marginLeft: 8,
  },
  filterChipsScroll: {
    maxHeight: 44,
  },
  filterChipsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  filterChipTextActive: {
    color: theme.textInverse,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listHeaderText: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: theme.textSecondary,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 100,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  tokenCard: {
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
  cardImageContainer: {
    backgroundColor: '#FFF',
    padding: 8,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1.3,
  },
  cardImagePlaceholder: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImagePlaceholderText: {
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
    fontSize: 11,
    color: theme.textSecondary,
  },
  emptyWrapper: {
    flex: 1,
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingTop: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  loadingMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  errorText: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: theme.error,
    fontSize: 12,
  },
});
