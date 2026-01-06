// Orders Screen - View order history and status
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Pending Payment', color: theme.warning, bg: theme.warningBg },
  paid: { label: 'Paid', color: theme.success, bg: theme.successBg },
  fulfilling: { label: 'Fulfilling', color: '#9B59B6', bg: '#2E1F3D' },
  shipped: { label: 'Shipped', color: '#E67E22', bg: '#2E2515' },
  delivered: { label: 'Delivered', color: theme.success, bg: theme.successBg },
  complete: { label: 'Complete', color: theme.success, bg: theme.successBg },
  cancelled: { label: 'Cancelled', color: theme.error, bg: theme.errorBg },
};

export default function OrdersScreen() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const handleImageError = (orderId: string) => {
    setFailedImages(prev => new Set(prev).add(orderId));
  };

  const fetchOrders = useCallback(async () => {
    if (!session) return;

    try {
      const { data, error } = await supabase.rpc('get_user_orders_with_tokens');
      if (!error && data) {
        setOrders(data);
      }
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

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(cents / 100);
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

  const renderOrderCard = ({ item }: { item: Order }) => {
    const statusConfig = STATUS_CONFIG[item.status] || { label: item.status, color: theme.textSecondary, bg: theme.card };
    const showImage = item.product_image_url && !failedImages.has(item.order_id);

    return (
      <Pressable
        style={styles.orderCard}
        onPress={() => router.push(`/orders/${item.order_id}`)}
      >
        {/* Header Row */}
        <View style={styles.orderHeader}>
          <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {/* Product Info */}
        <View style={styles.productRow}>
          {showImage ? (
            <Image
              source={{ uri: item.product_image_url! }}
              style={styles.productImage}
              resizeMode="contain"
              onError={() => handleImageError(item.order_id)}
            />
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{item.product_name?.charAt(0) || '?'}</Text>
            </View>
          )}

          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={2}>{item.product_name}</Text>
            <Text style={styles.productSize}>Size {item.size}</Text>
            <View style={styles.laneBadge}>
              <Text style={styles.laneBadgeText}>Vault Custody</Text>
            </View>
          </View>

          <Text style={styles.orderPrice}>{formatPrice(item.amount_cents)}</Text>
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
      <Pressable style={styles.emptyButton} onPress={() => router.push('/(tabs)/exchange')}>
        <Text style={styles.emptyButtonText}>Browse assets</Text>
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
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : orders.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderCard}
          keyExtractor={(item) => item.order_id}
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
  laneBadgeText: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  orderPrice: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: theme.textPrimary,
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
