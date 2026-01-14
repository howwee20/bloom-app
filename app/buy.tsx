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

// BloomOffer - unified offer from any marketplace
interface BloomOffer {
  offer_id: string;
  catalog_item_id: string | null;
  title: string;
  image: string | null;
  price: number;
  total_estimate: number;
  currency: 'USD';
  source: string;
  condition: 'new' | 'used' | 'deadstock';
  source_url: string;
  last_updated_at: string;
}

// Legacy interface for backwards compatibility with existing search
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

// Source display names
const SOURCE_LABELS: Record<string, string> = {
  stockx: 'StockX',
  ebay: 'eBay',
  goat: 'GOAT',
  adidas: 'Adidas',
  nike: 'Nike',
};

// Condition labels
const CONDITION_LABELS: Record<string, string> = {
  new: 'New',
  used: 'Used',
  deadstock: 'DS',
};

export default function BuyScreen() {
  const { session } = useAuth();
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<BloomOffer[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected offer for purchase
  const [selectedOffer, setSelectedOffer] = useState<BloomOffer | null>(null);
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
    setOffers([]);

    try {
      // Use catalog search directly (Edge Function can be enabled later)
      const { data, error } = await supabase.rpc('search_catalog_items', {
        q: trimmed,
        limit_n: 20,
      });

      if (error) {
        console.error('Search error:', error);
        return;
      }

      if (data) {
        // Convert to BloomOffer format
        const searchOffers: BloomOffer[] = data.map((item: CatalogItem) => ({
          offer_id: `stockx:${item.id}`,
          catalog_item_id: item.id,
          title: item.display_name,
          image: item.image_url_thumb,
          price: item.lowest_price || 0,
          total_estimate: (item.lowest_price || 0) * 1.12 + 14,
          currency: 'USD' as const,
          source: 'stockx',
          condition: 'deadstock' as const,
          source_url: `https://stockx.com/search?s=${encodeURIComponent(item.display_name)}`,
          last_updated_at: new Date().toISOString(),
        }));
        setOffers(searchOffers.filter(o => o.price > 0));
      }
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOffer = (offer: BloomOffer) => {
    setSelectedOffer(offer);
    setShowBuyModal(true);
  };

  const handleConfirmBuy = async (destination: 'bloom' | 'home') => {
    if (!selectedOffer || !session?.user?.id || !size.trim()) return;

    setPurchasing(true);
    try {
      // Use existing RPC (migration adds new optional params)
      const { error } = await supabase.rpc('create_order_intent', {
        p_catalog_item_id: selectedOffer.catalog_item_id,
        p_size: size.trim(),
        p_destination: destination,
      });

      if (error) throw error;

      setShowBuyModal(false);
      setSelectedOffer(null);
      router.replace('/(tabs)');
    } catch (e) {
      console.error('Purchase error:', e);
    } finally {
      setPurchasing(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setOffers([]);
    setHasSearched(false);
  };

  const formatPrice = (price: number | null | undefined) => {
    if (!price) return 'Price TBD';
    return `$${price.toFixed(0)}`;
  };

  // Render offer card - matches wallet token card style exactly
  const renderOfferCard = ({ item }: { item: BloomOffer }) => {
    const sourceLabel = SOURCE_LABELS[item.source] || item.source;
    const conditionLabel = CONDITION_LABELS[item.condition] || item.condition;

    return (
      <Pressable style={styles.tokenCard} onPress={() => handleSelectOffer(item)}>
        <View style={styles.cardImageContainer}>
          {item.image ? (
            <Image
              source={{ uri: item.image }}
              style={styles.cardImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.cardImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{item.title.charAt(0)}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.cardPrice}>{formatPrice(item.total_estimate)}</Text>
          <Text style={styles.cardSource}>{sourceLabel} · {conditionLabel}</Text>
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

          {/* Results grid */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : offers.length > 0 ? (
            <FlatList
              data={offers}
              renderItem={renderOfferCard}
              keyExtractor={(item) => item.offer_id}
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

      {/* Buy Modal */}
      <Modal
        visible={showBuyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBuyModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBuyModal(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            {selectedOffer && (
              <>
                {selectedOffer.image && (
                  <Image
                    source={{ uri: selectedOffer.image }}
                    style={styles.modalImage}
                    resizeMode="contain"
                  />
                )}
                <Text style={styles.modalTitle}>{selectedOffer.title}</Text>
                <Text style={styles.modalPrice}>{formatPrice(selectedOffer.total_estimate)}</Text>
                <Text style={styles.modalSource}>
                  {SOURCE_LABELS[selectedOffer.source] || selectedOffer.source} · {CONDITION_LABELS[selectedOffer.condition] || selectedOffer.condition}
                </Text>

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
    marginBottom: 4,
  },
  modalSource: {
    fontSize: 13,
    color: theme.textSecondary,
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
