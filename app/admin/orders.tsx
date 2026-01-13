// Admin Orders Screen - Manage order intents (Wizard-of-Oz manual execution)
// Access restricted to ADMIN_EMAILS list
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';

// Admin email allowlist (also check env var ADMIN_EMAILS)
const DEFAULT_ADMIN_EMAILS = ['ejhowe@me.com', 'founder@bloom.com'];

interface OrderIntent {
  id: string;
  user_id: string;
  user_email: string | null;
  shoe_id: string;
  shoe_name: string | null;
  style_code: string | null;
  image_url: string | null;
  size: string;
  route: 'home' | 'bloom';
  quoted_marketplace: string | null;
  quoted_price: number | null;
  quoted_total: number | null;
  max_total: number;
  shipping_address: {
    name?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
  } | null;
  email: string | null;
  marketplace_used: string | null;
  actual_total: number | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'executing', label: 'Executing' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
];

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pending: { color: theme.warning, bg: theme.warningBg },
  executing: { color: '#9B59B6', bg: 'rgba(155, 89, 182, 0.15)' },
  ordered: { color: theme.accent, bg: theme.accentLight || 'rgba(245, 196, 154, 0.15)' },
  shipped: { color: '#E67E22', bg: 'rgba(230, 126, 34, 0.15)' },
  delivered: { color: theme.success, bg: theme.successBg },
  cancelled: { color: theme.error, bg: theme.errorBg },
  failed: { color: theme.error, bg: theme.errorBg },
};

export default function AdminOrdersScreen() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<OrderIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderIntent | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  // Edit form state
  const [editStatus, setEditStatus] = useState('');
  const [editMarketplace, setEditMarketplace] = useState('');
  const [editActualTotal, setEditActualTotal] = useState('');
  const [editTracking, setEditTracking] = useState('');
  const [editCarrier, setEditCarrier] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Check admin access
  const checkAdminAccess = useCallback(() => {
    if (!session?.user?.email) {
      setIsAdmin(false);
      return false;
    }

    const adminEmails = DEFAULT_ADMIN_EMAILS;
    const userEmail = session.user.email.toLowerCase();
    const allowed = adminEmails.some(e => e.toLowerCase() === userEmail);
    setIsAdmin(allowed);
    return allowed;
  }, [session]);

  // Fetch orders using service role via edge function
  const fetchOrders = useCallback(async () => {
    if (!session || !checkAdminAccess()) {
      setLoading(false);
      return;
    }

    try {
      // For admin, we need to use the service role to get all orders
      // Since we're in a client app, we'll use the user's own RPC but with admin check
      const { data, error } = await supabase.rpc('get_all_order_intents', {
        p_status: filterStatus,
      });

      if (error) {
        console.error('Error fetching orders:', error);
        // Fallback: try direct table access (will only work if admin policies exist)
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('order_intents')
          .select('*')
          .order('created_at', { ascending: false });

        if (!fallbackError && fallbackData) {
          setOrders(fallbackData as OrderIntent[]);
        }
      } else if (data) {
        setOrders(data as OrderIntent[]);
      }
    } catch (e) {
      console.error('Error fetching admin orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, checkAdminAccess, filterStatus]);

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

  const openEditModal = (order: OrderIntent) => {
    setSelectedOrder(order);
    setEditStatus(order.status);
    setEditMarketplace(order.marketplace_used || '');
    setEditActualTotal(order.actual_total?.toString() || '');
    setEditTracking(order.tracking_number || '');
    setEditCarrier(order.tracking_carrier || '');
    setEditNotes(order.notes || '');
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!selectedOrder) return;

    setSaving(true);
    try {
      const updates: Record<string, any> = {};

      if (editStatus !== selectedOrder.status) {
        updates.status = editStatus;
      }
      if (editMarketplace !== (selectedOrder.marketplace_used || '')) {
        updates.marketplace_used = editMarketplace || null;
      }
      if (editActualTotal !== (selectedOrder.actual_total?.toString() || '')) {
        updates.actual_total = editActualTotal ? parseFloat(editActualTotal) : null;
      }
      if (editTracking !== (selectedOrder.tracking_number || '')) {
        updates.tracking_number = editTracking || null;
      }
      if (editCarrier !== (selectedOrder.tracking_carrier || '')) {
        updates.tracking_carrier = editCarrier || null;
      }
      if (editNotes !== (selectedOrder.notes || '')) {
        updates.notes = editNotes || null;
      }

      if (Object.keys(updates).length === 0) {
        setShowEditModal(false);
        return;
      }

      // Try RPC first
      const { error: rpcError } = await supabase.rpc('update_order_intent', {
        p_id: selectedOrder.id,
        p_status: updates.status || null,
        p_marketplace_used: updates.marketplace_used,
        p_actual_total: updates.actual_total,
        p_tracking_number: updates.tracking_number,
        p_tracking_carrier: updates.tracking_carrier,
        p_notes: updates.notes,
      });

      if (rpcError) {
        // Fallback to direct update
        const { error } = await supabase
          .from('order_intents')
          .update(updates)
          .eq('id', selectedOrder.id);

        if (error) throw error;
      }

      Alert.alert('Success', 'Order updated successfully');
      setShowEditModal(false);
      fetchOrders();
    } catch (e: any) {
      console.error('Error updating order:', e);
      Alert.alert('Error', e.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const formatPrice = (amount: number | null) => {
    if (amount === null) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const renderOrderCard = ({ item }: { item: OrderIntent }) => {
    const statusConfig = STATUS_COLORS[item.status] || { color: theme.textSecondary, bg: theme.card };
    const routeLabel = item.route === 'bloom' ? 'Bloom' : 'Home';

    return (
      <Pressable style={styles.orderCard} onPress={() => openEditModal(item)}>
        <View style={styles.orderHeader}>
          <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.productRow}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.productImage} resizeMode="contain" />
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{item.shoe_name?.charAt(0) || '?'}</Text>
            </View>
          )}

          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={1}>{item.shoe_name || item.shoe_id}</Text>
            <Text style={styles.productMeta}>{item.style_code} • Size {item.size}</Text>
            <Text style={styles.productMeta}>Route: {routeLabel}</Text>
          </View>

          <View style={styles.priceColumn}>
            <Text style={styles.orderPrice}>{formatPrice(item.actual_total || item.quoted_total)}</Text>
            <Text style={styles.priceHint}>Max: {formatPrice(item.max_total)}</Text>
          </View>
        </View>

        <View style={styles.userRow}>
          <Text style={styles.userEmail}>{item.user_email || item.email || 'No email'}</Text>
          <Text style={styles.editHint}>Tap to edit →</Text>
        </View>
      </Pressable>
    );
  };

  // Not authorized view
  if (!isAdmin && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Admin Orders</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.unauthorizedContainer}>
          <Text style={styles.unauthorizedTitle}>Access Denied</Text>
          <Text style={styles.unauthorizedText}>
            You don't have permission to view this page.
          </Text>
          <Pressable style={styles.backHomeButton} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.backHomeButtonText}>Go Home</Text>
          </Pressable>
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
        <Text style={styles.headerTitle}>Admin Orders</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
        <Pressable
          style={[styles.filterChip, !filterStatus && styles.filterChipActive]}
          onPress={() => setFilterStatus(null)}
        >
          <Text style={[styles.filterChipText, !filterStatus && styles.filterChipTextActive]}>All</Text>
        </Pressable>
        {STATUS_OPTIONS.slice(0, 4).map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.filterChip, filterStatus === opt.value && styles.filterChipActive]}
            onPress={() => setFilterStatus(opt.value)}
          >
            <Text style={[styles.filterChipText, filterStatus === opt.value && styles.filterChipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No orders found</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
          }
        />
      )}

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowEditModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Edit Order</Text>

              {selectedOrder && (
                <>
                  <View style={styles.modalProductInfo}>
                    <Text style={styles.modalProductName}>{selectedOrder.shoe_name}</Text>
                    <Text style={styles.modalProductMeta}>
                      {selectedOrder.style_code} • Size {selectedOrder.size} • {selectedOrder.route === 'bloom' ? 'Ship to Bloom' : 'Ship to me'}
                    </Text>
                    <Text style={styles.modalProductMeta}>
                      User: {selectedOrder.user_email || selectedOrder.email}
                    </Text>
                    {selectedOrder.shipping_address && (
                      <Text style={styles.modalProductMeta}>
                        Address: {selectedOrder.shipping_address.line1}, {selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.state} {selectedOrder.shipping_address.zip}
                      </Text>
                    )}
                  </View>

                  {/* Status selector */}
                  <Text style={styles.inputLabel}>Status</Text>
                  <View style={styles.statusPicker}>
                    {STATUS_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        style={[styles.statusOption, editStatus === opt.value && styles.statusOptionSelected]}
                        onPress={() => setEditStatus(opt.value)}
                      >
                        <Text style={[styles.statusOptionText, editStatus === opt.value && styles.statusOptionTextSelected]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Marketplace */}
                  <Text style={styles.inputLabel}>Marketplace Used</Text>
                  <TextInput
                    style={styles.input}
                    value={editMarketplace}
                    onChangeText={setEditMarketplace}
                    placeholder="e.g., stockx, goat, ebay"
                    placeholderTextColor={theme.textTertiary}
                    autoCapitalize="none"
                  />

                  {/* Actual Total */}
                  <Text style={styles.inputLabel}>Actual Total ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={editActualTotal}
                    onChangeText={setEditActualTotal}
                    placeholder="0.00"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                  />

                  {/* Tracking */}
                  <Text style={styles.inputLabel}>Tracking Number</Text>
                  <TextInput
                    style={styles.input}
                    value={editTracking}
                    onChangeText={setEditTracking}
                    placeholder="Enter tracking number"
                    placeholderTextColor={theme.textTertiary}
                    autoCapitalize="characters"
                  />

                  {/* Carrier */}
                  <Text style={styles.inputLabel}>Carrier</Text>
                  <TextInput
                    style={styles.input}
                    value={editCarrier}
                    onChangeText={setEditCarrier}
                    placeholder="e.g., UPS, FedEx, USPS"
                    placeholderTextColor={theme.textTertiary}
                  />

                  {/* Notes */}
                  <Text style={styles.inputLabel}>Notes</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={editNotes}
                    onChangeText={setEditNotes}
                    placeholder="Internal notes..."
                    placeholderTextColor={theme.textTertiary}
                    multiline
                    numberOfLines={3}
                  />

                  {/* Save button */}
                  <View style={styles.modalActions}>
                    <Pressable style={styles.cancelButton} onPress={() => setShowEditModal(false)}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                      onPress={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={theme.textInverse} />
                      ) : (
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  filterChipTextActive: {
    color: theme.textInverse,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  orderCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderDate: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: '#FFF',
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: theme.accent,
  },
  productInfo: {
    flex: 1,
    marginLeft: 10,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  productMeta: {
    fontSize: 11,
    color: theme.textSecondary,
  },
  priceColumn: {
    alignItems: 'flex-end',
  },
  orderPrice: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: theme.textPrimary,
  },
  priceHint: {
    fontSize: 10,
    color: theme.textSecondary,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  userEmail: {
    fontSize: 11,
    color: theme.textSecondary,
    flex: 1,
  },
  editHint: {
    fontSize: 11,
    color: theme.accent,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  unauthorizedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  unauthorizedTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: theme.error,
    marginBottom: 8,
  },
  unauthorizedText: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  backHomeButton: {
    backgroundColor: theme.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backHomeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textInverse,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalProductInfo: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  modalProductName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  modalProductMeta: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 2,
  },
  inputLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  input: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  statusPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statusOptionSelected: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  statusOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  statusOptionTextSelected: {
    color: theme.textInverse,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    paddingBottom: 20,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textInverse,
  },
});
