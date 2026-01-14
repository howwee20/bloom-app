import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
  const [result, setResult] = useState<CatalogItem | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

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

  const handleBuy = () => {
    if (!result) return;
    router.push({
      pathname: '/buy/[id]',
      params: {
        id: result.id,
        name: result.display_name,
        style_code: result.style_code,
        image_url: result.image_url_thumb || '',
        brand: result.brand,
      },
    });
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
                  <Pressable style={styles.buyButton} onPress={handleBuy}>
                    <Text style={styles.buyButtonText}>Buy This</Text>
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
  buyButton: {
    backgroundColor: theme.accent,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    marginBottom: 12,
  },
  buyButtonText: {
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
});
