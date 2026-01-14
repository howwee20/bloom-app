import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme, fonts } from '../constants/Colors';
import { supabase } from '../lib/supabase';
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
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // Confirm modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [sizeInput, setSizeInput] = useState('');
  const [condition, setCondition] = useState<CatalogCondition | null>(null);
  const [costBasis, setCostBasis] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);


  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setHasSearched(true);
    setResults([]);
    setCurrentIndex(0);

    try {
      const { data, error } = await supabase.rpc('search_catalog_items', {
        q: trimmed,
        limit_n: 20,
      });

      if (error) throw error;
      setResults((data as CatalogItem[]) || []);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < results.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleSelectItem = () => {
    setSizeInput('');
    setCondition(null);
    setCostBasis('');
    setSubmitError(null);
    setShowConfirm(true);
  };

  const closeConfirm = () => {
    setShowConfirm(false);
    setSubmitting(false);
    setSubmitError(null);
  };

  const handleAddAsset = async () => {
    const item = results[currentIndex];
    if (!item) return;
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
          catalog_item_id: item.id,
          name: item.display_name,
          image_url: item.image_url_thumb,
          brand: item.brand,
          stockx_sku: item.style_code,
          size: trimmedSize || null,
          condition: condition || null,
          purchase_price: parsedCost,
          status: 'pending',
          location: 'home',
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

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setCurrentIndex(0);
    setHasSearched(false);
    searchInputRef.current?.focus();
  };

  const currentItem = results[currentIndex];
  const hasMore = currentIndex < results.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {/* Close button */}
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>

        {/* Center content */}
        <View style={styles.centerArea}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : hasSearched && currentItem ? (
            <View style={styles.resultSection}>
              <View style={styles.resultCard}>
                {currentItem.image_url_thumb ? (
                  <Image
                    source={{ uri: currentItem.image_url_thumb }}
                    style={styles.resultImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.resultImage, styles.resultImagePlaceholder]}>
                    <Text style={styles.resultImagePlaceholderText}>
                      {currentItem.display_name.charAt(0)}
                    </Text>
                  </View>
                )}
                <Text style={styles.resultName}>{currentItem.display_name}</Text>
                <Text style={styles.resultMeta}>{currentItem.style_code}</Text>

                <View style={styles.buttonRow}>
                  <Pressable style={styles.sellButton} onPress={handleSelectItem}>
                    <Text style={styles.sellButtonText}>Sell</Text>
                  </Pressable>
                  {hasMore && (
                    <Pressable style={styles.nextButton} onPress={handleNext}>
                      <Text style={styles.nextButtonText}>Next</Text>
                    </Pressable>
                  )}
                </View>

                <Text style={styles.countText}>
                  {currentIndex + 1} of {results.length}
                </Text>
              </View>
            </View>
          ) : hasSearched ? (
            <View style={styles.noResult}>
              <Text style={styles.noResultTitle}>No matches</Text>
              <Text style={styles.noResultSubtitle}>Try a different search</Text>
            </View>
          ) : (
            /* Logo + Search in center */
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
                />
                {query.length > 0 && (
                  <Pressable onPress={handleClear} style={styles.clearButton}>
                    <Text style={styles.clearButtonText}>✕</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </View>
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
            {currentItem?.image_url_thumb && (
              <Image source={{ uri: currentItem.image_url_thumb }} style={styles.modalImage} />
            )}
            <Text style={styles.modalTitle}>{currentItem?.display_name}</Text>
            <Text style={styles.modalSubtitle}>{currentItem?.style_code}</Text>

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
              <Text style={[styles.submitButtonText, submitting && styles.submitButtonTextDisabled]}>
                {submitting ? 'Adding...' : 'Add to Sell'}
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
  centerArea: {
    flex: 1,
    justifyContent: 'center',
  },
  searchCenter: {
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
  clearButton: {
    padding: 6,
  },
  clearButtonText: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  resultSection: {
    padding: 16,
  },
  resultCard: {
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.accent,
  },
  resultImage: {
    width: 140,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#FFF',
    marginBottom: 12,
  },
  resultImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultImagePlaceholderText: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: theme.accent,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  resultMeta: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sellButton: {
    backgroundColor: theme.accent,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  sellButtonText: {
    color: theme.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  nextButton: {
    backgroundColor: theme.backgroundSecondary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  nextButtonText: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  countText: {
    marginTop: 12,
    fontSize: 12,
    color: theme.textTertiary,
  },
  noResult: {
    alignItems: 'center',
    paddingVertical: 32,
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal styles
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
  submitButtonTextDisabled: {
    color: theme.textInverse,
  },
});
