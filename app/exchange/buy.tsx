// Buy Token Screen - Purchase a token from another user
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';

interface ListingDetail {
  id: string;
  seller_id: string;
  sku: string;
  product_name: string;
  size: string;
  product_image_url: string | null;
  listing_price: number;
  listed_at: string;
  current_value: number;
}

export default function BuyTokenScreen() {
  const { listing_id } = useLocalSearchParams<{ listing_id: string }>();
  const { session } = useAuth();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [imageError, setImageError] = useState(false);

  const fetchListing = useCallback(async () => {
    if (!listing_id || !session) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_listing_detail', {
        p_token_id: listing_id,
      });

      if (!error && data && data.length > 0) {
        setListing(data[0]);
      }
    } catch (e) {
      console.error('Error fetching listing:', e);
    } finally {
      setLoading(false);
    }
  }, [listing_id, session]);

  useFocusEffect(
    useCallback(() => {
      fetchListing();
    }, [fetchListing])
  );

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
  };

  const handlePurchase = async () => {
    if (!session || !listing) return;

    try {
      setPurchasing(true);

      // Call buy-token edge function
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/buy-token`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token_id: listing.id,
            success_url: 'https://bloom.app/exchange/success',
            cancel_url: 'https://bloom.app/exchange/cancel',
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create checkout');
      }

      if (result.url) {
        // Open Stripe checkout in browser
        await Linking.openURL(result.url);

        // Show confirmation and navigate back
        Alert.alert(
          'Complete Payment',
          'A payment page has opened in your browser. Complete the payment to finalize your purchase.',
          [
            {
              text: 'OK',
              onPress: () => {
                router.replace('/(tabs)/exchange');
              },
            },
          ]
        );
      }
    } catch (e: any) {
      console.error('Purchase failed:', e);
      Alert.alert('Purchase Failed', e.message || 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  // Calculate fees
  const platformFee = listing ? listing.listing_price * 0.03 : 0;
  const totalPrice = listing ? listing.listing_price + platformFee : 0;
  const savings = listing && listing.current_value ? listing.current_value - listing.listing_price : 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Buy Token</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Buy Token</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Listing not found</Text>
          <Text style={styles.errorSubtext}>This token may have already been sold.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Buy Token</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Product Card */}
        <View style={styles.productCard}>
          {listing.product_image_url && !imageError ? (
            <Image
              source={{ uri: listing.product_image_url }}
              style={styles.productImage}
              resizeMode="contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{listing.product_name.charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.productName}>{listing.product_name}</Text>
          <Text style={styles.productSize}>Size {listing.size}</Text>
        </View>

        {/* Instant Badge */}
        <View style={styles.instantSection}>
          <View style={styles.instantBadge}>
            <View style={styles.instantDot} />
            <Text style={styles.instantText}>Instant Transfer</Text>
          </View>
          <Text style={styles.instantDescription}>
            This token transfers to your wallet immediately upon purchase. The physical item remains securely in Bloom's vault.
          </Text>
        </View>

        {/* Savings Badge */}
        {savings > 0 && (
          <View style={styles.savingsCard}>
            <Text style={styles.savingsTitle}>You're Saving</Text>
            <Text style={styles.savingsAmount}>{formatPrice(savings)}</Text>
            <Text style={styles.savingsNote}>
              vs market price of {formatPrice(listing.current_value)}
            </Text>
          </View>
        )}

        {/* Price Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Token Price</Text>
              <Text style={styles.summaryValue}>{formatPrice(listing.listing_price)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Platform Fee (3%)</Text>
              <Text style={styles.summaryValue}>{formatPrice(platformFee)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabelBold}>Total</Text>
              <Text style={styles.summaryValueBold}>{formatPrice(totalPrice)}</Text>
            </View>
          </View>
        </View>

        {/* What you're getting */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What You're Getting</Text>
          <View style={styles.optionsCard}>
            <View style={styles.optionRow}>
              <Text style={styles.optionIcon}>🏦</Text>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Verified Ownership</Text>
                <Text style={styles.optionDesc}>Token representing authenticated item in vault</Text>
              </View>
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionIcon}>🔄</Text>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Instant Trading</Text>
                <Text style={styles.optionDesc}>Resell immediately on the exchange</Text>
              </View>
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionIcon}>📦</Text>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Physical Redemption</Text>
                <Text style={styles.optionDesc}>Ship the item to you anytime</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Terms */}
        <Text style={styles.termsText}>
          By purchasing, you agree to Bloom's Terms of Service. Token transfers are instant and final.
        </Text>
      </ScrollView>

      {/* Buy Button */}
      <View style={styles.actionContainer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatPrice(totalPrice)}</Text>
        </View>
        <Pressable
          style={[styles.buyButton, purchasing && styles.buyButtonDisabled]}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          <Text style={styles.buyButtonText}>
            {purchasing ? 'Processing...' : 'Buy Now'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
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
    fontSize: 14,
    color: theme.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 180,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  productCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  productImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#FFF',
    marginBottom: 12,
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: theme.accent,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  productSize: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  instantSection: {
    backgroundColor: theme.successBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  instantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  instantDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.success,
  },
  instantText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.success,
  },
  instantDescription: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  savingsCard: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  savingsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  savingsAmount: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: '#FFF',
    marginBottom: 4,
  },
  savingsNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 11,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summaryCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: theme.textSecondary,
  },
  summaryValue: {
    fontSize: 15,
    color: theme.textPrimary,
  },
  summaryLabelBold: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  summaryValueBold: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 8,
  },
  optionsCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  termsText: {
    fontSize: 12,
    color: theme.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  totalValue: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: theme.textPrimary,
  },
  buyButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: theme.card,
  },
  buyButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
});
