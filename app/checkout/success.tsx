// Post-Payment Success Screen - Ownership-first model
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';

interface LatestOrder {
  id: string;
  status: string;
  amount_cents: number;
  created_at: string;
  sku: string;
  product_name: string;
  size: string;
  product_image_url: string | null;
}

export default function CheckoutSuccessScreen() {
  const { session } = useAuth();
  const [order, setOrder] = useState<LatestOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const fetchLatestOrder = useCallback(async () => {
    if (!session) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_latest_user_order');

      if (!error && data && data.length > 0) {
        setOrder(data[0]);
      }
    } catch (e) {
      console.error('Error fetching order:', e);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchLatestOrder();
    }, [fetchLatestOrder])
  );

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(cents / 100);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.successIcon}>
            <Text style={styles.checkmark}>?</Text>
          </View>
          <Text style={styles.title}>Order Not Found</Text>
          <Text style={styles.subtitle}>
            We couldn't find your recent order. Please check your portfolio.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.primaryButtonText}>View Bloom</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.successIcon}>
          <Text style={styles.checkmark}>✓</Text>
        </View>

        {/* Title - Ownership messaging */}
        <Text style={styles.title}>You Own It</Text>
        <Text style={styles.subtitle}>Your ownership token is now in your portfolio</Text>

        {/* Product Card */}
        <View style={styles.productCard}>
          {order.product_image_url && !imageError ? (
            <Image
              source={{ uri: order.product_image_url }}
              style={styles.productImage}
              resizeMode="contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{order.product_name?.charAt(0) || '?'}</Text>
            </View>
          )}
          <Text style={styles.productName} numberOfLines={2}>{order.product_name}</Text>
          <Text style={styles.productDetails}>Size {order.size} · {formatPrice(order.amount_cents)}</Text>
        </View>

        {/* What's Next Card */}
        <View style={styles.nextCard}>
          <Text style={styles.nextTitle}>What's Next</Text>
          <Text style={styles.nextDescription}>
            We're acquiring your item now. Once it's in our custody and verified, you can:
          </Text>
          <View style={styles.optionsList}>
            <View style={styles.optionRow}>
              <Text style={styles.optionIcon}>💰</Text>
              <Text style={styles.optionText}>Hold and track its value</Text>
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionIcon}>🔄</Text>
              <Text style={styles.optionText}>Sell instantly on the exchange</Text>
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionIcon}>📦</Text>
              <Text style={styles.optionText}>Ship to yourself anytime</Text>
            </View>
          </View>
          <Text style={styles.deliveryTime}>Expected in custody: 5-7 business days</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.primaryButtonText}>View in Bloom</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.replace('/(tabs)/exchange')}
          >
            <Text style={styles.secondaryButtonText}>Continue Browsing</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  checkmark: {
    fontSize: 40,
    color: theme.success,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: theme.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  productCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  productImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
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
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  productDetails: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  nextCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginBottom: 24,
  },
  nextTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  nextDescription: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  optionsList: {
    gap: 8,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  optionText: {
    fontSize: 14,
    color: theme.textPrimary,
  },
  deliveryTime: {
    fontSize: 13,
    color: theme.textTertiary,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
  secondaryButton: {
    backgroundColor: theme.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
  },
});
