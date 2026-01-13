// Orders Screen - View order history, order intents, and status
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './_layout';
import { theme, fonts } from '../constants/Colors';

// Order from existing orders table
interface Order {
  order_id: string;
  sku: string;
  product_name: string;
  size: string;
  product_image_url: string | null;
  amount_cents: number;
  lane: 'a' | 'b' | null;
  status: string;
  tracking_number: string | null;
  tracking_carrier: string | null;
  shipping_name: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  created_at: string;
  paid_at: string | null;
  token_id: string | null;
  token_status: string | null;
}

// Order intent (Wizard-of-Oz buy flow)
interface OrderIntent {
  id: string;
  shoe_id: string;
  shoe_name: string;
  style_code: string;
  image_url: string | null;
  size: string;
  route: 'home' | 'bloom';
  quoted_marketplace: string | null;
  quoted_price: number | null;
  quoted_total: number | null;
  max_total: number;
  marketplace_used: string | null;
  actual_total: number | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  status: string;
  status_label: string;
  created_at: string;
  updated_at: string;
}

// Unified order item for display
interface UnifiedOrder {
  type: 'order' | 'intent';
  id: string;
  name: string;
  size: string;
  image_url: string | null;
  amount: number; // in dollars
  route: 'home' | 'bloom';
  status: string;
  status_label: string;
  status_color: string;
  status_bg: string;
  tracking_number: string | null;
  tracking_carrier: string | null;
  created_at: string;
}

// Status config for order intents
const INTENT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Requested', color: theme.warning, bg: theme.warningBg },
  executing: { label: 'Buying...', color: '#9B59B6', bg: 'rgba(155, 89, 182, 0.15)' },
  ordered: { label: 'Ordered', color: theme.accent, bg: theme.accentLight || 'rgba(245, 196, 154, 0.15)' },
  shipped: { label: 'In transit', color: '#E67E22', bg: 'rgba(230, 126, 34, 0.15)' },
  delivered: { label: 'Delivered', color: theme.success, bg: theme.successBg },
  cancelled: { label: 'Cancelled', color: theme.error, bg: theme.errorBg },
  failed: { label: 'Failed', color: theme.error, bg: theme.errorBg },
};

// Status config for existing orders
const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Pending Payment', color: theme.warning, bg: theme.warningBg },
  paid: { label: 'Paid', color: theme.success, bg: theme.successBg },
  fulfilling: { label: 'Fulfilling', color: '#9B59B6', bg: 'rgba(155, 89, 182, 0.15)' },
  shipped: { label: 'Shipped', color: '#E67E22', bg: 'rgba(230, 126, 34, 0.15)' },
  delivered: { label: 'Delivered', color: theme.success, bg: theme.successBg },
  complete: { label: 'Complete', color: theme.success, bg: theme.successBg },
  cancelled: { label: 'Cancelled', color: theme.error, bg: theme.errorBg },
};

export default function OrdersScreen() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const handleImageError = (orderId: string) => {
    setFailedImages(prev => new Set(prev).add(orderId));
  };

  const fetchOrders = useCallback(async () => {
    if (!session) return;

    try {
      // Fetch both order intents and existing orders in parallel
      const [intentsResult, ordersResult] = await Promise.all([
        supabase.rpc('get_user_order_intents'),
        supabase.rpc('get_user_orders_with_tokens'),
      ]);

      const unifiedOrders: UnifiedOrder[] = [];

      // Process order intents
      if (!intentsResult.error && intentsResult.data) {
        for (const intent of intentsResult.data as OrderIntent[]) {
          const statusConfig = INTENT_STATUS_CONFIG[intent.status] || {
            label: intent.status_label || intent.status,
            color: theme.textSecondary,
            bg: theme.card,
          };

          // Special case: "In Bloom" for delivered bloom route
          const displayLabel = intent.status === 'delivered' && intent.route === 'bloom'
            ? 'In Bloom'
            : statusConfig.label;

          unifiedOrders.push({
            type: 'intent',
            id: intent.id,
            name: intent.shoe_name || 'Unknown',
            size: intent.size,
            image_url: intent.image_url,
            amount: intent.actual_total || intent.quoted_total || intent.max_total,
            route: intent.route,
            status: intent.status,
            status_label: displayLabel,
            status_color: statusConfig.color,
            status_bg: statusConfig.bg,
            tracking_number: intent.tracking_number,
            tracking_carrier: intent.tracking_carrier,
            created_at: intent.created_at,
          });
        }
      }

      // Process existing orders
      if (!ordersResult.error && ordersResult.data) {
        for (const order of ordersResult.data as Order[]) {
          const statusConfig = ORDER_STATUS_CONFIG[order.status] || {
            label: order.status,
            color: theme.textSecondary,
            bg: theme.card,
          };

          unifiedOrders.push({
            type: 'order',
            id: order.order_id,
            name: order.product_name || 'Unknown',
            size: order.size,
            image_url: order.product_image_url,
            amount: order.amount_cents / 100,
            route: order.lane === 'a' ? 'home' : 'bloom',
            status: order.status,
            status_label: statusConfig.label,
            status_color: statusConfig.color,
            status_bg: statusConfig.bg,
            tracking_number: order.tracking_number,
            tracking_carrier: order.tracking_carrier,
            created_at: order.created_at,
          });
        }
      }

      // Sort by created_at descending
      unifiedOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setOrders(unifiedOrders);
    } catch (e) {
      console.error('Error fetching orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchOrders();
    }, [fetchOrders])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders();
  }, [fetchOrders]);

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleTrackingPress = (carrier: string | null, trackingNumber: string | null) => {
    if (!trackingNumber) return;

    let url = '';
    const upperCarrier = (carrier || '').toLowerCase();

    if (upperCarrier.includes('ups')) {
      url = `https://www.ups.com/track?tracknum=${trackingNumber}`;
    } else if (upperCarrier.includes('fedex')) {
      url = `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
    } else if (upperCarrier.includes('usps')) {
      url = `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${trackingNumber}`;
    } else {
      // Generic tracking search
      url = `https://www.google.com/search?q=${trackingNumber}+tracking`;
    }

    Linking.openURL(url);
  };

  const renderOrderCard = ({ item }: { item: UnifiedOrder }) => {
    const showImage = item.image_url && !failedImages.has(item.id);
    const routeLabel = item.route === 'bloom' ? 'Bloom Custody' : 'Ship to me';

    return (
      <Pressable
        style={styles.orderCard}
        onPress={() => {
          if (item.type === 'order') {
            router.push(`/orders/${item.id}`);
          }
          // For intents, we could add a detail view later
        }}
      >
        {/* Header Row */}
        <View style={styles.orderHeader}>
          <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: item.status_bg }]}>
            <Text style={[styles.statusText, { color: item.status_color }]}>
              {item.status_label}
            </Text>
          </View>
        </View>

        {/* Product Info */}
        <View style={styles.productRow}>
          {showImage ? (
            <Image
              source={{ uri: item.image_url! }}
              style={styles.productImage}
              resizeMode="contain"
              onError={() => handleImageError(item.id)}
            />
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{item.name?.charAt(0) || '?'}</Text>
            </View>
          )}

          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.productSize}>Size {item.size}</Text>
            <View style={[styles.laneBadge, item.route === 'bloom' && styles.laneBadgeBloom]}>
              <Text style={[styles.laneBadgeText, item.route === 'bloom' && styles.laneBadgeTextBloom]}>
                {routeLabel}
              </Text>
            </View>
          </View>

          <View style={styles.priceColumn}>
            <Text style={styles.orderPrice}>{formatPrice(item.amount)}</Text>
            {item.type === 'intent' && item.status === 'pending' && (
              <Text style={styles.priceHint}>Est.</Text>
            )}
          </View>
        </View>

        {/* Tracking Info */}
        {item.tracking_number && (
          <Pressable
            style={styles.trackingRow}
            onPress={() => handleTrackingPress(item.tracking_carrier, item.tracking_number)}
          >
            <Text style={styles.trackingLabel}>Tracking:</Text>
            <Text style={styles.trackingNumber}>{item.tracking_number}</Text>
            <Text style={styles.trackingLink}>Track →</Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No orders yet</Text>
      <Text style={styles.emptySubtitle}>
        Your purchase history will appear here
      </Text>
      <Pressable style={styles.emptyButton} onPress={() => router.push('/buy')}>
        <Text style={styles.emptyButtonText}>Browse to buy</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Orders</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : orders.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderCard}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
            />
          }
        />
      )}
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
    fontSize: 16,
    color: theme.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  orderCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderDate: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImage: {
    width: 60,
    height: 60,
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
    fontSize: 18,
    color: theme.accent,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  productSize: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  laneBadge: {
    backgroundColor: theme.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  laneBadgeBloom: {
    backgroundColor: theme.accentLight || 'rgba(245, 196, 154, 0.15)',
  },
  laneBadgeText: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  laneBadgeTextBloom: {
    color: theme.accent,
    fontWeight: '600',
  },
  priceColumn: {
    alignItems: 'flex-end',
  },
  orderPrice: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: theme.textPrimary,
  },
  priceHint: {
    fontSize: 10,
    color: theme.textSecondary,
    marginTop: 2,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  trackingLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginRight: 8,
  },
  trackingNumber: {
    fontSize: 12,
    color: theme.textPrimary,
    flex: 1,
    fontFamily: 'monospace',
  },
  trackingLink: {
    fontSize: 12,
    color: theme.accent,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: theme.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textInverse,
  },
});
