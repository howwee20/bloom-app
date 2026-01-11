import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
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
import { theme, fonts } from '../constants/Colors';
import { supabase } from '../lib/supabase';
import { useAuth } from './_layout';

type CatalogLocation = 'home' | 'watchlist';
type CatalogCondition = 'new' | 'worn' | 'used';
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

const CONDITION_OPTIONS: Array<{ value: CatalogCondition; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'worn', label: 'Worn' },
  { value: 'used', label: 'Used' },
];

const LOCATION_OPTIONS: Array<{ value: CatalogLocation; label: string }> = [
  { value: 'home', label: 'Home' },
  { value: 'watchlist', label: 'Watchlist' },
];

export default function AddItemScreen() {
  const { session } = useAuth();
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogItem[]>([]);
  const [browseItems, setBrowseItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sizeInput, setSizeInput] = useState('');
  const [condition, setCondition] = useState<CatalogCondition | null>(null);
  const [costBasis, setCostBasis] = useState('');
  const [location, setLocation] = useState<CatalogLocation>('home');
  const [submitting, setSubmitting] = useState(false);
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

  const openConfirm = (item: CatalogItem) => {
    setSelectedItem(item);
    setSizeInput('');
    setCondition(null);
    setCostBasis('');
    setLocation('home');
    setSubmitError(null);
    setShowConfirm(true);
  };

  const closeConfirm = () => {
    setShowConfirm(false);
    setSubmitting(false);
    setSubmitError(null);
  };

  const handleAddAsset = async () => {
    if (!selectedItem) return;
    if (!session?.user?.id) {
      setSubmitError('Please sign in to add an item.');
      return;
    }

    const trimmedSize = sizeInput.trim();
    const parsedCost = costBasis.trim() ? Number.parseFloat(costBasis) : null;

    if (parsedCost !== null && (Number.isNaN(parsedCost) || parsedCost < 0)) {
      setSubmitError('Enter a valid cost basis.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const { error: insertError } = await supabase
        .from('assets')
        .insert({
          owner_id: session.user.id,
          catalog_item_id: selectedItem.id,
          name: selectedItem.display_name,
          image_url: selectedItem.image_url_thumb,
          brand: selectedItem.brand,
          stockx_sku: selectedItem.style_code,
          size: trimmedSize || null,
          condition: condition || null,
          purchase_price: parsedCost,
          status: 'pending',
          location,
        });

      if (insertError) throw insertError;

      closeConfirm();
      router.back();
    } catch (e) {
      console.error('Add asset error:', e);
      setSubmitError('Failed to add item. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Determine what to show
  const isSearching = query.trim().length > 0;
  const listData = isSearching ? searchResults : browseItems;
  const showEmptyState = !loading && !browseLoading && listData.length === 0;

  const renderItem = ({ item }: { item: CatalogItem }) => (
    <Pressable style={styles.tokenCard} onPress={() => openConfirm(item)}>
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add Item</Text>
          <Pressable style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>

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

      {/* Confirm Modal */}
      <Modal
        visible={showConfirm}
        transparent
        animationType="slide"
        onRequestClose={closeConfirm}
      >
        <Pressable style={styles.modalOverlay} onPress={closeConfirm}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {selectedItem?.image_url_thumb && (
              <Image source={{ uri: selectedItem.image_url_thumb }} style={styles.modalImage} />
            )}
            <Text style={styles.modalTitle}>{selectedItem?.display_name}</Text>
            <Text style={styles.modalSubtitle}>{selectedItem?.style_code}</Text>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Size (optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., 10, 10.5, M, L"
                placeholderTextColor={theme.textTertiary}
                value={sizeInput}
                onChangeText={setSizeInput}
              />
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Condition (optional)</Text>
              <View style={styles.optionRow}>
                {CONDITION_OPTIONS.map((option) => {
                  const isActive = condition === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[styles.optionChip, isActive && styles.optionChipActive]}
                      onPress={() => setCondition(isActive ? null : option.value)}
                    >
                      <Text style={[styles.optionChipText, isActive && styles.optionChipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Cost basis (optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="$0.00"
                placeholderTextColor={theme.textTertiary}
                value={costBasis}
                onChangeText={setCostBasis}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Location</Text>
              <View style={styles.optionRow}>
                {LOCATION_OPTIONS.map((option) => {
                  const isActive = location === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[styles.optionChip, isActive && styles.optionChipActive]}
                      onPress={() => setLocation(option.value)}
                    >
                      <Text style={[styles.optionChipText, isActive && styles.optionChipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {submitError && <Text style={styles.submitErrorText}>{submitError}</Text>}
            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleAddAsset}
              disabled={submitting}
            >
              <Text style={[styles.submitButtonText, submitting && styles.submitButtonTextDisabled]}>
                {submitting ? 'Adding...' : 'Add to Wallet'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: theme.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.backgroundSecondary,
  },
  closeButtonText: {
    color: theme.textSecondary,
    fontSize: 14,
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
  submitErrorText: {
    color: theme.error,
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.card,
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalImage: {
    width: 120,
    height: 80,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 12,
    backgroundColor: '#FFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 4,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSection: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.textPrimary,
    backgroundColor: theme.backgroundSecondary,
    fontSize: 16,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.backgroundSecondary,
  },
  optionChipActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentLight,
  },
  optionChipText: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: theme.textPrimary,
  },
  submitButton: {
    backgroundColor: theme.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: theme.textInverse,
    fontWeight: '700',
    fontSize: 16,
  },
  submitButtonTextDisabled: {
    color: theme.textInverse,
  },
});
