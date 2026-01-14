import AsyncStorage from '@react-native-async-storage/async-storage';
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

interface CatalogItem {
  id: string;
  display_name: string;
  brand: string;
  style_code: string;
  image_url_thumb: string | null;
  lowest_price?: number | null;
  marketplace?: string | null;
}

const SAVED_SIZE_KEY = 'bloom_saved_size';

export default function BuyScreen() {
  const { session } = useAuth();
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // Size and purchase state
  const [size, setSize] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  // Load saved size on mount
  useEffect(() => {
    AsyncStorage.getItem(SAVED_SIZE_KEY).then((saved) => {
      if (saved) setSize(saved);
    });
  }, []);

  // Save size when changed
  const handleSizeChange = (newSize: string) => {
    setSize(newSize);
    if (newSize.trim()) {
      AsyncStorage.setItem(SAVED_SIZE_KEY, newSize.trim());
    }
  };

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

  const handleBuyPress = () => {
    if (!size.trim()) {
      // Focus size input if empty
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmBuy = async (destination: 'bloom' | 'home') => {
    const item = results[currentIndex];
    if (!item || !session?.user?.id) return;

    setPurchasing(true);
    try {
      // Create order intent
      const { data, error } = await supabase.rpc('create_order_intent', {
        p_catalog_item_id: item.id,
        p_size: size.trim(),
        p_destination: destination,
      });

      if (error) throw error;

      setShowConfirm(false);
      router.replace('/(tabs)');
    } catch (e) {
      console.error('Purchase error:', e);
    } finally {
      setPurchasing(false);
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

                {/* Price + Source */}
                <Text style={styles.priceRow}>
                  <Text style={styles.priceText}>
                    {currentItem.lowest_price ? `$${currentItem.lowest_price}` : 'Price TBD'}
                  </Text>
                  <Text style={styles.sourceText}>
                    {currentItem.marketplace ? ` · ${currentItem.marketplace}` : ''}
                  </Text>
                </Text>

                {/* Size + Buy row */}
                <View style={styles.actionRow}>
                  <TextInput
                    style={styles.sizeInput}
                    placeholder="Size"
                    placeholderTextColor={theme.textTertiary}
                    value={size}
                    onChangeText={handleSizeChange}
                    keyboardType="default"
                  />
                  <Pressable
                    style={[styles.buyButton, !size.trim() && styles.buyButtonDisabled]}
                    onPress={handleBuyPress}
                  >
                    <Text style={styles.buyButtonText}>Buy</Text>
                  </Pressable>
                </View>

                {/* Next + count */}
                {hasMore && (
                  <Pressable style={styles.nextButton} onPress={handleNext}>
                    <Text style={styles.nextButtonText}>Next ({currentIndex + 1}/{results.length})</Text>
                  </Pressable>
                )}
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
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowConfirm(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ship to</Text>

            <Pressable
              style={styles.modalOption}
              onPress={() => handleConfirmBuy('bloom')}
              disabled={purchasing}
            >
              <Text style={styles.modalOptionTitle}>Bloom Vault</Text>
              <Text style={styles.modalOptionDesc}>Store with us, sell anytime</Text>
            </Pressable>

            <Pressable
              style={styles.modalOption}
              onPress={() => handleConfirmBuy('home')}
              disabled={purchasing}
            >
              <Text style={styles.modalOptionTitle}>My Address</Text>
              <Text style={styles.modalOptionDesc}>Ship directly to me</Text>
            </Pressable>

            {purchasing && (
              <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 16 }} />
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
    width: 160,
    height: 120,
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
    fontSize: 32,
    color: theme.accent,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  priceRow: {
    marginBottom: 16,
  },
  priceText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  sourceText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  sizeInput: {
    width: 70,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  buyButton: {
    flex: 1,
    backgroundColor: theme.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    opacity: 0.5,
  },
  buyButtonText: {
    color: theme.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  nextButton: {
    marginTop: 12,
    paddingVertical: 10,
  },
  nextButtonText: {
    color: theme.textSecondary,
    fontSize: 14,
    fontWeight: '500',
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalOption: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  modalOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  modalOptionDesc: {
    fontSize: 13,
    color: theme.textSecondary,
  },
});
