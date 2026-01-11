import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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

type CatalogLocation = 'home' | 'bloom' | 'watchlist';
type CatalogCondition = 'new' | 'worn' | 'used';

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

const CONDITION_OPTIONS: Array<{ value: CatalogCondition; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'worn', label: 'Worn' },
  { value: 'used', label: 'Used' },
];

const LOCATION_OPTIONS: Array<{ value: CatalogLocation; label: string }> = [
  { value: 'home', label: 'Home' },
  { value: 'bloom', label: 'Bloom' },
  { value: 'watchlist', label: 'Watchlist' },
];

export default function AddItemScreen() {
  const { session } = useAuth();
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [popular, setPopular] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [popularLoading, setPopularLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sizeInput, setSizeInput] = useState('');
  const [condition, setCondition] = useState<CatalogCondition | null>(null);
  const [costBasis, setCostBasis] = useState('');
  const [location, setLocation] = useState<CatalogLocation>('home');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        setError(null);
        return;
      }
      searchCatalog(query);
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!popular.length) {
      fetchPopular();
    }
  }, []);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const fetchPopular = async () => {
    setPopularLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('catalog_items')
        .select('id, display_name, brand, model, colorway_name, style_code, release_year, image_url_thumb, popularity_rank')
        .order('popularity_rank', { ascending: true })
        .limit(20);

      if (fetchError) throw fetchError;
      setPopular((data as CatalogItem[]) || []);
    } catch (e) {
      console.error('Popular fetch error:', e);
    } finally {
      setPopularLoading(false);
    }
  };

  const searchCatalog = async (value: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: searchError } = await supabase.rpc('search_catalog_items', {
        q: value,
        limit_n: 20,
      });

      if (searchError) throw searchError;
      setResults((data as CatalogItem[]) || []);
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

  const showPopular = !query.trim();
  const listData = showPopular ? popular : results;
  const isEmpty = !loading && !popularLoading && listData.length === 0;

  const headerTitle = useMemo(() => (showPopular ? 'Popular' : 'Results'), [showPopular]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add Item</Text>
          <Pressable style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.searchSection}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search by name or style code"
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {loading && <ActivityIndicator style={styles.searchSpinner} size="small" color={theme.accent} />}
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listHeaderText}>{headerTitle}</Text>
          {popularLoading && <ActivityIndicator size="small" color={theme.accent} />}
        </View>

        {isEmpty ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No matches found</Text>
            <Text style={styles.emptySubtitle}>Not finding it? Request it</Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable style={styles.resultRow} onPress={() => openConfirm(item)}>
                {item.image_url_thumb ? (
                  <Image source={{ uri: item.image_url_thumb }} style={styles.resultImage} />
                ) : (
                  <View style={[styles.resultImage, styles.resultImagePlaceholder]}>
                    <Text style={styles.resultImagePlaceholderText}>
                      {item.display_name.charAt(0)}
                    </Text>
                  </View>
                )}
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  <Text style={styles.resultMeta} numberOfLines={1}>
                    {item.style_code}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </KeyboardAvoidingView>

      <Modal
        visible={showConfirm}
        transparent
        animationType="slide"
        onRequestClose={closeConfirm}
      >
        <Pressable style={styles.modalOverlay} onPress={closeConfirm}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedItem?.display_name}</Text>
            <Text style={styles.modalSubtitle}>{selectedItem?.style_code}</Text>

            <View style={styles.modalSection}>
              <Text style={styles.modalLabel}>Size (optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Size"
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
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.textPrimary,
    fontSize: 16,
    fontFamily: fonts.body,
  },
  searchSpinner: {
    marginLeft: 8,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
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
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderLight,
  },
  resultImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 14,
    backgroundColor: theme.backgroundSecondary,
  },
  resultImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultImagePlaceholderText: {
    color: theme.textSecondary,
    fontWeight: '600',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    fontFamily: fonts.body,
  },
  resultMeta: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 4,
    fontFamily: fonts.body,
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 6,
  },
  emptySubtitle: {
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.card,
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 4,
    marginBottom: 12,
  },
  modalSection: {
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.textPrimary,
    backgroundColor: theme.backgroundSecondary,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.backgroundSecondary,
  },
  optionChipActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentLight,
  },
  optionChipText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: theme.textPrimary,
  },
  submitButton: {
    backgroundColor: theme.textPrimary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  submitButtonTextDisabled: {
    color: '#FFF',
  },
});
