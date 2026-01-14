import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  const [hasSearched, setHasSearched] = useState(false);

  // Selected item for purchase
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [size, setSize] = useState('');
  const [showBuyModal, setShowBuyModal] = useState(false);
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

  const handleSelectItem = (item: CatalogItem) => {
    setSelectedItem(item);
    setShowBuyModal(true);
  };

  const handleConfirmBuy = async (destination: 'bloom' | 'home') => {
    if (!selectedItem || !session?.user?.id || !size.trim()) return;

    setPurchasing(true);
    try {
      const { error } = await supabase.rpc('create_order_intent', {
        p_catalog_item_id: selectedItem.id,
        p_size: size.trim(),
        p_destination: destination,
      });

      if (error) throw error;

      setShowBuyModal(false);
      setSelectedItem(null);
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
    setHasSearched(false);
  };

  const formatPrice = (price: number | null | undefined) => {
    if (!price) return 'Price TBD';
    return `$${price.toFixed(0)}`;
  };

  // Render token card - same style as wallet
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
          <Text style={styles.cardPrice}>{formatPrice(item.lowest_price)}</Text>
          {item.marketplace && (
            <Text style={styles.cardSource}>{item.marketplace}</Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Close button */}
      <Pressable style={styles.closeButton} onPress={() => router.back()}>
        <Text style={styles.closeButtonText}>✕</Text>
      </Pressable>

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
              />
              {query.length > 0 && (
                <Pressable onPress={handleClear} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>✕</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Results grid */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : results.length > 0 ? (
            <FlatList
              data={results}
              renderItem={renderTokenCard}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator={false}
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
            />
            {query.length > 0 && (
              <Pressable onPress={handleClear} style={styles.clearButtonCenter}>
                <Text style={styles.clearButtonText}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Buy Modal */}
      <Modal
        visible={showBuyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBuyModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBuyModal(false)}>
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
                <Text style={styles.modalPrice}>{formatPrice(selectedItem.lowest_price)}</Text>

                {/* Size input */}
                <View style={styles.sizeRow}>
                  <Text style={styles.sizeLabel}>Size</Text>
                  <TextInput
                    style={styles.sizeInput}
                    value={size}
                    onChangeText={handleSizeChange}
                    placeholder="10"
                    placeholderTextColor={theme.textTertiary}
                  />
                </View>

                {/* Ship to options */}
                <Text style={styles.shipToLabel}>Ship to</Text>
                <Pressable
                  style={[styles.shipOption, !size.trim() && styles.shipOptionDisabled]}
                  onPress={() => handleConfirmBuy('bloom')}
                  disabled={!size.trim() || purchasing}
                >
                  <Text style={styles.shipOptionTitle}>Bloom Vault</Text>
                  <Text style={styles.shipOptionDesc}>Store with us, sell anytime</Text>
                </Pressable>

                <Pressable
                  style={[styles.shipOption, !size.trim() && styles.shipOptionDisabled]}
                  onPress={() => handleConfirmBuy('home')}
                  disabled={!size.trim() || purchasing}
                >
                  <Text style={styles.shipOptionTitle}>My Address</Text>
                  <Text style={styles.shipOptionDesc}>Ship directly to me</Text>
                </Pressable>

                {purchasing && (
                  <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 16 }} />
                )}
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
  cardPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  cardSource: {
    fontSize: 11,
    color: theme.textSecondary,
    marginTop: 2,
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
  modalPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  sizeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  sizeInput: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  shipToLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  shipOption: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  shipOptionDisabled: {
    opacity: 0.5,
  },
  shipOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  shipOptionDesc: {
    fontSize: 13,
    color: theme.textSecondary,
  },
});
