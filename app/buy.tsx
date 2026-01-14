import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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

interface CatalogItem {
  id: string;
  display_name: string;
  brand: string;
  style_code: string;
  image_url_thumb: string | null;
}

export default function BuyScreen() {
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);


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
    const item = results[currentIndex];
    if (!item) return;
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
                  <Pressable style={styles.buyButton} onPress={handleSelectItem}>
                    <Text style={styles.buyButtonText}>Buy</Text>
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
  buyButton: {
    backgroundColor: theme.accent,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buyButtonText: {
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
});
