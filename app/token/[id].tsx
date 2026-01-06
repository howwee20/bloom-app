// Token Detail Screen - Ownership-first model with status-specific views
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// Web-compatible alert/confirm
const showAlert = (title: string, message: string, buttons?: Array<{text: string, onPress?: () => void, style?: string}>) => {
  if (Platform.OS === 'web') {
    // On web, use window.alert for simple alerts, window.confirm for confirmations
    if (buttons && buttons.length > 1) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) {
        const confirmButton = buttons.find(b => b.style === 'destructive' || b.text !== 'Cancel');
        confirmButton?.onPress?.();
      }
    } else {
      window.alert(`${title}\n\n${message}`);
      buttons?.[0]?.onPress?.();
    }
  } else {
    Alert.alert(title, message, buttons);
  }
};
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';
import { theme, fonts } from '../../constants/Colors';

interface TokenDetail {
  id: string;
  order_id: string;
  sku: string;
  product_name: string;
  size: string;
  product_image_url: string | null;
  purchase_price: number;
  purchase_date: string;
  custody_type: 'bloom' | 'home'; // Bloom vault or user's home
  vault_location: string | null;
  verification_photos: string[] | null;
  verified_at: string | null;
  is_exchange_eligible: boolean;
  current_value: number;
  pnl_dollars: number | null;
  pnl_percent: number | null;
  is_listed_for_sale: boolean;
  listing_price: number | null;
  status: 'acquiring' | 'in_custody' | 'listed' | 'redeeming' | 'shipped' | 'redeemed' | 'shipping_to_bloom';
  match_status?: 'matched' | 'pending';
  matched_asset_id?: string | null;
  last_price_checked_at?: string | null;
  last_price_updated_at?: string | null;
  // Redemption fields
  redemption_name: string | null;
  redemption_address_line1: string | null;
  redemption_city: string | null;
  redemption_state: string | null;
  redemption_zip: string | null;
  redemption_requested_at: string | null;
  redemption_shipped_at: string | null;
  redemption_delivered_at: string | null;
  redemption_tracking_number: string | null;
  redemption_tracking_carrier: string | null;
}

export default function TokenDetailScreen() {
  const { id, sell } = useLocalSearchParams<{ id: string; sell?: string }>();
  const { session } = useAuth();
  const [token, setToken] = useState<TokenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [showListingModal, setShowListingModal] = useState(false);
  const [listingPrice, setListingPrice] = useState('');
  const [listingLoading, setListingLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [sellTriggered, setSellTriggered] = useState(false);

  const fetchToken = useCallback(async () => {
    if (!id || !session) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_token_detail', { p_token_id: id });

      if (!error && data && data.length > 0) {
        setToken(data[0]);
      }
    } catch (e) {
      console.error('Error fetching token:', e);
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useFocusEffect(
    useCallback(() => {
      fetchToken();
    }, [fetchToken])
  );

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
  };

  const formatPnL = (value: number | null) => {
    if (value === null) return '--';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${formatPrice(value)}`;
  };

  const formatTimeAgo = (dateString?: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const hasValue = token?.current_value !== null && token?.current_value !== undefined;
  const cashOutEstimate = token && hasValue
    ? Math.round(token.current_value * 0.88 * 100) / 100
    : 0;

  const handleListForSale = () => {
    if (!token?.is_exchange_eligible) {
      showAlert(
        'Not Exchange Eligible',
        'This token must be verified in Bloom custody before it can be listed for sale.'
      );
      return;
    }
    // Pre-fill with current value as suggested price
    setListingPrice(token.current_value?.toString() || '');
    setShowListingModal(true);
  };

  const handleConfirmListing = async () => {
    if (!token) return;

    const price = parseFloat(listingPrice);
    if (isNaN(price) || price < 50 || price > 50000) {
      showAlert('Invalid Price', 'Price must be between $50 and $50,000');
      return;
    }

    try {
      setListingLoading(true);
      const { data, error } = await supabase.rpc('list_token_for_sale', {
        p_token_id: token.id,
        p_listing_price: price,
      });

      if (error) throw error;

      if (data?.success) {
        setShowListingModal(false);
        showAlert(
          'Listed Successfully',
          `Your ${token.product_name} is now listed for ${formatPrice(price)}.`,
          [{ text: 'OK', onPress: fetchToken }]
        );
      } else {
        throw new Error(data?.error || 'Failed to list token');
      }
    } catch (e: any) {
      console.error('Listing failed:', e);
      showAlert('Listing Failed', e.message || 'Please try again.');
    } finally {
      setListingLoading(false);
    }
  };

  const handleUnlist = async () => {
    if (!token) return;

    const doUnlist = async () => {
      try {
        console.log('Attempting to unlist token:', token.id);

        const { data, error } = await supabase.rpc('unlist_token', {
          p_token_id: token.id,
        });

        console.log('Unlist RPC response:', { data, error });

        if (error) {
          console.error('RPC error:', error);
          throw error;
        }

        // Handle both direct object and potential array response
        const result = Array.isArray(data) ? data[0] : data;

        if (result?.success) {
          showAlert('Unlisted', 'Your token has been removed from the exchange.');
          fetchToken();
        } else {
          throw new Error(result?.error || 'Failed to unlist token');
        }
      } catch (e: any) {
        console.error('Unlist failed:', e);
        showAlert('Failed', e.message || 'Please try again.');
      }
    };

    showAlert(
      'Remove Listing',
      'Are you sure you want to remove this listing from the exchange?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doUnlist },
      ]
    );
  };

  const handleRedeem = () => {
    if (token?.status !== 'in_custody') {
      showAlert('Not Available', 'This token is not available for redemption.');
      return;
    }
    // Show warning before navigating to redemption flow
    showAlert(
      'Ship to Me?',
      'This will ship the physical item to you. Once shipped, this token can no longer be traded on the exchange.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            router.push({
              pathname: '/redeem/[tokenId]',
              params: { tokenId: token.id },
            });
          },
        },
      ]
    );
  };

  const handleSellEntry = () => {
    if (!token) return;
    if (token.custody_type === 'bloom') {
      handleListForSale();
      return;
    }
    showAlert(
      'Coming Soon',
      `Marketplace selling is coming soon. You’ll receive ~${formatPrice(cashOutEstimate)} after fees.`
    );
  };

  const handleRemove = () => {
    showAlert(
      'Remove from Portfolio?',
      'This will permanently remove this item from your portfolio. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // First delete any related token_transfers
              await supabase
                .from('token_transfers')
                .delete()
                .eq('token_id', token?.id);

              // Then delete the token
              const { error } = await supabase
                .from('tokens')
                .delete()
                .eq('id', token?.id);

              if (error) throw error;

              showAlert('Removed', 'Item removed from portfolio.');
              router.back();
            } catch (e: any) {
              showAlert('Error', e.message || 'Failed to remove item.');
            }
          },
        },
      ]
    );
  };

  // Status helpers
  const isAcquiring = token?.status === 'acquiring';
  const isInCustody = token?.status === 'in_custody';
  const isListed = token?.status === 'listed';
  const isInCustodyOrListed = isInCustody || isListed;
  const isRedeeming = token?.status === 'redeeming' || token?.status === 'shipped';
  const isRedeemed = token?.status === 'redeemed';
  const isShippingToBloom = token?.status === 'shipping_to_bloom';
  const isBloomCustody = token?.custody_type === 'bloom';
  const isHomeCustody = token?.custody_type === 'home';

  useEffect(() => {
    if (!token || sell !== '1' || sellTriggered) return;
    setSellTriggered(true);

    if (isListed || isInCustody) {
      handleSellEntry();
    } else {
      showAlert('Sell not available', 'This item cannot be sold right now.');
    }
  }, [token, sell, sellTriggered, isListed, isInCustody]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Token</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Token</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Token not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pnlColor = token.pnl_dollars === null
    ? theme.textSecondary
    : token.pnl_dollars >= 0 ? theme.success : theme.error;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{token.product_name}</Text>
        <Pressable style={styles.moreButton} onPress={() => setShowMoreMenu(true)}>
          <Text style={styles.moreButtonText}>•••</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Image */}
        <View style={styles.imageContainer}>
          {token.product_image_url && !imageError ? (
            <Image
              source={{ uri: token.product_image_url }}
              style={styles.productImage}
              resizeMode="contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={[styles.productImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{token.product_name.charAt(0)}</Text>
            </View>
          )}
        </View>

        {/* Product Info */}
        <View style={styles.productInfo}>
          <Text style={styles.productName}>{token.product_name}</Text>
          <Text style={styles.productMeta}>Size {token.size}</Text>
          {/* Custody Badge */}
          <View style={[styles.custodyBadge, isHomeCustody && !isShippingToBloom && styles.custodyBadgeHome, isShippingToBloom && styles.custodyBadgeShipping]}>
            <Text style={styles.custodyBadgeText}>
              {isShippingToBloom ? 'SHIPPING TO BLOOM' : isBloomCustody ? 'BLOOM' : 'HOME'}
            </Text>
          </View>
        </View>

        {/* Value Section - Shows bid/ask spread for active tokens */}
        <View style={styles.valueSection}>
          <Text style={styles.valueLabel}>Market Value</Text>
          <Text style={styles.valueAmount}>
            {hasValue ? formatPrice(token.current_value) : 'Needs match'}
          </Text>
          {isInCustodyOrListed && hasValue && (
            <Text style={[styles.pnlText, { color: pnlColor }]}>
              {formatPnL(token.pnl_dollars)} since purchase
            </Text>
          )}
          {token.last_price_checked_at && (
            <Text style={styles.updatedText}>
              Updated {formatTimeAgo(token.last_price_checked_at)}
            </Text>
          )}

          {isAcquiring && (
            <Text style={styles.statusNote}>Arriving in 5-7 days</Text>
          )}
          {isShippingToBloom && (
            <Text style={styles.statusNote}>Ship to Bloom to enable instant resale</Text>
          )}
          {isRedeeming && (
            <Text style={styles.statusNote}>
              {token.status === 'shipped' ? 'Shipped to you' : 'Preparing for shipment'}
            </Text>
          )}
          {isRedeemed && (
            <Text style={styles.statusNote}>In your possession</Text>
          )}
        </View>

        {/* Tracking Info (for shipped) */}
        {token.status === 'shipped' && token.redemption_tracking_number && (
          <View style={styles.trackingSection}>
            <Text style={styles.trackingNumber}>
              {token.redemption_tracking_carrier}: {token.redemption_tracking_number}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        {/* Shipping to Bloom - Show shipping code and waiting message */}
        {isShippingToBloom && token.vault_location && (
          <View style={styles.shippingInfo}>
            <Text style={styles.shippingInfoLabel}>Your Shipping Code</Text>
            <Text style={styles.shippingInfoCode}>{token.vault_location}</Text>
            <Text style={styles.shippingInfoNote}>Include this code inside the box</Text>
          </View>
        )}
        {/* In Custody - Show Sell button (routing is invisible to user) */}
        {isInCustody && (
          <>
            {isBloomCustody && (
              <Pressable style={styles.actionButton} onPress={handleRedeem}>
                <Text style={styles.actionButtonText}>Ship to Me</Text>
              </Pressable>
            )}
            {isHomeCustody && (
              <Pressable style={styles.actionButton} onPress={() => {
                showAlert('Send to Bloom', 'Ship this item to Bloom to enable instant selling. Transit takes 2-3 days.');
              }}>
                <Text style={styles.actionButtonText}>Send to Bloom</Text>
              </Pressable>
            )}
          </>
        )}
        {isListed && (
          <>
            <View style={styles.listedInfo}>
              <Text style={styles.listedLabel}>Listed for {formatPrice(token.listing_price || 0)}</Text>
            </View>
          </>
        )}
      </View>

      {/* Listing Modal */}
      <Modal
        visible={showListingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowListingModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Price</Text>
              <Pressable onPress={() => setShowListingModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.priceInputWrapper}>
                <Text style={styles.priceCurrency}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  value={listingPrice}
                  onChangeText={setListingPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textTertiary}
                  autoFocus
                />
              </View>

              <Text style={styles.feeNote}>
                You’ll receive ~{formatPrice((parseFloat(listingPrice) || 0) * 0.97)} after fees
              </Text>

              <Pressable
                style={[styles.modalButton, listingLoading && styles.modalButtonDisabled]}
                onPress={handleConfirmListing}
                disabled={listingLoading}
              >
                <Text style={styles.modalButtonText}>
                  {listingLoading ? 'Listing...' : 'List for Sale'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Overflow Menu */}
      <Modal
        visible={showMoreMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowMoreMenu(false)}>
          <View style={styles.menuContent}>
            {(isInCustody || isListed) && (
              <Pressable style={styles.menuItem} onPress={() => {
                setShowMoreMenu(false);
                handleSellEntry();
              }}>
                <Text style={styles.menuItemText}>{isListed ? 'Update Price' : 'Sell'}</Text>
              </Pressable>
            )}
            {isListed && (
              <Pressable style={styles.menuItem} onPress={() => {
                setShowMoreMenu(false);
                handleUnlist();
              }}>
                <Text style={styles.menuItemText}>Remove Listing</Text>
              </Pressable>
            )}
            <Pressable style={styles.menuItem} onPress={() => {
              setShowMoreMenu(false);
              handleRemove();
            }}>
              <Text style={styles.menuItemDanger}>Remove from Portfolio</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => setShowMoreMenu(false)}>
              <Text style={styles.menuItemText}>Cancel</Text>
            </Pressable>
          </View>
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
    fontSize: 14,
    color: theme.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  moreButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButtonText: {
    fontSize: 18,
    color: theme.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
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
  },
  errorText: {
    fontSize: 18,
    color: theme.textSecondary,
  },
  imageContainer: {
    backgroundColor: '#FFF',
    padding: 16,
    alignItems: 'center',
  },
  productImage: {
    width: '100%',
    aspectRatio: 1.4,
  },
  placeholderImage: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 64,
    color: theme.accent,
  },
  productInfo: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 15,
    color: theme.textSecondary,
  },
  custodyBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  custodyBadgeHome: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  custodyBadgeShipping: {
    backgroundColor: 'rgba(245, 166, 35, 0.2)',
  },
  custodyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  valueSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  valueLabel: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  valueAmount: {
    fontFamily: fonts.heading,
    fontSize: 44,
    color: theme.textPrimary,
    letterSpacing: -1,
  },
  pnlText: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
  },
  updatedText: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 6,
  },
  statusNote: {
    fontSize: 15,
    color: theme.textSecondary,
    marginTop: 4,
  },
  trackingSection: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  trackingNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accent,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 12,
  },
  actionButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonText: {
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
  listedInfo: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  listedLabel: {
    fontSize: 15,
    color: theme.success,
    fontWeight: '500',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
  },
  menuItem: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  menuItemDanger: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.error,
  },
  shippingInfo: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(245, 166, 35, 0.1)',
    borderRadius: 12,
    marginBottom: 12,
  },
  shippingInfoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  shippingInfoCode: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: '#F5A623',
    letterSpacing: 3,
    marginBottom: 8,
  },
  shippingInfoNote: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: theme.textPrimary,
  },
  modalClose: {
    fontSize: 16,
    color: theme.accent,
  },
  modalBody: {
    padding: 16,
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  priceCurrency: {
    fontSize: 40,
    fontWeight: '600',
    color: theme.textPrimary,
    marginRight: 4,
  },
  priceInput: {
    fontSize: 40,
    fontWeight: '600',
    color: theme.textPrimary,
    minWidth: 120,
    textAlign: 'center',
  },
  feeNote: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalButtonDisabled: {
    backgroundColor: theme.card,
  },
  modalButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
});
