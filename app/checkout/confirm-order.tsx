// Order Confirmation Screen - Minimal, Coinbase-style
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';

export default function ConfirmOrderScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{
    asset_id: string;
    asset_name: string;
    asset_image: string;
    size: string;
    price: string;
    custody_status: string;
  }>();

  const [processing, setProcessing] = useState(false);
  const isInstant = params.custody_status === 'in_vault';

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
      <View style={styles.content}>
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

        {/* Price - Hero */}
        <Text style={styles.price}>{formatPrice(params.price)}</Text>

        {/* Delivery Info */}
        <Text style={styles.deliveryInfo}>
          {isInstant ? 'Instant transfer in Bloom custody' : 'Ships to Bloom in 5-7 days'}
        </Text>

        {/* Options */}
        <Text style={styles.options}>Hold · Transfer · Ship anytime</Text>

        {/* Terms */}
        <Text style={styles.terms}>
          By purchasing, you agree to Bloom's Terms.
        </Text>
      </View>

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
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
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
