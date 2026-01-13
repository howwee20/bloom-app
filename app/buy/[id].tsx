// Buy Detail Screen - Wizard-of-Oz Flow
// Single coherent flow: Size → Route → Address → Confirm
import { router, useLocalSearchParams, Stack } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { theme, fonts } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import {
  getBuyQuote,
  calculateMaxTotal,
  formatPrice,
  formatPriceWithCents,
  getMarketplaceLabel,
  Quote,
} from '../../lib/quote';

// Available shoe sizes
const AVAILABLE_SIZES = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'];

type Route = 'home' | 'bloom';

interface ShippingAddress {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
}

export default function BuyDetailScreen() {
  const { id, name, style_code, image_url, brand } = useLocalSearchParams<{
    id: string;
    name: string;
    style_code: string;
    image_url: string;
    brand: string;
  }>();
  const { session } = useAuth();

  // State
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Shipping address
  const [address, setAddress] = useState<ShippingAddress>({
    name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    phone: '',
  });

  // Fetch quote on mount
  const fetchQuote = useCallback(async () => {
    if (!style_code) return;
    setQuoteLoading(true);
    const q = await getBuyQuote(style_code);
    setQuote(q);
    setQuoteLoading(false);
  }, [style_code]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  // Computed values
  const maxTotal = quote?.total ? calculateMaxTotal(quote.total) : 0;
  const canSubmit = selectedSize && selectedRoute && quote?.available && !submitting &&
    (selectedRoute === 'bloom' || (address.name && address.line1 && address.city && address.state && address.zip));

  // Submit order intent
  const handleSubmit = async () => {
    if (!canSubmit || !session || !quote) return;

    setSubmitting(true);
    try {
      const orderData = {
        user_id: session.user.id,
        catalog_item_id: id || null,
        shoe_id: style_code || '',
        shoe_name: name || '',
        style_code: style_code || '',
        image_url: image_url || null,
        size: selectedSize,
        route: selectedRoute,
        quoted_marketplace: quote.marketplace || 'stockx',
        quoted_price: quote.price || null,
        quoted_fees: quote.fees || null,
        quoted_shipping: quote.shipping || null,
        quoted_total: quote.total || null,
        max_total: maxTotal,
        shipping_address: selectedRoute === 'home' ? {
          name: address.name.trim(),
          line1: address.line1.trim(),
          line2: address.line2.trim() || null,
          city: address.city.trim(),
          state: address.state.trim().toUpperCase(),
          zip: address.zip.trim(),
          country: 'US',
          phone: address.phone.trim() || null,
        } : null,
        email: session.user.email || null,
        status: 'pending',
      };

      const { data, error } = await supabase
        .from('order_intents')
        .insert(orderData)
        .select('id')
        .single();

      if (error) throw error;

      setCreatedOrderId(data.id);
      setShowSuccess(true);

      // Try to send Slack notification (fire and forget)
      try {
        await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-order-intent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            order_id: data.id,
            shoe_name: name,
            style_code: style_code,
            size: selectedSize,
            route: selectedRoute,
            quoted_total: quote.total,
            max_total: maxTotal,
            email: session.user.email,
          }),
        });
      } catch (slackErr) {
        // Ignore Slack errors - order was created successfully
        console.log('Slack notification skipped:', slackErr);
      }
    } catch (e: any) {
      console.error('Order intent error:', e);
      Alert.alert('Error', e.message || 'Failed to submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Success screen
  if (showSuccess) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Order Requested!</Text>
            <Text style={styles.successSubtitle}>
              We'll execute your purchase and keep you updated.
            </Text>

            <View style={styles.successCard}>
              {image_url && !imageError ? (
                <Image source={{ uri: image_url }} style={styles.successImage} resizeMode="contain" />
              ) : (
                <View style={[styles.successImage, styles.placeholderImage]}>
                  <Text style={styles.placeholderText}>{name?.charAt(0)}</Text>
                </View>
              )}
              <Text style={styles.successProductName} numberOfLines={2}>{name}</Text>
              <Text style={styles.successProductMeta}>Size {selectedSize} • {selectedRoute === 'bloom' ? 'Ship to Bloom' : 'Ship to me'}</Text>
              <Text style={styles.successTotal}>Est. {formatPriceWithCents(quote?.total || 0)}</Text>
            </View>

            <View style={styles.successActions}>
              <Pressable
                style={styles.successButtonPrimary}
                onPress={() => router.replace('/orders')}
              >
                <Text style={styles.successButtonPrimaryText}>View Orders</Text>
              </Pressable>
              <Pressable
                style={styles.successButtonSecondary}
                onPress={() => router.replace('/(tabs)')}
              >
                <Text style={styles.successButtonSecondaryText}>Back to Home</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backArrow}>←</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Buy</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Product Card */}
            <View style={styles.productCard}>
              {image_url && !imageError ? (
                <Image
                  source={{ uri: image_url }}
                  style={styles.productImage}
                  resizeMode="contain"
                  onError={() => setImageError(true)}
                />
              ) : (
                <View style={[styles.productImage, styles.placeholderImage]}>
                  <Text style={styles.placeholderText}>{name?.charAt(0) || '?'}</Text>
                </View>
              )}
              <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={2}>{name}</Text>
                <Text style={styles.styleCode}>{style_code}</Text>
              </View>
            </View>

            {/* Price / Quote */}
            <View style={styles.quoteSection}>
              {quoteLoading ? (
                <View style={styles.quoteLoading}>
                  <ActivityIndicator size="small" color={theme.accent} />
                  <Text style={styles.quoteLoadingText}>Loading price...</Text>
                </View>
              ) : quote?.available ? (
                <>
                  <Text style={styles.quoteLabel}>Est. Total</Text>
                  <Text style={styles.quotePrice}>{formatPrice(quote.total)}</Text>
                  <Text style={styles.quoteMarketplace}>via {getMarketplaceLabel(quote.marketplace)}</Text>
                </>
              ) : (
                <View style={styles.quoteUnavailable}>
                  <Text style={styles.quoteUnavailableText}>{quote?.reasonUnavailable || 'Updating prices...'}</Text>
                  <Pressable onPress={fetchQuote} style={styles.refreshButton}>
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Step 1: Size */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>1. Select Size</Text>
              <View style={styles.sizeGrid}>
                {AVAILABLE_SIZES.map((size) => (
                  <Pressable
                    key={size}
                    style={[
                      styles.sizeButton,
                      selectedSize === size && styles.sizeButtonSelected,
                    ]}
                    onPress={() => setSelectedSize(size)}
                  >
                    <Text
                      style={[
                        styles.sizeButtonText,
                        selectedSize === size && styles.sizeButtonTextSelected,
                      ]}
                    >
                      {size}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Step 2: Route */}
            {selectedSize && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>2. Destination</Text>

                {/* Ship to me */}
                <Pressable
                  style={[
                    styles.routeOption,
                    selectedRoute === 'home' && styles.routeOptionSelected,
                  ]}
                  onPress={() => setSelectedRoute('home')}
                >
                  <View style={styles.routeOptionHeader}>
                    <Text style={styles.routeOptionTitle}>Ship to me</Text>
                    <View style={[styles.routeRadio, selectedRoute === 'home' && styles.routeRadioSelected]}>
                      {selectedRoute === 'home' && <View style={styles.routeRadioInner} />}
                    </View>
                  </View>
                  <Text style={styles.routeOptionDesc}>Bloom executes the best marketplace</Text>
                  {quote?.available && (
                    <Text style={styles.routeOptionQuote}>
                      Est. {formatPriceWithCents(quote.total || 0)} • {getMarketplaceLabel(quote.marketplace)}
                    </Text>
                  )}
                </Pressable>

                {/* Ship to Bloom */}
                <Pressable
                  style={[
                    styles.routeOption,
                    styles.routeOptionPrimary,
                    selectedRoute === 'bloom' && styles.routeOptionSelected,
                  ]}
                  onPress={() => setSelectedRoute('bloom')}
                >
                  <View style={styles.routeOptionHeader}>
                    <Text style={styles.routeOptionTitle}>Ship to Bloom</Text>
                    <View style={[styles.routeRadio, selectedRoute === 'bloom' && styles.routeRadioSelected]}>
                      {selectedRoute === 'bloom' && <View style={styles.routeRadioInner} />}
                    </View>
                  </View>
                  <Text style={styles.routeOptionDesc}>Bloom custody, verified on arrival</Text>
                  {quote?.available && (
                    <Text style={styles.routeOptionQuote}>
                      Est. {formatPriceWithCents(quote.total || 0)} • {getMarketplaceLabel(quote.marketplace)}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}

            {/* Step 3: Address (for Ship to me) */}
            {selectedRoute === 'home' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>3. Shipping Address</Text>
                <View style={styles.addressForm}>
                  <TextInput
                    style={styles.input}
                    placeholder="Full name"
                    placeholderTextColor={theme.textTertiary}
                    value={address.name}
                    onChangeText={(v) => setAddress({ ...address, name: v })}
                    autoCapitalize="words"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Address line 1"
                    placeholderTextColor={theme.textTertiary}
                    value={address.line1}
                    onChangeText={(v) => setAddress({ ...address, line1: v })}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Address line 2 (optional)"
                    placeholderTextColor={theme.textTertiary}
                    value={address.line2}
                    onChangeText={(v) => setAddress({ ...address, line2: v })}
                  />
                  <View style={styles.inputRow}>
                    <TextInput
                      style={[styles.input, styles.inputCity]}
                      placeholder="City"
                      placeholderTextColor={theme.textTertiary}
                      value={address.city}
                      onChangeText={(v) => setAddress({ ...address, city: v })}
                    />
                    <TextInput
                      style={[styles.input, styles.inputState]}
                      placeholder="State"
                      placeholderTextColor={theme.textTertiary}
                      value={address.state}
                      onChangeText={(v) => setAddress({ ...address, state: v })}
                      autoCapitalize="characters"
                      maxLength={2}
                    />
                    <TextInput
                      style={[styles.input, styles.inputZip]}
                      placeholder="ZIP"
                      placeholderTextColor={theme.textTertiary}
                      value={address.zip}
                      onChangeText={(v) => setAddress({ ...address, zip: v })}
                      keyboardType="number-pad"
                      maxLength={5}
                    />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Phone (optional)"
                    placeholderTextColor={theme.textTertiary}
                    value={address.phone}
                    onChangeText={(v) => setAddress({ ...address, phone: v })}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            )}

            {/* Step 4: Approval */}
            {selectedRoute && quote?.available && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {selectedRoute === 'home' ? '4. Confirm Order' : '3. Confirm Order'}
                </Text>

                <View style={styles.summaryCard}>
                  {quote.lineItems?.map((item, idx) => (
                    <View key={idx} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{item.label}</Text>
                      <Text style={styles.summaryValue}>{formatPriceWithCents(item.amount)}</Text>
                    </View>
                  ))}
                  <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                    <Text style={styles.summaryLabelTotal}>Est. Total</Text>
                    <Text style={styles.summaryValueTotal}>{formatPriceWithCents(quote.total || 0)}</Text>
                  </View>
                </View>

                <View style={styles.maxTotalCard}>
                  <Text style={styles.maxTotalLabel}>Max you approve</Text>
                  <Text style={styles.maxTotalValue}>{formatPriceWithCents(maxTotal)}</Text>
                  <Text style={styles.maxTotalHint}>
                    Covers small price fluctuations. You won't be charged more than this.
                  </Text>
                </View>

                <Text style={styles.termsText}>
                  By confirming, you authorize Bloom to execute this purchase up to the max amount.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Submit Button */}
          <View style={styles.actionContainer}>
            <Pressable
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={theme.textInverse} />
              ) : (
                <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
                  {!selectedSize
                    ? 'Select Size'
                    : !selectedRoute
                    ? 'Select Destination'
                    : !quote?.available
                    ? 'Updating prices...'
                    : selectedRoute === 'home' && (!address.name || !address.line1 || !address.city || !address.state || !address.zip)
                    ? 'Enter Address'
                    : `Confirm • Est. ${formatPrice(quote?.total || 0)}`}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.background,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 24,
    color: theme.accent,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: theme.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#FFF',
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: theme.accent,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  styleCode: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  quoteSection: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 16,
  },
  quoteLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quoteLoadingText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  quoteLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  quotePrice: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: theme.textPrimary,
  },
  quoteMarketplace: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 4,
  },
  quoteUnavailable: {
    alignItems: 'center',
    gap: 8,
  },
  quoteUnavailableText: {
    fontSize: 14,
    color: theme.warning,
    fontWeight: '500',
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  refreshButtonText: {
    fontSize: 13,
    color: theme.accent,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    fontWeight: '600',
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sizeButton: {
    width: '22%',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  sizeButtonSelected: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  sizeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  sizeButtonTextSelected: {
    color: theme.textInverse,
  },
  routeOption: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: theme.border,
  },
  routeOptionPrimary: {
    backgroundColor: theme.accentLight || 'rgba(245, 196, 154, 0.15)',
  },
  routeOptionSelected: {
    borderColor: theme.accent,
  },
  routeOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  routeOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  routeRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeRadioSelected: {
    borderColor: theme.accent,
  },
  routeRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.accent,
  },
  routeOptionDesc: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  routeOptionQuote: {
    fontSize: 12,
    color: theme.accent,
    fontWeight: '500',
  },
  addressForm: {
    gap: 8,
  },
  input: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.textPrimary,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputCity: {
    flex: 1.4,
  },
  inputState: {
    flex: 0.6,
  },
  inputZip: {
    flex: 0.8,
  },
  summaryCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryRowTotal: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: 8,
    paddingTop: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: theme.textPrimary,
    fontWeight: '500',
  },
  summaryLabelTotal: {
    fontSize: 15,
    color: theme.textPrimary,
    fontWeight: '600',
  },
  summaryValueTotal: {
    fontSize: 15,
    color: theme.textPrimary,
    fontWeight: '700',
  },
  maxTotalCard: {
    backgroundColor: theme.warningBg || 'rgba(245, 166, 35, 0.1)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.warning,
  },
  maxTotalLabel: {
    fontSize: 12,
    color: theme.warning,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: '600',
  },
  maxTotalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  maxTotalHint: {
    fontSize: 12,
    color: theme.textSecondary,
    lineHeight: 16,
  },
  termsText: {
    fontSize: 12,
    color: theme.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  submitButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  submitButtonDisabled: {
    backgroundColor: theme.card,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
  submitButtonTextDisabled: {
    color: theme.textSecondary,
  },
  // Success screen styles
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIconText: {
    fontSize: 32,
    color: '#FFF',
    fontWeight: '700',
  },
  successTitle: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: theme.textPrimary,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  successCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  successImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#FFF',
  },
  successProductName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  successProductMeta: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 8,
  },
  successTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.accent,
  },
  successActions: {
    width: '100%',
    gap: 12,
  },
  successButtonPrimary: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  successButtonPrimaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
  successButtonSecondary: {
    backgroundColor: theme.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  successButtonSecondaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textSecondary,
  },
});
