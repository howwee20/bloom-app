import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
  const [result, setResult] = useState<CatalogItem | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Confirm modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [sizeInput, setSizeInput] = useState('');
  const [condition, setCondition] = useState<CatalogCondition | null>(null);
  const [costBasis, setCostBasis] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setHasSearched(true);
    setResult(null);

    try {
      // Search and return the TOP result only
      const { data, error } = await supabase.rpc('search_catalog_items', {
        q: trimmed,
        limit_n: 1,
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setResult(data[0] as CatalogItem);
      }
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = () => {
    if (!result) return;
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
    if (!result) return;
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
          catalog_item_id: result.id,
          name: result.display_name,
          image_url: result.image_url_thumb,
          brand: result.brand,
          stockx_sku: result.style_code,
          size: trimmedSize || null,
          condition: condition || null,
          purchase_price: parsedCost,
          status: 'pending',
          location: 'home', // Add to home for selling
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
    setResult(null);
    setHasSearched(false);
    searchInputRef.current?.focus();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {/* Close Button */}
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>

        {/* Main Content - Centered */}
        <View style={styles.content}>
          {/* Bloom Logo */}
          <Text style={styles.logo}>Bloom</Text>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputWrapper}>
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="bloom it"
                placeholderTextColor={theme.textTertiary}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <Pressable onPress={handleClear} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>✕</Text>
                </Pressable>
              )}
            </View>
            <Pressable
              style={[styles.searchButton, !query.trim() && styles.searchButtonDisabled]}
              onPress={handleSearch}
              disabled={!query.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.textInverse} />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </Pressable>
          </View>

          {/* Result */}
          {hasSearched && !loading && (
            <View style={styles.resultSection}>
              {result ? (
                <View style={styles.resultCard}>
                  {result.image_url_thumb ? (
                    <Image
                      source={{ uri: result.image_url_thumb }}
                      style={styles.resultImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.resultImage, styles.resultImagePlaceholder]}>
                      <Text style={styles.resultImagePlaceholderText}>
                        {result.display_name.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.resultName}>{result.display_name}</Text>
                  <Text style={styles.resultMeta}>{result.style_code}</Text>
                  <Pressable style={styles.sellButton} onPress={handleSelectItem}>
                    <Text style={styles.sellButtonText}>Sell This</Text>
                  </Pressable>
                  <Pressable onPress={handleClear}>
                    <Text style={styles.searchAgainText}>Search again</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.noResult}>
                  <Text style={styles.noResultTitle}>No match found</Text>
                  <Text style={styles.noResultSubtitle}>Try a different search</Text>
                </View>
              )}
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
            {result?.image_url_thumb && (
              <Image source={{ uri: result.image_url_thumb }} style={styles.modalImage} />
            )}
            <Text style={styles.modalTitle}>{result?.display_name}</Text>
            <Text style={styles.modalSubtitle}>{result?.style_code}</Text>

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
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: theme.textSecondary,
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 100,
    alignItems: 'center',
  },
  logo: {
    fontFamily: fonts.heading,
    fontSize: 48,
    color: theme.accent,
    marginBottom: 32,
  },
  searchContainer: {
    width: '100%',
    gap: 12,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: theme.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 16,
    color: theme.textPrimary,
    fontSize: 18,
    fontFamily: fonts.body,
  },
  clearButton: {
    padding: 8,
  },
  clearButtonText: {
    color: theme.textSecondary,
    fontSize: 14,
  },
  searchButton: {
    backgroundColor: theme.accent,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  searchButtonText: {
    color: theme.textInverse,
    fontSize: 17,
    fontWeight: '700',
  },
  resultSection: {
    marginTop: 32,
    width: '100%',
    alignItems: 'center',
  },
  resultCard: {
    width: '100%',
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.accent,
  },
  resultImage: {
    width: 160,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#FFF',
    marginBottom: 16,
  },
  resultImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultImagePlaceholderText: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: theme.accent,
  },
  resultName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  resultMeta: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 20,
  },
  sellButton: {
    backgroundColor: theme.accent,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    marginBottom: 12,
  },
  sellButtonText: {
    color: theme.textInverse,
    fontSize: 17,
    fontWeight: '700',
  },
  searchAgainText: {
    color: theme.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  noResult: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noResultTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  noResultSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
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
