// Order Detail/Receipt Screen - View full order details and status
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
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

interface OrderDetail {
  id: string;
  status: string;
  lane: 'a' | 'b' | null;
  amount_cents: number;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  delivered_at: string | null;
  sku: string;
  product_name: string;
  size: string;
  product_image_url: string | null;
  shipping_name: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  token_id: string | null;
  token_status: string | null;
  user_email: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Pending Payment', color: theme.warning, bg: theme.warningBg },
  paid: { label: 'Processing', color: theme.warning, bg: theme.warningBg },
  fulfilling: { label: 'Purchasing', color: theme.warning, bg: theme.warningBg },
  shipped: { label: 'Shipped', color: '#3498DB', bg: '#1A2634' },
  delivered: { label: 'Delivered', color: theme.success, bg: theme.successBg },
  verified: { label: 'Verified', color: theme.success, bg: theme.successBg },
  complete: { label: 'Complete', color: theme.success, bg: theme.successBg },
  cancelled: { label: 'Cancelled', color: theme.error, bg: theme.errorBg },
  refunded: { label: 'Refunded', color: theme.textSecondary, bg: theme.card },
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!id || !session) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_order_detail', { p_order_id: id });

      if (!error && data && data.length > 0) {
        setOrder(data[0]);
      }
    } catch (e) {
      console.error('Error fetching order:', e);
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useFocusEffect(
    useCallback(() => {
      fetchOrder();
    }, [fetchOrder])
  );

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatOrderNumber = (orderId: string) => {
    return `BLM-${orderId.slice(0, 8).toUpperCase()}`;
  };

  const handleTrackingPress = () => {
    if (!order?.tracking_number) return;

    let url = '';
    const carrier = (order.tracking_carrier || '').toLowerCase();

    if (carrier.includes('ups')) {
      url = `https://www.ups.com/track?tracknum=${order.tracking_number}`;
    } else if (carrier.includes('fedex')) {
      url = `https://www.fedex.com/fedextrack/?trknbr=${order.tracking_number}`;
    } else if (carrier.includes('usps')) {
      url = `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${order.tracking_number}`;
    } else {
      url = `https://www.google.com/search?q=${order.tracking_number}+tracking`;
    }

    Linking.openURL(url);
  };

  const getTimelineSteps = () => {
    if (!order) return [];

    const steps = [
      {
        label: 'Order placed',
        date: order.created_at ? formatDateTime(order.created_at) : null,
        completed: true,
      },
      {
        label: 'Payment confirmed',
        date: order.paid_at ? formatDateTime(order.paid_at) : null,
        completed: !!order.paid_at,
      },
      {
        label: 'Shipped',
        date: order.fulfilled_at ? formatDateTime(order.fulfilled_at) : null,
        completed: ['shipped', 'delivered', 'verified', 'complete'].includes(order.status),
      },
      {
        label: 'Delivered',
        date: order.delivered_at ? formatDateTime(order.delivered_at) : null,
        completed: ['delivered', 'verified', 'complete'].includes(order.status),
      },
    ];

    // Verified in vault step (all orders are now vault custody)
    steps.push({
      label: 'Verified in Vault',
      date: order.token_status === 'active' ? 'Complete' : null,
      completed: order.token_status === 'active',
    });

    return steps;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Order Details</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Order Details</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = STATUS_CONFIG[order.status] || {
    label: order.status,
    color: theme.textSecondary,
    bg: theme.card
  };
  const timelineSteps = getTimelineSteps();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Header */}
        <View style={styles.orderHeader}>
          <Text style={styles.orderNumber}>{formatOrderNumber(order.id)}</Text>
          <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

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
          <Text style={styles.productName}>{order.product_name}</Text>
          <Text style={styles.productSize}>Size {order.size}</Text>
        </View>

        {/* Custody Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CUSTODY</Text>
          <View style={styles.deliveryCard}>
            <Text style={styles.deliveryType}>Bloom Vault</Text>
            <Text style={styles.deliveryDescription}>
              Securely stored, exchange eligible
            </Text>
          </View>
        </View>

        {/* Order Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ORDER TIMELINE</Text>
          <View style={styles.timeline}>
            {timelineSteps.map((step, index) => (
              <View key={step.label} style={styles.timelineStep}>
                <View style={styles.timelineIndicator}>
                  <View style={[
                    styles.timelineDot,
                    step.completed ? styles.timelineDotCompleted : styles.timelineDotPending
                  ]} />
                  {index < timelineSteps.length - 1 && (
                    <View style={[
                      styles.timelineLine,
                      step.completed ? styles.timelineLineCompleted : styles.timelineLinePending
                    ]} />
                  )}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={[
                    styles.timelineLabel,
                    step.completed && styles.timelineLabelCompleted
                  ]}>
                    {step.label}
                  </Text>
                  <Text style={styles.timelineDate}>
                    {step.date || 'Pending'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Tracking Section */}
        {order.tracking_number && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TRACKING</Text>
            <Pressable style={styles.trackingCard} onPress={handleTrackingPress}>
              <View>
                <Text style={styles.trackingCarrier}>
                  {order.tracking_carrier || 'Carrier'}
                </Text>
                <Text style={styles.trackingNumber}>{order.tracking_number}</Text>
              </View>
              <Text style={styles.trackingLink}>Track</Text>
            </Pressable>
          </View>
        )}

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRICE BREAKDOWN</Text>
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Total (includes tax, fees, shipping)</Text>
              <Text style={styles.priceValue}>{formatPrice(order.amount_cents)}</Text>
            </View>
          </View>
        </View>

        {/* View in Bloom Button */}
        {order.token_id && order.token_status === 'active' && (
          <Pressable
            style={styles.portfolioButton}
            onPress={() => router.push(`/token/${order.token_id}`)}
          >
            <Text style={styles.portfolioButtonText}>View in Bloom</Text>
          </Pressable>
        )}

        {/* Support */}
        <View style={styles.supportSection}>
          <Text style={styles.supportText}>Need help? support@bloom.com</Text>
        </View>
      </ScrollView>
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
    paddingBottom: 100,
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
  },
  errorText: {
    fontSize: 18,
    color: theme.textSecondary,
  },
  orderHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  orderNumber: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: theme.textPrimary,
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  productImage: {
    width: '100%',
    height: 160,
    marginBottom: 16,
  },
  placeholderImage: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 48,
    color: theme.accent,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginBottom: 4,
  },
  productSize: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 11,
    color: theme.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  deliveryCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
  },
  deliveryType: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  deliveryDescription: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  timeline: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
  },
  timelineStep: {
    flexDirection: 'row',
    minHeight: 48,
  },
  timelineIndicator: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineDotCompleted: {
    backgroundColor: theme.success,
  },
  timelineDotPending: {
    backgroundColor: theme.border,
    borderWidth: 2,
    borderColor: theme.textTertiary,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
    marginBottom: 4,
  },
  timelineLineCompleted: {
    backgroundColor: theme.success,
  },
  timelineLinePending: {
    backgroundColor: theme.border,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 16,
  },
  timelineLabel: {
    fontSize: 15,
    color: theme.textSecondary,
    marginBottom: 2,
  },
  timelineLabelCompleted: {
    color: theme.textPrimary,
  },
  timelineDate: {
    fontSize: 13,
    color: theme.textTertiary,
  },
  trackingCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackingCarrier: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  trackingNumber: {
    fontSize: 14,
    color: theme.textPrimary,
    fontFamily: 'monospace',
  },
  trackingLink: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accent,
  },
  priceCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    flex: 1,
  },
  priceValue: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.textPrimary,
  },
  portfolioButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  portfolioButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
  supportSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  supportText: {
    fontSize: 14,
    color: theme.textTertiary,
  },
});
