// Send to Bloom - Ship an item you own to Bloom for instant resale
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fonts, theme } from '../constants/Colors';
import { supabase } from '../lib/supabase';

// Bloom shipping address
const BLOOM_ADDRESS = {
  name: 'Bloom Vault',
  street: '123 Bloom Way',
  city: 'Detroit',
  state: 'MI',
  zip: '48226',
};

interface SearchResult {
  productId: string;
  title: string;
  sku: string;
  imageUrl: string;
  brand: string;
}

type Step = 'search' | 'shipping';

const COMMON_SIZES = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'];

// Generate 8-char shipping code
const generateShippingCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export default function SendToBloomScreen() {
  const [step, setStep] = useState<Step>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<SearchResult | null>(null);
  const [selectedSize, setSelectedSize] = useState('10');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shippingCode, setShippingCode] = useState('');

  // Search products (same as add-from-home)
  const searchProducts = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const { data, error: searchError } = await supabase
        .from('assets')
        .select('id, name, stockx_sku, image_url, brand')
        .or(`name.ilike.%${query}%,stockx_sku.ilike.%${query}%`)
        .limit(5);

      if (searchError) throw searchError;

      const results: SearchResult[] = (data || []).map(item => ({
        productId: item.id,
        title: item.name,
        sku: item.stockx_sku || '',
        imageUrl: item.image_url || '',
        brand: item.brand || '',
      }));

      setSearchResults(results);
    } catch (e) {
      console.error('Search error:', e);
      setError('Search failed. Try adding manually.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectProduct = (product: SearchResult) => {
    setSelectedProduct(product);
    setSearchResults([]);
    setSearchQuery(product.title);
  };

  const handleContinue = () => {
    if (!selectedProduct && !manualName) {
      setError('Please select a product or enter details manually');
      return;
    }
    // Generate shipping code and move to shipping step
    setShippingCode(generateShippingCode());
    setStep('shipping');
  };

  const handleMarkShipped = async () => {
    if (!shippingCode) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const price = purchasePrice ? parseFloat(purchasePrice) : 0;

      const { data, error: rpcError } = await supabase.rpc('create_shipping_token', {
        p_sku: selectedProduct?.sku || null,
        p_product_name: selectedProduct?.title || manualName,
        p_size: selectedSize,
        p_product_image_url: selectedProduct?.imageUrl || null,
        p_purchase_price: price,
        p_shipping_code: shippingCode,
      });

      if (rpcError) throw rpcError;

      // Success - go back to wallet
      router.back();
    } catch (e: any) {
      console.error('Create shipping token error:', e);
      setError(e.message || 'Failed to create shipping token');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canContinue = selectedProduct || manualName;

  // Render search step
  if (step === 'search') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Send to Bloom</Text>
            <Pressable style={styles.closeButton} onPress={() => router.back()}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Search Section */}
            {!showManual && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>What are you sending?</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Jordan 4 Black Cat..."
                  placeholderTextColor={theme.textSecondary}
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    searchProducts(text);
                  }}
                  autoCapitalize="none"
                />

                {isSearching && (
                  <ActivityIndicator size="small" color={theme.accent} style={styles.searchLoader} />
                )}

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <View style={styles.searchResults}>
                    {searchResults.map((item) => (
                      <Pressable
                        key={item.productId}
                        style={styles.searchResultItem}
                        onPress={() => handleSelectProduct(item)}
                      >
                        {item.imageUrl ? (
                          <Image source={{ uri: item.imageUrl }} style={styles.resultImage} />
                        ) : (
                          <View style={[styles.resultImage, styles.resultImagePlaceholder]}>
                            <Text style={styles.resultImagePlaceholderText}>{item.title.charAt(0)}</Text>
                          </View>
                        )}
                        <View style={styles.resultInfo}>
                          <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                          <Text style={styles.resultSku}>{item.sku}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Manual Entry Link */}
                <Pressable style={styles.manualLink} onPress={() => setShowManual(true)}>
                  <Text style={styles.manualLinkText}>Can't find it? Add manually →</Text>
                </Pressable>
              </View>
            )}

            {/* Manual Entry Section */}
            {showManual && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Product Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nike Air Max 1..."
                  placeholderTextColor={theme.textSecondary}
                  value={manualName}
                  onChangeText={setManualName}
                />
                <Pressable style={styles.manualLink} onPress={() => {
                  setShowManual(false);
                  setManualName('');
                }}>
                  <Text style={styles.manualLinkText}>← Back to search</Text>
                </Pressable>
              </View>
            )}

            {/* Selected Product Preview */}
            {selectedProduct && (
              <View style={styles.selectedProduct}>
                {selectedProduct.imageUrl && (
                  <Image source={{ uri: selectedProduct.imageUrl }} style={styles.selectedImage} />
                )}
                <Text style={styles.selectedTitle}>{selectedProduct.title}</Text>
                <Text style={styles.selectedSku}>{selectedProduct.sku}</Text>
              </View>
            )}

            {/* Size Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Size</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sizeScroll}>
                {COMMON_SIZES.map((size) => (
                  <Pressable
                    key={size}
                    style={[styles.sizeButton, selectedSize === size && styles.sizeButtonActive]}
                    onPress={() => setSelectedSize(size)}
                  >
                    <Text style={[styles.sizeButtonText, selectedSize === size && styles.sizeButtonTextActive]}>
                      {size}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Purchase Price */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>What did you pay? (optional)</Text>
              <View style={styles.priceInputContainer}>
                <Text style={styles.priceCurrency}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  placeholder="337.20"
                  placeholderTextColor={theme.textSecondary}
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Error Message */}
            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            {/* Continue Button */}
            <Pressable
              style={[styles.submitButton, !canContinue && styles.submitButtonDisabled]}
              onPress={handleContinue}
              disabled={!canContinue}
            >
              <Text style={styles.submitButtonText}>Continue</Text>
            </Pressable>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Render shipping instructions step
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shipping Instructions</Text>
        <Pressable style={styles.closeButton} onPress={() => setStep('search')}>
          <Text style={styles.closeButtonText}>←</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Product Preview */}
        <View style={styles.shippingProductCard}>
          {selectedProduct?.imageUrl && (
            <Image source={{ uri: selectedProduct.imageUrl }} style={styles.shippingProductImage} />
          )}
          <Text style={styles.shippingProductName}>{selectedProduct?.title || manualName}</Text>
          <Text style={styles.shippingProductSize}>Size {selectedSize}</Text>
        </View>

        {/* Shipping Code */}
        <View style={styles.codeSection}>
          <Text style={styles.codeSectionLabel}>YOUR SHIPPING CODE</Text>
          <Text style={styles.shippingCode}>{shippingCode}</Text>
          <Text style={styles.codeInstruction}>
            Write this code on a piece of paper and include it inside the box
          </Text>
        </View>

        {/* Address Card */}
        <View style={styles.addressCard}>
          <Text style={styles.addressLabel}>SHIP TO</Text>
          <Text style={styles.addressName}>{BLOOM_ADDRESS.name}</Text>
          <Text style={styles.addressLine}>{BLOOM_ADDRESS.street}</Text>
          <Text style={styles.addressLine}>
            {BLOOM_ADDRESS.city}, {BLOOM_ADDRESS.state} {BLOOM_ADDRESS.zip}
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Shipping Tips</Text>
          <Text style={styles.instructionItem}>• Use the original box if you have it</Text>
          <Text style={styles.instructionItem}>• Double-box for extra protection</Text>
          <Text style={styles.instructionItem}>• We recommend using tracking</Text>
          <Text style={styles.instructionItem}>• Once received, your item will be verified and ready for instant resale</Text>
        </View>

        {/* Error Message */}
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        {/* Action Buttons */}
        <Pressable
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleMarkShipped}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={theme.textInverse} />
          ) : (
            <Text style={styles.submitButtonText}>Mark as Shipped</Text>
          )}
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: theme.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: theme.textSecondary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  searchLoader: {
    marginTop: 12,
  },
  searchResults: {
    marginTop: 8,
    backgroundColor: theme.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  resultImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFF',
  },
  resultImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultImagePlaceholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.accent,
  },
  resultInfo: {
    flex: 1,
    marginLeft: 12,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  resultSku: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  manualLink: {
    marginTop: 12,
  },
  manualLinkText: {
    fontSize: 14,
    color: theme.accent,
  },
  selectedProduct: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.card,
    borderRadius: 16,
    marginBottom: 24,
  },
  selectedImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#FFF',
    marginBottom: 12,
  },
  selectedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
  },
  selectedSku: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 4,
  },
  sizeScroll: {
    marginHorizontal: -4,
  },
  sizeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  sizeButtonActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  sizeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  sizeButtonTextActive: {
    color: theme.textInverse,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  priceCurrency: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.textPrimary,
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  errorText: {
    fontSize: 14,
    color: theme.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textInverse,
  },
  cancelButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  bottomSpacer: {
    height: 40,
  },
  // Shipping instructions styles
  shippingProductCard: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: theme.card,
    borderRadius: 16,
    marginBottom: 20,
  },
  shippingProductImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#FFF',
    marginBottom: 12,
  },
  shippingProductName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
  },
  shippingProductSize: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
  },
  codeSection: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: theme.accent,
    borderRadius: 16,
    marginBottom: 20,
  },
  codeSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(0, 0, 0, 0.5)',
    letterSpacing: 1,
    marginBottom: 8,
  },
  shippingCode: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: theme.textInverse,
    letterSpacing: 4,
    marginBottom: 8,
  },
  codeInstruction: {
    fontSize: 13,
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    lineHeight: 18,
  },
  addressCard: {
    padding: 20,
    backgroundColor: theme.card,
    borderRadius: 16,
    marginBottom: 20,
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  addressName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  addressLine: {
    fontSize: 16,
    color: theme.textPrimary,
    lineHeight: 24,
  },
  instructionsCard: {
    padding: 20,
    backgroundColor: theme.card,
    borderRadius: 16,
    marginBottom: 24,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 12,
  },
  instructionItem: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 22,
  },
});
