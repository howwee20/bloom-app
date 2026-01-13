// Order Confirmation Screen - Minimal, Coinbase-style
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';

const MARKETPLACE_LABELS: Record<string, string> = {
  stockx: 'StockX',
  goat: 'GOAT',
  ebay: 'eBay',
  bloom: 'Bloom',
};

export default function ConfirmOrderScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{
    asset_id: string;
    asset_name: string;
    asset_image: string;
    size: string;
    price: string;
    lane?: string;
    marketplace?: string;
  }>();

  const [processing, setProcessing] = useState(false);
  const normalizedLane = params.lane === 'a' ? 'a' : 'b';
  const isShipToMe = normalizedLane === 'a';
  const normalizedMarketplace = (params.marketplace || 'stockx').toLowerCase();
  const marketplaceLabel = MARKETPLACE_LABELS[normalizedMarketplace] || normalizedMarketplace.toUpperCase();
  const [shippingName, setShippingName] = useState('');
  const [shippingLine1, setShippingLine1] = useState('');
  const [shippingLine2, setShippingLine2] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingZip, setShippingZip] = useState('');

  const formatPrice = (price: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(parseFloat(price));
  };

  const handlePay = async () => {
    if (!session) {
      Alert.alert('Error', 'You must be logged in to purchase.');
      return;
    }
    if (!params.asset_id) {
      Alert.alert('Error', 'This item is not ready for checkout yet.');
      return;
    }

    if (isShipToMe) {
      if (!shippingName.trim() || !shippingLine1.trim() || !shippingCity.trim() || !shippingState.trim() || !shippingZip.trim()) {
        Alert.alert('Missing address', 'Enter your shipping details to continue.');
        return;
      }
    }

    try {
      setProcessing(true);

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            asset_id: params.asset_id,
            size: params.size,
            lane: normalizedLane,
            marketplace: normalizedMarketplace,
            shipping_name: isShipToMe ? shippingName.trim() : null,
            shipping_address_line1: isShipToMe ? shippingLine1.trim() : null,
            shipping_address_line2: isShipToMe && shippingLine2.trim() ? shippingLine2.trim() : null,
            shipping_city: isShipToMe ? shippingCity.trim() : null,
            shipping_state: isShipToMe ? shippingState.trim() : null,
            shipping_zip: isShipToMe ? shippingZip.trim() : null,
            shipping_country: isShipToMe ? 'US' : null,
            success_url: 'https://bloom.app/checkout/success',
            cancel_url: 'https://bloom.app/checkout/cancel',
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create checkout');
      }

      if (result.url) {
        await Linking.openURL(result.url);
        Alert.alert(
          'Complete Payment',
          'Complete the payment in your browser.',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
      }
    } catch (e: any) {
      console.error('Checkout failed:', e);
      Alert.alert('Checkout Failed', e.message || 'Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Confirm</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Product Image */}
        <View style={styles.imageContainer}>
          {params.asset_image ? (
            <Image
              source={{ uri: params.asset_image }}
              style={styles.productImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{params.asset_name?.charAt(0)}</Text>
            </View>
          )}
        </View>

        {/* Product Info */}
        <Text style={styles.productName}>{params.asset_name}</Text>
        <Text style={styles.productSize}>Size {params.size}</Text>
        <Text style={styles.marketplaceInfo}>Executed on {marketplaceLabel}</Text>

        {/* Price - Hero */}
        <Text style={styles.price}>{formatPrice(params.price)}</Text>

        {/* Delivery Info */}
        <Text style={styles.deliveryInfo}>
          {isShipToMe ? 'Ships to you in 5-7 days' : 'Ships to Bloom in 5-7 days'}
        </Text>

        {/* Options */}
        <Text style={styles.options}>Bloom handles purchase + tracking</Text>

        {isShipToMe && (
          <View style={styles.shippingSection}>
            <Text style={styles.shippingTitle}>Shipping address</Text>
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={theme.textTertiary}
              value={shippingName}
              onChangeText={setShippingName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Address line 1"
              placeholderTextColor={theme.textTertiary}
              value={shippingLine1}
              onChangeText={setShippingLine1}
            />
            <TextInput
              style={styles.input}
              placeholder="Address line 2 (optional)"
              placeholderTextColor={theme.textTertiary}
              value={shippingLine2}
              onChangeText={setShippingLine2}
            />
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.inputHalf]}
                placeholder="City"
                placeholderTextColor={theme.textTertiary}
                value={shippingCity}
                onChangeText={setShippingCity}
              />
              <TextInput
                style={[styles.input, styles.inputQuarter]}
                placeholder="State"
                placeholderTextColor={theme.textTertiary}
                value={shippingState}
                onChangeText={setShippingState}
                autoCapitalize="characters"
              />
              <TextInput
                style={[styles.input, styles.inputQuarter]}
                placeholder="ZIP"
                placeholderTextColor={theme.textTertiary}
                value={shippingZip}
                onChangeText={setShippingZip}
                keyboardType="number-pad"
              />
            </View>
          </View>
        )}

        {/* Terms */}
        <Text style={styles.terms}>
          By purchasing, you agree to Bloom's Terms.
        </Text>
      </ScrollView>

      {/* Pay Button */}
      <View style={styles.actionContainer}>
        <Pressable
          style={[styles.payButton, processing && styles.payButtonDisabled]}
          onPress={handlePay}
          disabled={processing}
        >
          <Text style={styles.payButtonText}>
            {processing ? 'Processing...' : `Pay ${formatPrice(params.price)}`}
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
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
  },
  imageContainer: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  productImage: {
    width: 140,
    height: 140,
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 40,
    color: theme.accent,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  productSize: {
    fontSize: 15,
    color: theme.textSecondary,
    marginBottom: 24,
  },
  marketplaceInfo: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  price: {
    fontFamily: fonts.heading,
    fontSize: 44,
    color: theme.textPrimary,
    marginBottom: 16,
  },
  deliveryInfo: {
    fontSize: 15,
    color: theme.success,
    fontWeight: '500',
    marginBottom: 8,
  },
  options: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 32,
  },
  shippingSection: {
    width: '100%',
    marginTop: 8,
    marginBottom: 16,
  },
  shippingTitle: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    width: '100%',
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.textPrimary,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  inputHalf: {
    flex: 1.2,
  },
  inputQuarter: {
    flex: 0.6,
  },
  terms: {
    fontSize: 12,
    color: theme.textTertiary,
    textAlign: 'center',
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  payButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payButtonDisabled: {
    backgroundColor: theme.card,
  },
  payButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
});
