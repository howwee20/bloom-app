import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme, fonts } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';

// Available shoe sizes
const AVAILABLE_SIZES = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'];

interface ExchangeListing {
  id: string;
  sku: string;
  product_name: string;
  size: string | null;
  product_image_url: string | null;
  listing_price: number;
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

  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [showSettlement, setShowSettlement] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [matchingListing, setMatchingListing] = useState<ExchangeListing | null>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Fetch current market price from assets table
  useEffect(() => {
    const fetchMarketPrice = async () => {
      if (!style_code) return;

      setPriceLoading(true);
      try {
        // Get the latest price for this style code from assets
        const { data, error } = await supabase
          .from('assets')
          .select('price, last_price_checked_at')
          .eq('stockx_sku', style_code)
          .not('price', 'is', null)
          .order('last_price_checked_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        if (!error && data?.price) {
          setMarketPrice(data.price);
        }
      } catch (e) {
        console.error('Error fetching market price:', e);
      } finally {
        setPriceLoading(false);
      }
    };

    fetchMarketPrice();
  }, [style_code]);

  // Check for matching Bloom Exchange listing when size is selected
  useEffect(() => {
    const checkExchangeListing = async () => {
      if (!selectedSize || !style_code || !session) {
        setMatchingListing(null);
        return;
      }

      setListingLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_exchange_listings');
        if (error) throw error;

        const matches = (data || []).filter((listing: ExchangeListing) =>
          listing.sku === style_code && listing.size === selectedSize
        );

        if (matches.length > 0) {
          // Get the best (lowest) price
          const best = matches.reduce((lowest: ExchangeListing, current: ExchangeListing) => {
            if (!lowest || current.listing_price < lowest.listing_price) return current;
            return lowest;
          }, null as ExchangeListing | null);
          setMatchingListing(best);
        } else {
          setMatchingListing(null);
        }
      } catch (e) {
        console.error('Error checking exchange listings:', e);
        setMatchingListing(null);
      } finally {
        setListingLoading(false);
      }
    };

    checkExchangeListing();
  }, [selectedSize, style_code, session]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const buildMarketplaceUrl = (marketplace: string) => {
    const searchQuery = selectedSize
      ? `${name} ${selectedSize}`
      : name;
    const query = encodeURIComponent(searchQuery || '');

    switch (marketplace) {
      case 'stockx':
        return `https://stockx.com/search?s=${query}`;
      case 'goat':
        return `https://www.goat.com/search?query=${query}`;
      case 'ebay':
        return `https://www.ebay.com/sch/i.html?_nkw=${query}`;
      default:
        return `https://www.google.com/search?q=${query}`;
    }
  };

  const handleContinue = () => {
    if (!selectedSize) return;
    setShowSettlement(true);
  };

  const handleShipToMe = () => {
    setShowSettlement(false);
    setShowMarketplace(true);
  };

  const handleShipToBloom = () => {
    setShowSettlement(false);
    // Navigate to checkout with Bloom custody
    router.push({
      pathname: '/checkout/confirm-order',
      params: {
        catalog_item_id: id,
        asset_name: name,
        asset_image: image_url || '',
        size: selectedSize || '',
        price: marketPrice?.toString() || '0',
        custody_status: 'shipping_to_bloom',
        style_code: style_code,
      },
    });
  };

  const handleInstantTransfer = () => {
    if (!matchingListing) return;
    setShowSettlement(false);
    // Navigate to exchange buy page
    router.push({
      pathname: '/exchange/buy',
      params: { listing_id: matchingListing.id },
    });
  };

  const canContinue = selectedSize !== null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Product Image */}
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

        {/* Product Info */}
        <View style={styles.infoSection}>
          <Text style={styles.productName}>{name}</Text>
          <Text style={styles.styleCode}>{style_code}</Text>
        </View>

        {/* Price */}
        <View style={styles.priceSection}>
          {priceLoading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : marketPrice ? (
            <>
              <Text style={styles.priceLabel}>Market Price</Text>
              <Text style={styles.priceValue}>{formatPrice(marketPrice)}</Text>
            </>
          ) : (
            <Text style={styles.priceUnavailable}>Price not available</Text>
          )}
        </View>

        {/* Size Selector */}
        <View style={styles.sizeSection}>
          <Text style={styles.sizeLabel}>Select Size</Text>
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
      </ScrollView>

      {/* Continue Button */}
      <View style={styles.actionContainer}>
        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={[styles.continueButtonText, !canContinue && styles.continueButtonTextDisabled]}>
            {canContinue ? 'Continue' : 'Select Size'}
          </Text>
        </Pressable>
      </View>

      {/* Settlement Chooser Modal */}
      <Modal
        visible={showSettlement}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettlement(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettlement(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>How do you want to buy?</Text>
            <Text style={styles.modalSubtitle}>
              {name} · Size {selectedSize}
            </Text>

            {/* Ship to me */}
            <Pressable style={styles.settlementOption} onPress={handleShipToMe}>
              <Text style={styles.settlementTitle}>Ship to me</Text>
              <Text style={styles.settlementDesc}>Best all-in price across marketplaces</Text>
            </Pressable>

            {/* Ship to Bloom */}
            <Pressable
              style={[styles.settlementOption, styles.settlementOptionPrimary]}
              onPress={handleShipToBloom}
            >
              <Text style={styles.settlementTitle}>Ship to Bloom</Text>
              <Text style={styles.settlementDesc}>Bloom custody, verified on arrival</Text>
            </Pressable>

            {/* Instant Transfer - only if exchange listing exists */}
            {listingLoading ? (
              <View style={[styles.settlementOption, styles.settlementOptionDisabled]}>
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementTitle}>Instant Transfer</Text>
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                </View>
                <Text style={styles.settlementDesc}>Checking availability...</Text>
              </View>
            ) : matchingListing ? (
              <Pressable
                style={[styles.settlementOption, styles.settlementOptionHighlight]}
                onPress={handleInstantTransfer}
              >
                <Text style={styles.settlementTitle}>Instant Transfer</Text>
                <Text style={styles.settlementDesc}>
                  {formatPrice(matchingListing.listing_price)} in Bloom custody
                </Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.modalCancel} onPress={() => setShowSettlement(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Marketplace Selector Modal */}
      <Modal
        visible={showMarketplace}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMarketplace(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMarketplace(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ship to me</Text>
            <Text style={styles.modalSubtitle}>Choose a marketplace to complete your purchase</Text>

            <View style={styles.productSummary}>
              <Text style={styles.summaryName}>{name}</Text>
              <Text style={styles.summarySize}>Size {selectedSize}</Text>
            </View>

            {['stockx', 'goat', 'ebay'].map((marketplace) => (
              <Pressable
                key={marketplace}
                style={styles.marketplaceOption}
                onPress={() => {
                  Linking.openURL(buildMarketplaceUrl(marketplace));
                  setShowMarketplace(false);
                }}
              >
                <Text style={styles.marketplaceTitle}>{marketplace.toUpperCase()}</Text>
                <Text style={styles.marketplaceDesc}>Open search and checkout</Text>
              </Pressable>
            ))}

            <Pressable style={styles.modalCancel} onPress={() => setShowMarketplace(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  productImage: {
    width: '100%',
    aspectRatio: 1.4,
    backgroundColor: '#FFF',
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: fonts.heading,
    fontSize: 64,
    color: theme.accent,
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    alignItems: 'center',
  },
  productName: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  styleCode: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  priceSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  priceValue: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: theme.textPrimary,
  },
  priceUnavailable: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  sizeSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sizeLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  continueButton: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: theme.card,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
  continueButtonTextDisabled: {
    color: theme.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  settlementOption: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  settlementOptionPrimary: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  settlementOptionHighlight: {
    backgroundColor: theme.successBg,
    borderColor: theme.success,
  },
  settlementOptionDisabled: {
    opacity: 0.6,
  },
  settlementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settlementTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  settlementDesc: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  productSummary: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  summaryName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  summarySize: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  marketplaceOption: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  marketplaceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  marketplaceDesc: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
  },
});
