// File: app/liquidate-streak.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './_layout';
import { supabase } from '../lib/supabase';

// Constants
const EQUITY_PER_DAY_CENTS = 10;
const PAYOUT_FRACTION = 0.10;
const MIN_DAYS_TO_BURN = 1;
const MAX_CASHOUT_PER_WEEK_CENTS = 500;

export default function LiquidateStreakScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [userStreak, setUserStreak] = useState(0);
  const [daysInput, setDaysInput] = useState('');
  const [validationError, setValidationError] = useState('');
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

  // Schema verification - check if required columns exist
  useEffect(() => {
    const checkSchema = async () => {
      if (!session) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('🔍 Schema check: No user authenticated');
          return;
        }

        const { data, error } = await supabase
          .from('profile')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        console.log('🔍 Profile schema check:', {
          hasCurrentStreak: 'current_streak' in (data || {}),
          hasLastLiquidationDate: 'last_liquidation_date' in (data || {}),
          hasTotalCashedOut: 'total_cashed_out_cents' in (data || {}),
          currentStreakValue: data?.current_streak,
          lastLiquidationDate: data?.last_liquidation_date,
          totalCashedOutCents: data?.total_cashed_out_cents,
          error: error?.message
        });

        if (error) {
          console.error('❌ Schema check error:', error);
        }
      } catch (e) {
        console.error('❌ Schema verification failed:', e);
      }
    };

    checkSchema();
  }, [session]);

  // Validation function
  const validateDays = () => {
    const days = parseInt(daysInput, 10);

    if (!daysInput || isNaN(days)) {
      setValidationError('Please enter a valid number');
      return false;
    }

    if (days < MIN_DAYS_TO_BURN) {
      setValidationError(`Minimum ${MIN_DAYS_TO_BURN} day required`);
      return false;
    }

    if (days > userStreak) {
      setValidationError(`You only have ${userStreak} days in your streak`);
      return false;
    }

    setValidationError('');
    return true;
  };

  // Calculate values in cents (use parsed input or 0)
  const daysToLiquidate = parseInt(daysInput, 10) || 0;
  const equityCents = daysToLiquidate * EQUITY_PER_DAY_CENTS;
  const payoutCents = Math.round(equityCents * PAYOUT_FRACTION);

  // Format cents to dollars
  const equityDollars = (equityCents / 100).toFixed(2);
  const payoutDollars = (payoutCents / 100).toFixed(2);

  const handleSubmit = async () => {
    console.log('=== LIQUIDATION DEBUG START ===');

    // Validate days input first
    if (!validateDays()) {
      console.log('❌ Days validation failed');
      return;
    }

    const daysToLiquidate = parseInt(daysInput, 10);

    // Validate payment info
    if (!payoutMethod || !handle.trim() || !session) {
      Alert.alert('Error', 'Please select payment method and enter your handle');
      console.log('❌ Missing payment info or session');
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

    setIsSubmitting(true);

    try {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      console.log('👤 Current user:', user?.id ? `Authenticated (${user.id})` : 'Not authenticated');

      if (!user) {
        Alert.alert('Error', 'You must be logged in to liquidate');
        return;
      }

      // Check current profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profile')
        .select('current_streak, last_liquidation_date, total_cashed_out_cents')
        .eq('id', user.id)
        .maybeSingle();

      console.log('📊 Current profile:', profileData);
      if (profileError) {
        console.error('📊 Profile error:', profileError);
      }

      // Log what we're about to send
      console.log('🔥 Attempting liquidation with params:', {
        days_to_burn: daysToLiquidate,
        payment_method_input: payoutMethod,
        payment_handle_input: handle.trim(),
        userStreak: userStreak,
        profileStreak: profileData?.current_streak,
      });

      // Call RPC function
      console.log('📡 Calling process_liquidation RPC...');

      const { data, error } = await supabase.rpc('process_liquidation', {
        days_to_burn: daysToLiquidate,
        payment_method_input: payoutMethod,
        payment_handle_input: handle.trim(),
      });

      console.log('📡 RPC Response:', { data, error });

      if (error) {
        console.error('❌ Supabase RPC error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: error
        });

        // Handle specific errors
        if (error.message.includes('daily') || error.message.includes('once per day')) {
          Alert.alert('Daily Limit', 'You can only liquidate once per day. Try again tomorrow.');
        } else if (error.message.includes('weekly') || error.message.includes('Weekly cashout')) {
          Alert.alert('Weekly Limit', error.message);
        } else if (error.message.includes('Insufficient')) {
          Alert.alert('Error', 'Insufficient streak days');
        } else {
          Alert.alert('Error', error.message || 'Failed to process liquidation');
        }
        return;
      }

      // Success!
      console.log('✅ Liquidation successful!', data);

      Alert.alert(
        'Success!',
        `Liquidated ${daysToLiquidate} days for $${data?.payoutDollars?.toFixed(2) || payoutDollars}.\n\nPayment will be sent to ${handle} via ${payoutMethod}.`,
        [
          {
            text: 'OK',
            onPress: () => {
              console.log('🔙 Navigating back to main flow');
              router.replace('/(tabs)');
            },
          },
        ]
      );
    } catch (err: any) {
      console.error('❌ Unexpected error:', err);
      Alert.alert('Error', 'An unexpected error occurred. Check console for details.');
    } finally {
      console.log('=== LIQUIDATION DEBUG END ===');
      setIsSubmitting(false);
    }
  };

  // Check if user can liquidate
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

        {/* Days Input Section */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>How many days do you want to liquidate?</Text>
          <TextInput
            style={styles.daysInput}
            value={daysInput}
            onChangeText={(text) => {
              setDaysInput(text);
              setValidationError('');
            }}
            placeholder="Enter number of days"
            placeholderTextColor="rgba(92, 64, 51, 0.4)"
            keyboardType="numeric"
            maxLength={3}
          />
          {validationError ? (
            <Text style={styles.validationError}>{validationError}</Text>
          ) : null}
        </View>

        {/* Calculation Display */}
        {daysToLiquidate > 0 && (
          <View style={styles.calculationContainer}>
            <Text style={styles.calculationText}>
              Liquidating {daysToLiquidate} days = <Text style={styles.highlightText}>${payoutDollars}</Text>
            </Text>
            <Text style={styles.calculationSubtext}>
              (10% of ${equityDollars} equity value)
            </Text>
          </View>
        )}

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
          disabled={isSubmitting || !payoutMethod || !handle.trim() || !daysInput.trim()}
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
  inputContainer: {
    width: '100%',
    paddingHorizontal: 30,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#5C4033',
    marginBottom: 12,
    textAlign: 'center',
  },
  daysInput: {
    backgroundColor: '#FFF5EE',
    borderWidth: 1,
    borderColor: 'rgba(232, 153, 126, 0.3)',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#5C4033',
    textAlign: 'center',
  },
  validationError: {
    color: '#E85555',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
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
