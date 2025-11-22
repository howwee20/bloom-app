// File: app/redeem-streak.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, ScrollView, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './_layout';
import { supabase } from '../lib/supabase';
import { getDiscount, getTierName } from './lifetime-info';

// Redemption options
const REDEMPTION_OPTIONS = [
  { id: 'starbucks', name: 'Starbucks', color: '#00704A' },
  { id: 'target', name: 'Target', color: '#CC0000' },
  { id: 'xbox', name: 'Xbox', color: '#107C10' },
];

export default function RedeemStreakScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [userStreak, setUserStreak] = useState(0);
  const [lifetimeDays, setLifetimeDays] = useState(0);
  const [userEmail, setUserEmail] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<typeof REDEMPTION_OPTIONS[0] | null>(null);

  const BASE_COST = 10;
  const ITEM_VALUE = 5.00;

  // Calculate discount based on lifetime days
  const discount = getDiscount(lifetimeDays);
  const tierName = getTierName(lifetimeDays);
  const finalCost = Math.max(BASE_COST - discount, Math.ceil(BASE_COST * 0.5)); // 50% floor

  // Fetch user's current streak and email
  useEffect(() => {
    const fetchUserData = async () => {
      if (!session) return;

      try {
        // Get streak
        const { data: streakData, error: streakError } = await supabase.rpc('get_current_streak');
        if (streakError) throw streakError;
        setUserStreak(typeof streakData === 'number' ? streakData : 0);

        // Get lifetime days
        const { data: profileData } = await supabase
          .from('profile')
          .select('lifetime_days')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileData) {
          setLifetimeDays(profileData.lifetime_days || 0);
        }

        // Pre-fill email if available
        if (session.user.email) {
          setUserEmail(session.user.email);
        }
      } catch (e) {
        console.error('Error fetching user data:', e);
        setUserStreak(0);
      }
    };

    fetchUserData();
  }, [session]);

  // Validate email format
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleRedeem = async () => {
    console.log('=== REDEEM DEBUG START ===');

    if (!selectedOption) {
      Alert.alert('Error', 'Please select an option');
      return;
    }

    if (!isValidEmail(userEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    setShowConfirmModal(false);
    setIsSubmitting(true);

    const itemName = `$5 ${selectedOption.name}`;

    try {
      console.log('Processing redemption:', {
        email: userEmail,
        days: finalCost,
        item: itemName,
      });

      const { data, error } = await supabase.rpc('process_redemption', {
        user_email_input: userEmail.trim(),
        item_name_input: itemName,
        days_to_redeem: finalCost,
      });

      console.log('RPC Response:', { data, error });

      if (error) {
        console.error('Supabase RPC error:', error);
        Alert.alert('Error', error.message);
        setIsSubmitting(false);
        return;
      }

      // SUCCESS - redirect back immediately
      console.log('Redemption successful! Redirecting...', data);
      router.replace('/(tabs)');

      // Show confirmation alert AFTER redirect
      setTimeout(() => {
        Alert.alert(
          'Redeemed!',
          `${itemName} will be sent to ${userEmail}\n\nYour new streak: ${data.newStreak} days`
        );
      }, 300);

    } catch (err: any) {
      console.error('Unexpected error:', err);
      Alert.alert('Error', 'Failed to process redemption. Try again.');
      setIsSubmitting(false);
    } finally {
      console.log('=== REDEEM DEBUG END ===');
    }
  };

  // Check if user can redeem
  const canRedeem = userStreak >= finalCost;
  const daysNeeded = finalCost - userStreak;

  // Show category menu first
  if (!selectedCategory) {
    return (
      <View style={styles.container}>
        <Text style={styles.headerText}>Bloom Store</Text>
        <Pressable onPress={() => router.push('/lifetime-info')}>
          <Text style={styles.tierInfoLink}>
            {tierName} • {discount > 0 ? `-${discount} days off everything` : 'Base pricing'}
          </Text>
        </Pressable>

        <View style={styles.categoryList}>
          {/* Gift Cards - Active */}
          <Pressable
            style={({ pressed }) => [
              styles.categoryItem,
              pressed && { opacity: 0.6 }
            ]}
            onPress={() => setSelectedCategory('gift-cards')}
          >
            <Text style={styles.categoryText}>Gift Cards</Text>
            <Text style={styles.categoryArrow}>→</Text>
          </Pressable>

          {/* Food/Drink - Coming Soon */}
          <View style={styles.categoryItemDisabled}>
            <Text style={styles.categoryTextDisabled}>Food & Drink</Text>
            <Text style={styles.comingSoonBadge}>Coming Soon</Text>
          </View>

          {/* Bloom Store - Coming Soon */}
          <View style={styles.categoryItemDisabled}>
            <Text style={styles.categoryTextDisabled}>Bloom Store</Text>
            <Text style={styles.comingSoonBadge}>Coming Soon</Text>
          </View>
        </View>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  // Show gift card options if category selected
  if (selectedCategory === 'gift-cards' && !selectedOption) {
    return (
      <View style={styles.container}>
        <Pressable
          style={styles.backButton}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>

        <Text style={styles.headerText}>Gift Cards</Text>

        <View style={styles.optionsList}>
          {REDEMPTION_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={({ pressed }) => [
                styles.optionItem,
                pressed && { opacity: 0.6 }
              ]}
              onPress={() => setSelectedOption(option)}
            >
              <Text style={[styles.optionText, { color: option.color }]}>
                {option.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  // Option selected - show detailed card
  const itemName = `$5 ${selectedOption.name}`;

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        {/* Back to gift cards list */}
        <Pressable
          style={styles.backButton}
          onPress={() => setSelectedOption(null)}
        >
          <Text style={styles.backButtonText}>← Gift Cards</Text>
        </Pressable>

        {/* Redemption Card */}
        <View style={styles.redeemCard}>
          <View style={styles.cardHeader}>
            <Text style={[styles.brandText, { color: selectedOption.color }]}>
              {selectedOption.name}
            </Text>
            <View style={styles.digitalBadge}>
              <Text style={styles.digitalBadgeText}>Digital Code</Text>
            </View>
          </View>

          <View style={styles.exchangeRow}>
            <View style={styles.exchangeItem}>
              {discount > 0 ? (
                <>
                  <Text style={styles.exchangeDaysStrike}>{BASE_COST}</Text>
                  <Text style={styles.exchangeDays}>{finalCost}</Text>
                </>
              ) : (
                <Text style={styles.exchangeDays}>{finalCost}</Text>
              )}
              <Text style={styles.exchangeLabel}>Bloom Days</Text>
            </View>
            <Text style={styles.arrowText}>→</Text>
            <View style={styles.exchangeItem}>
              <Text style={[styles.exchangeValue, { color: selectedOption.color }]}>
                ${ITEM_VALUE.toFixed(0)}
              </Text>
              <Text style={styles.exchangeLabel}>Gift Card</Text>
            </View>
          </View>

          {discount > 0 && (
            <View style={styles.discountBanner}>
              <Text style={styles.discountBannerText}>
                {tierName} Discount: -{discount} days
              </Text>
            </View>
          )}

          <Text style={styles.deliveryText}>Instant delivery to your email</Text>
        </View>

        {/* Email Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Delivery Email</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor="rgba(92, 64, 51, 0.4)"
            value={userEmail}
            onChangeText={setUserEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!isSubmitting}
          />
        </View>

        {/* Preview Box */}
        <View style={[styles.previewBox, !canRedeem && styles.previewBoxInsufficient]}>
          <Text style={[styles.previewLabel, !canRedeem && styles.previewLabelInsufficient]}>
            {canRedeem ? 'PREVIEW' : 'NOT ENOUGH DAYS'}
          </Text>
          <View style={styles.previewRow}>
            <Text style={styles.previewText}>Your current streak:</Text>
            <Text style={styles.previewValue}>{userStreak} days</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewText}>Your price:</Text>
            <Text style={styles.previewValue}>{finalCost} days</Text>
          </View>
          {!canRedeem && (
            <View style={styles.previewRow}>
              <Text style={[styles.previewText, { color: '#E85555' }]}>Need:</Text>
              <Text style={[styles.previewValue, { color: '#E85555' }]}>{daysNeeded} more days</Text>
            </View>
          )}
        </View>

        {/* Redeem Button */}
        <Pressable
          style={[styles.submitButton, (isSubmitting || !userEmail.trim() || !canRedeem) && styles.submitButtonDisabled]}
          onPress={() => {
            if (!canRedeem) {
              Alert.alert(
                'Not Enough Days',
                `You need ${daysNeeded} more days to redeem this. Keep your streak going!`
              );
              return;
            }
            setShowConfirmModal(true);
          }}
          disabled={isSubmitting}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Processing...' : canRedeem ? `Redeem ${itemName}` : `Need ${daysNeeded} More Days`}
          </Text>
        </Pressable>

        {/* Cancel Button */}
        <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={isSubmitting}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>

        {/* Confirmation Modal */}
        <Modal
          visible={showConfirmModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowConfirmModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Confirm Redemption</Text>
              <Text style={styles.modalBody}>
                Exchange {finalCost} Bloom Days for {itemName}?
              </Text>
              <Text style={styles.modalSubtext}>
                Your new streak: {userStreak - finalCost} days
              </Text>
              <Text style={styles.modalEmail}>
                Sending to: {userEmail}
              </Text>

              <View style={styles.modalButtons}>
                <Pressable
                  style={styles.modalCancelButton}
                  onPress={() => setShowConfirmModal(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.modalConfirmButton}
                  onPress={handleRedeem}
                >
                  <Text style={styles.modalConfirmText}>Confirm</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFD7B5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  errorText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 18,
    color: '#5C4033',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorSubtext: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: 'rgba(92, 64, 51, 0.7)',
    marginBottom: 40,
    textAlign: 'center',
  },
  headerText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 24,
    fontWeight: '700',
    color: '#5C4033',
    marginBottom: 4,
    textAlign: 'center',
  },
  tierInfoLink: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 11,
    color: 'rgba(92, 64, 51, 0.7)',
    textAlign: 'center',
    marginBottom: 20,
    textDecorationLine: 'underline',
  },
  subheaderText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 12,
    color: 'rgba(92, 64, 51, 0.7)',
    marginBottom: 30,
    textAlign: 'center',
  },
  categoryList: {
    width: '100%',
    marginBottom: 30,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: '#FFF5EE',
    borderRadius: 12,
    marginBottom: 12,
  },
  categoryText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    fontWeight: '600',
    color: '#5C4033',
  },
  categoryArrow: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 18,
    color: '#E8997E',
  },
  categoryItemDisabled: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 245, 238, 0.5)',
    borderRadius: 12,
    marginBottom: 12,
  },
  categoryTextDisabled: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(92, 64, 51, 0.4)',
  },
  comingSoonBadge: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    color: 'rgba(92, 64, 51, 0.5)',
    fontStyle: 'italic',
  },
  optionsList: {
    width: '100%',
    marginBottom: 30,
  },
  optionItem: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  optionText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 20,
    fontWeight: '600',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  backButtonText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: '#8B6F5C',
  },
  redeemCard: {
    backgroundColor: '#FFF5EE',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 18,
    fontWeight: '700',
  },
  digitalBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  digitalBadgeText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  exchangeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  exchangeItem: {
    alignItems: 'center',
  },
  exchangeDays: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 32,
    fontWeight: '700',
    color: '#5C4033',
  },
  exchangeDaysStrike: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(92, 64, 51, 0.4)',
    textDecorationLine: 'line-through',
  },
  exchangeValue: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 32,
    fontWeight: '700',
  },
  exchangeLabel: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    color: 'rgba(92, 64, 51, 0.6)',
    marginTop: 4,
  },
  arrowText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 24,
    color: '#E8997E',
    marginHorizontal: 20,
  },
  deliveryText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    color: 'rgba(92, 64, 51, 0.5)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  discountBanner: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    alignSelf: 'center',
  },
  discountBannerText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    fontWeight: '500',
    color: '#5C4033',
    marginBottom: 8,
    textAlign: 'center',
  },
  input: {
    fontFamily: 'ZenDots_400Regular',
    backgroundColor: '#FFF5EE',
    borderWidth: 1,
    borderColor: 'rgba(232, 153, 126, 0.3)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#5C4033',
    textAlign: 'center',
  },
  previewBox: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    width: '100%',
    borderWidth: 2,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  previewBoxInsufficient: {
    backgroundColor: 'rgba(232, 85, 85, 0.1)',
    borderColor: 'rgba(232, 85, 85, 0.3)',
  },
  previewLabel: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    fontWeight: '700',
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
  },
  previewLabelInsufficient: {
    color: '#E85555',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 12,
    color: '#5C4033',
  },
  previewValue: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 12,
    color: '#5C4033',
    fontWeight: '600',
  },
  submitButton: {
    width: '100%',
    backgroundColor: '#4CAF50',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButton: {
    width: '100%',
    backgroundColor: 'transparent',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    fontWeight: '500',
    color: '#8B6F5C',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  modalContent: {
    backgroundColor: '#FFF5EE',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 18,
    fontWeight: '700',
    color: '#5C4033',
    marginBottom: 16,
  },
  modalBody: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: '#5C4033',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtext: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 12,
    color: 'rgba(92, 64, 51, 0.7)',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalEmail: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    color: 'rgba(92, 64, 51, 0.5)',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#E0E0E0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
