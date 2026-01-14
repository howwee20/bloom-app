import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme, fonts } from '../constants/Colors';
import { supabase } from '../lib/supabase';
import { initSearchIndex, searchCatalog, isIndexReady, CatalogProduct } from '../lib/search';
import { useAuth } from './_layout';

type CatalogCondition = 'new' | 'worn' | 'used';

interface CatalogItem {
  id: string;
  display_name: string;
  brand: string;
  style_code: string;
  image_url_thumb: string | null;
}

const CONDITION_OPTIONS: Array<{ value: CatalogCondition; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'worn', label: 'Worn' },
  { value: 'used', label: 'Used' },
];

export default function AddItemScreen() {
  const { session } = useAuth();
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected item for adding
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sizeInput, setSizeInput] = useState('');
  const [condition, setCondition] = useState<CatalogCondition | null>(null);
  const [costBasis, setCostBasis] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load catalog index on mount
  useEffect(() => {
    initSearchIndex().then(() => {
      console.log('[AddItem] Search index ready');
    });
  }, []);

  // Auto-focus search input - aggressive approach with retry
  useEffect(() => {
    // First attempt after short delay
    const t1 = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
    // Backup attempt after screen fully mounted
    const t2 = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // INSTANT SEARCH - Pure in-memory, ZERO network calls
  const handleSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const start = performance.now();
    setHasSearched(true);

    // Search local index - NO AWAIT, NO NETWORK, INSTANT
    const searchResults = searchCatalog(trimmed, 20);

    // Convert to CatalogItem format
    const items: CatalogItem[] = searchResults.map((item: CatalogProduct) => ({
      id: item.id,
      display_name: item.name,
      brand: item.brand,
      style_code: item.style_code,
      image_url_thumb: item.image_url,
    }));

    setResults(items);
    console.log(`[AddItem] Search completed in ${(performance.now() - start).toFixed(1)}ms`);
  };

  const handleSelectItem = (item: CatalogItem) => {
    setSelectedItem(item);
    setSizeInput('');
    setCondition(null);
    setCostBasis('');
    setSubmitError(null);
    setShowSellModal(true);
  };

  const closeSellModal = () => {
    setShowSellModal(false);
    setSelectedItem(null);
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
          location: 'home',
        });

      if (insertError) throw insertError;

      closeSellModal();
      router.back();
    } catch (e) {
      console.error('Add asset error:', e);
      setSubmitError('Failed to add item. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
  };

  // Render token card - same style as wallet/buy
  const renderTokenCard = ({ item }: { item: CatalogItem }) => {
    return (
      <Pressable style={styles.tokenCard} onPress={() => handleSelectItem(item)}>
        <View style={styles.cardImageContainer}>
          {item.image_url_thumb ? (
            <Image
              source={{ uri: item.image_url_thumb }}
              style={styles.cardImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.cardImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{item.display_name.charAt(0)}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{item.display_name}</Text>
          <Text style={styles.cardSku}>{item.style_code}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Close button - only show on initial search view */}
      {!hasSearched && (
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>
      )}

      {hasSearched ? (
        /* Results view - logo top left, grid of tokens */
        <View style={styles.resultsContainer}>
          {/* Header with logo and search */}
          <View style={styles.resultsHeader}>
            <Text style={styles.logoSmall}>Bloom</Text>
            <View style={styles.searchBarSmall}>
              <TextInput
                ref={searchInputRef}
                style={styles.searchInputSmall}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                blurOnSubmit={false}
              />
              <Pressable onPress={handleClear} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>✕</Text>
              </Pressable>
            </View>
          </View>

          {/* Results grid - INSTANT, no loading spinner needed */}
          {results.length > 0 ? (
            <FlatList
              data={results}
              renderItem={renderTokenCard}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
            />
          ) : (
            <View style={styles.noResult}>
              <Text style={styles.noResultTitle}>No matches</Text>
              <Text style={styles.noResultSubtitle}>Try a different search</Text>
            </View>
          )}
        </View>
      ) : (
        /* Initial search view - centered logo and search */
        <View style={styles.searchCenter}>
          <Text style={styles.logo}>Bloom</Text>
          <View style={styles.searchInputWrapper}>
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              blurOnSubmit={false}
            />
            {query.length > 0 && (
              <Pressable onPress={handleClear} style={styles.clearButtonCenter}>
                <Text style={styles.clearButtonText}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Sell Modal */}
      <Modal
        visible={showSellModal}
        transparent
        animationType="slide"
        onRequestClose={closeSellModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeSellModal}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            {selectedItem && (
              <>
                {selectedItem.image_url_thumb && (
                  <Image
                    source={{ uri: selectedItem.image_url_thumb }}
                    style={styles.modalImage}
                    resizeMode="contain"
                  />
                )}
                <Text style={styles.modalTitle}>{selectedItem.display_name}</Text>
                <Text style={styles.modalSubtitle}>{selectedItem.style_code}</Text>

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

                {submitError && <Text style={styles.submitErrorText}>{submitError}</Text>}
                <Pressable
                  style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                  onPress={handleAddAsset}
                  disabled={submitting}
                >
                  <Text style={styles.submitButtonText}>
                    {submitting ? 'Adding...' : 'Add to Sell'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
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
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: theme.textSecondary,
    fontSize: 14,
  },
  // Initial centered search
  searchCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: theme.accent,
    textAlign: 'center',
    marginBottom: 20,
  },
  searchInputWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    color: theme.textPrimary,
    fontSize: 16,
    fontFamily: fonts.body,
  },
  clearButtonCenter: {
    padding: 6,
  },
  clearButtonText: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  // Results view
  resultsContainer: {
    flex: 1,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  logoSmall: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: theme.accent,
  },
  searchBarSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInputSmall: {
    flex: 1,
    paddingVertical: 10,
    color: theme.textPrimary,
    fontSize: 15,
    fontFamily: fonts.body,
  },
  clearButton: {
    padding: 6,
  },
  // Grid
  gridContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  // Token card - same as wallet
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
  cardSku: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  // Loading & empty
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResult: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  noResultSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalImage: {
    width: 120,
    height: 90,
    borderRadius: 12,
    alignSelf: 'center',
    backgroundColor: '#FFF',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
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
    letterSpacing: 0.5,
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
  submitErrorText: {
    color: theme.error,
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
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
});
