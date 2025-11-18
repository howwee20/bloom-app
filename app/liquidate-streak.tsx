// File: app/liquidate-streak.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './_layout';
import { supabase } from '../lib/supabase';
import Slider from '@react-native-community/slider';

// Constants
const EQUITY_PER_DAY_CENTS = 10;
const PAYOUT_FRACTION = 0.10;
const MIN_DAYS_TO_BURN = 1;
const MAX_CASHOUT_PER_WEEK_CENTS = 500;

export default function LiquidateStreakScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [userStreak, setUserStreak] = useState(0);
  const [daysToLiquidate, setDaysToLiquidate] = useState(MIN_DAYS_TO_BURN);
  const [payoutMethod, setPayoutMethod] = useState<'venmo' | 'cashapp' | null>(null);
  const [handle, setHandle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch user's current streak
  useEffect(() => {
    const fetchStreak = async () => {
      if (!session) return;

      try {
        const { data, error } = await supabase.rpc('get_current_streak');
        if (error) throw error;
        setUserStreak(typeof data === 'number' ? data : 0);
      } catch (e) {
        console.error('Error fetching streak:', e);
        setUserStreak(0);
      }
    };

    fetchStreak();
  }, [session]);

  // Calculate values in cents
  const equityCents = daysToLiquidate * EQUITY_PER_DAY_CENTS;
  const payoutCents = Math.round(equityCents * PAYOUT_FRACTION);

  // Format cents to dollars
  const equityDollars = (equityCents / 100).toFixed(2);
  const payoutDollars = (payoutCents / 100).toFixed(2);

  const handleSubmit = async () => {
    // Validation
    if (!payoutMethod || !handle.trim() || !session) {
      Alert.alert('Error', 'Please select payment method and enter your handle');
      return;
    }

    if (!handle.startsWith('@')) {
      Alert.alert('Error', 'Handle must start with @');
      return;
    }

    if (handle.length < 3 || handle.length > 30) {
      Alert.alert('Error', 'Handle must be 3-30 characters');
      return;
    }

    if (daysToLiquidate < MIN_DAYS_TO_BURN) {
      Alert.alert('Error', `Minimum ${MIN_DAYS_TO_BURN} days required`);
      return;
    }

    if (daysToLiquidate > userStreak) {
      Alert.alert('Error', 'Insufficient streak days');
      return;
    }

    setIsSubmitting(true);

    try {
      // Call RPC function to process liquidation
      const { data, error } = await supabase.rpc('process_liquidation', {
        days_to_burn: daysToLiquidate,
        payment_method_input: payoutMethod,
        payment_handle_input: handle.trim(),
      });

      if (error) {
        // Check for specific error messages
        if (error.message.includes('Weekly cashout limit')) {
          throw new Error('Weekly cashout limit exceeded ($5.00 max per week)');
        } else if (error.message.includes('Insufficient streak')) {
          throw new Error('Insufficient streak days');
        } else if (error.message.includes('Minimum')) {
          throw new Error(`Minimum ${MIN_DAYS_TO_BURN} days required`);
        }
        throw error;
      }

      // Success! Navigate back to main flow
      Alert.alert(
        'Success!',
        `Liquidated ${daysToLiquidate} days for $${payoutDollars}. Payment will be sent to ${handle}.`,
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)'),
          },
        ]
      );
    } catch (e: any) {
      console.error('Error submitting liquidation:', e);
      setIsSubmitting(false);
      Alert.alert('Error', e.message || 'Failed to process liquidation. Please try again.');
    }
  };

  // Generate slider marks (every day up to user's streak)
  const maxDays = userStreak;
  const canLiquidate = userStreak >= MIN_DAYS_TO_BURN;

  if (!canLiquidate) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Liquidate Streak</Text>
        <Text style={styles.errorText}>
          You need at least {MIN_DAYS_TO_BURN} streak day to liquidate.
        </Text>
        <Pressable
          style={styles.submitButton}
          onPress={() => router.back()}
        >
          <Text style={styles.submitButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Text style={styles.title}>Liquidate Streak</Text>
        <Text style={styles.subtitle}>
          Burn streak days for cash (you receive 10% of equity value)
        </Text>

        {/* Slider Section */}
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderLabel}>Days to Liquidate: {daysToLiquidate}</Text>
          <Slider
            style={styles.slider}
            minimumValue={MIN_DAYS_TO_BURN}
            maximumValue={maxDays}
            step={1}
            value={daysToLiquidate}
            onValueChange={setDaysToLiquidate}
            minimumTrackTintColor="#E8997E"
            maximumTrackTintColor="rgba(232, 153, 126, 0.3)"
            thumbTintColor="#E8997E"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>{MIN_DAYS_TO_BURN}</Text>
            <Text style={styles.sliderLabelText}>{maxDays}</Text>
          </View>
        </View>

        {/* Calculation Display */}
        <View style={styles.calculationContainer}>
          <Text style={styles.calculationText}>
            Liquidating {daysToLiquidate} days = <Text style={styles.highlightText}>${payoutDollars}</Text>
          </Text>
          <Text style={styles.calculationSubtext}>
            (10% of ${equityDollars} equity value)
          </Text>
        </View>

        {/* Payment Method Selection (copied from winner-payout.tsx) */}
        <View style={styles.methodContainer}>
          <Pressable
            style={[
              styles.methodButton,
              payoutMethod === 'venmo' && styles.methodButtonSelected,
            ]}
            onPress={() => setPayoutMethod('venmo')}
          >
            <Text
              style={[
                styles.methodButtonText,
                payoutMethod === 'venmo' && styles.methodButtonTextSelected,
              ]}
            >
              Venmo
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.methodButton,
              payoutMethod === 'cashapp' && styles.methodButtonSelected,
            ]}
            onPress={() => setPayoutMethod('cashapp')}
          >
            <Text
              style={[
                styles.methodButtonText,
                payoutMethod === 'cashapp' && styles.methodButtonTextSelected,
              ]}
            >
              Cash App
            </Text>
          </Pressable>
        </View>

        {/* Handle Input (copied from winner-payout.tsx) */}
        <TextInput
          style={styles.input}
          placeholder="@your-handle"
          placeholderTextColor="rgba(92, 64, 51, 0.5)"
          value={handle}
          onChangeText={setHandle}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Submit Button */}
        <Pressable
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting || !payoutMethod || !handle.trim()}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Processing...' : 'Confirm Cash Out'}
          </Text>
        </Pressable>

        {/* Cancel Button */}
        <Pressable
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={isSubmitting}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
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
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#5C4033',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8B6F5C',
    marginBottom: 40,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#5C4033',
    marginBottom: 40,
    textAlign: 'center',
  },
  sliderContainer: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  sliderLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#5C4033',
    textAlign: 'center',
    marginBottom: 20,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  sliderLabelText: {
    fontSize: 14,
    color: '#8B6F5C',
  },
  calculationContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
    width: '100%',
  },
  calculationText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E8997E',
    textAlign: 'center',
    marginBottom: 5,
  },
  highlightText: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  calculationSubtext: {
    fontSize: 12,
    color: '#8B6F5C',
    textAlign: 'center',
  },
  methodContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
    justifyContent: 'center',
  },
  methodButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8997E',
  },
  methodButtonSelected: {
    backgroundColor: '#E8997E',
    borderColor: '#E8997E',
  },
  methodButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E8997E',
  },
  methodButtonTextSelected: {
    color: '#fff',
  },
  input: {
    width: '100%',
    backgroundColor: '#FFF5EE',
    borderWidth: 1,
    borderColor: 'rgba(232, 153, 126, 0.3)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    borderRadius: 12,
    marginBottom: 30,
    color: '#5C4033',
  },
  submitButton: {
    width: '100%',
    backgroundColor: '#E8997E',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
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
    fontSize: 16,
    fontWeight: '500',
    color: '#8B6F5C',
  },
});
