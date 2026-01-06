// Redemption Screen - Enter shipping address to redeem token
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

// US States for dropdown
const US_STATES = [
  { label: 'Alabama', value: 'AL' },
  { label: 'Alaska', value: 'AK' },
  { label: 'Arizona', value: 'AZ' },
  { label: 'Arkansas', value: 'AR' },
  { label: 'California', value: 'CA' },
  { label: 'Colorado', value: 'CO' },
  { label: 'Connecticut', value: 'CT' },
  { label: 'Delaware', value: 'DE' },
  { label: 'Florida', value: 'FL' },
  { label: 'Georgia', value: 'GA' },
  { label: 'Hawaii', value: 'HI' },
  { label: 'Idaho', value: 'ID' },
  { label: 'Illinois', value: 'IL' },
  { label: 'Indiana', value: 'IN' },
  { label: 'Iowa', value: 'IA' },
  { label: 'Kansas', value: 'KS' },
  { label: 'Kentucky', value: 'KY' },
  { label: 'Louisiana', value: 'LA' },
  { label: 'Maine', value: 'ME' },
  { label: 'Maryland', value: 'MD' },
  { label: 'Massachusetts', value: 'MA' },
  { label: 'Michigan', value: 'MI' },
  { label: 'Minnesota', value: 'MN' },
  { label: 'Mississippi', value: 'MS' },
  { label: 'Missouri', value: 'MO' },
  { label: 'Montana', value: 'MT' },
  { label: 'Nebraska', value: 'NE' },
  { label: 'Nevada', value: 'NV' },
  { label: 'New Hampshire', value: 'NH' },
  { label: 'New Jersey', value: 'NJ' },
  { label: 'New Mexico', value: 'NM' },
  { label: 'New York', value: 'NY' },
  { label: 'North Carolina', value: 'NC' },
  { label: 'North Dakota', value: 'ND' },
  { label: 'Ohio', value: 'OH' },
  { label: 'Oklahoma', value: 'OK' },
  { label: 'Oregon', value: 'OR' },
  { label: 'Pennsylvania', value: 'PA' },
  { label: 'Rhode Island', value: 'RI' },
  { label: 'South Carolina', value: 'SC' },
  { label: 'South Dakota', value: 'SD' },
  { label: 'Tennessee', value: 'TN' },
  { label: 'Texas', value: 'TX' },
  { label: 'Utah', value: 'UT' },
  { label: 'Vermont', value: 'VT' },
  { label: 'Virginia', value: 'VA' },
  { label: 'Washington', value: 'WA' },
  { label: 'West Virginia', value: 'WV' },
  { label: 'Wisconsin', value: 'WI' },
  { label: 'Wyoming', value: 'WY' },
];

interface TokenInfo {
  id: string;
  product_name: string;
  product_image_url: string | null;
  size: string;
  current_value: number;
}

export default function RedemptionScreen() {
  const { tokenId } = useLocalSearchParams<{ tokenId: string }>();
  const { session } = useAuth();
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [showStatePicker, setShowStatePicker] = useState(false);

  const fetchToken = useCallback(async () => {
    if (!tokenId || !session) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_token_detail', { p_token_id: tokenId });

      if (!error && data && data.length > 0) {
        const tokenData = data[0];
        if (tokenData.status !== 'in_custody') {
          Alert.alert('Cannot Redeem', 'This token is not available for redemption.');
          router.back();
          return;
        }
        setToken(tokenData);
      } else {
        Alert.alert('Error', 'Token not found.');
        router.back();
      }
    } catch (e) {
      console.error('Error fetching token:', e);
      Alert.alert('Error', 'Failed to load token details.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [tokenId, session]);

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

  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('Missing Information', 'Please enter your full name.');
      return false;
    }
    if (!addressLine1.trim()) {
      Alert.alert('Missing Information', 'Please enter your street address.');
      return false;
    }
    if (!city.trim()) {
      Alert.alert('Missing Information', 'Please enter your city.');
      return false;
    }
    if (!state) {
      Alert.alert('Missing Information', 'Please select your state.');
      return false;
    }
    if (!zip.trim() || !/^\d{5}(-\d{4})?$/.test(zip.trim())) {
      Alert.alert('Invalid ZIP Code', 'Please enter a valid 5-digit ZIP code.');
      return false;
    }
    return true;
  };

  const handleRedeem = async () => {
    if (!validateForm() || !token) return;

    // Confirm one more time
    Alert.alert(
      'Confirm Redemption',
      `Ship ${token.product_name} (Size ${token.size}) to:\n\n${name}\n${addressLine1}${addressLine2 ? '\n' + addressLine2 : ''}\n${city}, ${state} ${zip}\n\nThis action cannot be undone. Once redeemed, this token can no longer be traded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Redemption',
          style: 'destructive',
          onPress: submitRedemption,
        },
      ]
    );
  };

  const submitRedemption = async () => {
    if (!token || !session) return;

    try {
      setProcessing(true);

      // Call the redemption RPC
      const { data, error } = await supabase.rpc('request_token_redemption', {
        p_token_id: token.id,
        p_name: name.trim(),
        p_address_line1: addressLine1.trim(),
        p_address_line2: addressLine2.trim() || null,
        p_city: city.trim(),
        p_state: state,
        p_zip: zip.trim(),
      });

      if (error) {
        throw error;
      }

      // Notify founder about redemption request
      try {
        await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-redemption`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              token_id: token.id,
              product_name: token.product_name,
              size: token.size,
              shipping_name: name.trim(),
              shipping_address: `${addressLine1.trim()}${addressLine2 ? ', ' + addressLine2.trim() : ''}, ${city.trim()}, ${state} ${zip.trim()}`,
              customer_email: session.user?.email,
            }),
          }
        );
      } catch (notifyError) {
        // Don't fail the redemption if notification fails
        console.error('Failed to send redemption notification:', notifyError);
      }

      // Show success
      Alert.alert(
        'Redemption Requested',
        'We\'ll ship your item to you soon! You\'ll receive tracking information once it ships.',
        [
          {
            text: 'View in Bloom',
            onPress: () => router.replace('/(tabs)'),
          },
        ]
      );
    } catch (e: any) {
      console.error('Redemption failed:', e);
      Alert.alert('Redemption Failed', e.message || 'Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Ship to Me</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!token) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Ship to Me</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Product Card */}
          <View style={styles.productCard}>
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
            <View style={styles.productInfo}>
              <Text style={styles.productName} numberOfLines={2}>{token.product_name}</Text>
              <Text style={styles.productDetails}>Size {token.size}</Text>
              <Text style={styles.productValue}>{formatPrice(token.current_value)}</Text>
            </View>
          </View>

          {/* Warning Card */}
          <View style={styles.warningCard}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Redemption is Final</Text>
              <Text style={styles.warningText}>
                Once you redeem this token, it can no longer be traded on the Bloom Exchange. You will receive the physical item.
              </Text>
            </View>
          </View>

          {/* Shipping Form */}
          <Text style={styles.sectionLabel}>Shipping Address</Text>

          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="John Doe"
              placeholderTextColor={theme.textTertiary}
              autoComplete="name"
              autoCapitalize="words"
              editable={!processing}
            />
          </View>

          {/* Address Line 1 */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Street Address</Text>
            <TextInput
              style={styles.input}
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="123 Main Street"
              placeholderTextColor={theme.textTertiary}
              autoComplete="street-address"
              editable={!processing}
            />
          </View>

          {/* Address Line 2 */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Apt, Suite, etc. (Optional)</Text>
            <TextInput
              style={styles.input}
              value={addressLine2}
              onChangeText={setAddressLine2}
              placeholder="Apt 4B"
              placeholderTextColor={theme.textTertiary}
              editable={!processing}
            />
          </View>

          {/* City */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>City</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="New York"
              placeholderTextColor={theme.textTertiary}
              autoComplete="postal-address-locality"
              editable={!processing}
            />
          </View>

          {/* State & ZIP Row */}
          <View style={styles.rowGroup}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>State</Text>
              <Pressable
                style={styles.selectButton}
                onPress={() => !processing && setShowStatePicker(!showStatePicker)}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    !state && styles.selectButtonPlaceholder,
                  ]}
                >
                  {state || 'Select'}
                </Text>
                <Text style={styles.selectArrow}>▼</Text>
              </Pressable>
            </View>

            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.inputLabel}>ZIP Code</Text>
              <TextInput
                style={styles.input}
                value={zip}
                onChangeText={setZip}
                placeholder="10001"
                placeholderTextColor={theme.textTertiary}
                keyboardType="number-pad"
                maxLength={10}
                autoComplete="postal-code"
                editable={!processing}
              />
            </View>
          </View>

          {/* State Picker (Simple List) */}
          {showStatePicker && (
            <View style={styles.statePicker}>
              <ScrollView style={styles.stateList} nestedScrollEnabled>
                {US_STATES.map((s) => (
                  <Pressable
                    key={s.value}
                    style={[
                      styles.stateItem,
                      state === s.value && styles.stateItemSelected,
                    ]}
                    onPress={() => {
                      setState(s.value);
                      setShowStatePicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.stateItemText,
                        state === s.value && styles.stateItemTextSelected,
                      ]}
                    >
                      {s.label} ({s.value})
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>

        {/* Redeem Button */}
        <View style={styles.actionContainer}>
          <Pressable
            style={[styles.redeemButton, processing && styles.redeemButtonDisabled]}
            onPress={handleRedeem}
            disabled={processing}
          >
            <Text style={styles.redeemButtonText}>
              {processing ? 'Processing...' : 'Confirm Redemption'}
            </Text>
          </Pressable>
          <Text style={styles.actionNote}>
            Free shipping. Usually arrives in 3-5 business days.
          </Text>
        </View>
      </KeyboardAvoidingView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 140,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  productImage: {
    width: 80,
    height: 80,
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
    fontSize: 24,
    color: theme.accent,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  productDetails: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  productValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.accent,
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: theme.warningBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  sectionLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rowGroup: {
    flexDirection: 'row',
  },
  selectButton: {
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: {
    fontSize: 16,
    color: theme.textPrimary,
  },
  selectButtonPlaceholder: {
    color: theme.textTertiary,
  },
  selectArrow: {
    fontSize: 10,
    color: theme.textSecondary,
  },
  statePicker: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: -8,
    marginBottom: 16,
    maxHeight: 200,
  },
  stateList: {
    padding: 8,
  },
  stateItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  stateItemSelected: {
    backgroundColor: theme.accentLight,
  },
  stateItemText: {
    fontSize: 15,
    color: theme.textPrimary,
  },
  stateItemTextSelected: {
    color: theme.accent,
    fontWeight: '600',
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  redeemButton: {
    backgroundColor: theme.error,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  redeemButtonDisabled: {
    backgroundColor: theme.card,
  },
  redeemButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textInverse,
  },
  actionNote: {
    fontSize: 13,
    color: theme.textTertiary,
    textAlign: 'center',
    marginTop: 12,
  },
});
