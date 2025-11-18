// File: app/liquidate-streak.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './_layout';
import { supabase } from '../lib/supabase';

// Constants
const PAYOUT_FRACTION = 0.10; // User gets 10% of equity lost
const MIN_DAYS_TO_BURN = 3; // Minimum 3-day streak required to liquidate
const MAX_CASHOUT_PER_WEEK_CENTS = 500;

export default function LiquidateStreakScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [userStreak, setUserStreak] = useState(0);
  const [currentStreakValue, setCurrentStreakValue] = useState(0); // Current total value in dollars
  const [daysInput, setDaysInput] = useState('');
  const [validationError, setValidationError] = useState('');
  const [previewPayout, setPreviewPayout] = useState<any>(null); // Preview calculation
  const [isCalculating, setIsCalculating] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'venmo' | 'cashapp' | null>(null);
  const [handle, setHandle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch user's current streak and value
  useEffect(() => {
    const fetchStreakData = async () => {
      if (!session) return;

      try {
        // Fetch streak count
        const { data: streakData, error: streakError } = await supabase.rpc('get_current_streak');
        if (streakError) throw streakError;
        const streak = typeof streakData === 'number' ? streakData : 0;
        setUserStreak(streak);

        // Fetch streak value (dynamic based on network)
        const { data: valueData, error: valueError } = await supabase.rpc('get_streak_value');
        if (valueError) throw valueError;
        const value = typeof valueData === 'number' ? valueData : 0;
        setCurrentStreakValue(value);

        console.log('📊 Streak data loaded:', {
          streak,
          currentValue: `$${value.toFixed(2)}`,
          perDayAverage: streak > 0 ? `$${(value / streak).toFixed(4)}` : '$0.00'
        });
      } catch (e) {
        console.error('Error fetching streak data:', e);
        setUserStreak(0);
        setCurrentStreakValue(0);
      }
    };

    fetchStreakData();
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

  // Calculate preview payout using RPC
  useEffect(() => {
    const calculatePreview = async () => {
      const days = parseInt(daysInput, 10);

      // Only calculate if valid input
      if (!daysInput || isNaN(days) || days < 1 || days > userStreak) {
        setPreviewPayout(null);
        return;
      }

      setIsCalculating(true);
      try {
        console.log('🧮 Calculating preview for', days, 'days...');

        const { data, error } = await supabase.rpc('calculate_liquidation_payout', {
          days_to_burn: days
        });

        if (error) {
          console.error('❌ Preview calculation error:', {
            message: error.message,
            code: error.code,
            details: error.details
          });
          throw error;
        }

        console.log('💰 Preview calculation:', data);
        setPreviewPayout(data);
      } catch (e: any) {
        console.error('❌ Error calculating preview:', e);
        setPreviewPayout(null);
        // Show error to user if RPC function doesn't exist
        if (e?.message?.includes('function') || e?.message?.includes('not exist')) {
          Alert.alert(
            'Setup Required',
            'The liquidation calculation function needs to be set up. Please run the SQL migration in Supabase first.'
          );
        }
      } finally {
        setIsCalculating(false);
      }
    };

    // Debounce the calculation for smooth real-time updates
    const timer = setTimeout(calculatePreview, 150);
    return () => clearTimeout(timer);
  }, [daysInput, userStreak]);

  // Validation function
  const validateDays = () => {
    const days = parseInt(daysInput, 10);

    if (!daysInput || isNaN(days)) {
      setValidationError('Please enter a valid number');
      return false;
    }

    if (days < MIN_DAYS_TO_BURN) {
      setValidationError(`Minimum ${MIN_DAYS_TO_BURN} days required`);
      return false;
    }

    if (days > userStreak) {
      setValidationError(`You only have ${userStreak} days in your streak`);
      return false;
    }

    setValidationError('');
    return true;
  };

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
      Alert.alert('Error', 'Handle must be at least 2 characters (plus @)');
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

      const payoutAmount = data?.payoutDollars?.toFixed(2) || '0.00';
      const equityLost = data?.equityCents ? (data.equityCents / 100).toFixed(2) : '0.00';
      const newValue = data?.newValueDollars?.toFixed(2) || '0.00';

      Alert.alert(
        'Success!',
        `Liquidated ${daysToLiquidate} days!\n\n` +
        `You lost $${equityLost} in equity\n` +
        `You receive: $${payoutAmount} (10%)\n\n` +
        `New streak value: $${newValue}\n\n` +
        `Payment will be sent to ${handle} via ${payoutMethod}.`,
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
          You need at least {MIN_DAYS_TO_BURN} streak days to liquidate.
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
          Burn streak days for cash (you receive 10% of the equity you lose)
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
          ) : (
            <Text style={styles.inputHint}>
              Try different amounts (1, 2, 3...) to see how your payout changes
            </Text>
          )}
        </View>

        {/* Before/After Comparison - Always Visible */}
        <View style={styles.comparisonContainer}>
          {/* BEFORE Section */}
          <View style={styles.comparisonBox}>
            <Text style={styles.comparisonLabel}>CURRENT</Text>
            <View style={styles.comparisonContent}>
              <Text style={styles.comparisonStreak}>
                {userStreak} day{userStreak !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.comparisonValue}>
                ${currentStreakValue.toFixed(2)}
              </Text>
              <Text style={styles.comparisonSubtext}>
                {userStreak > 0 ? `$${(currentStreakValue / userStreak).toFixed(4)}/day` : 'No avg'}
              </Text>
            </View>
          </View>

          {/* Arrow */}
          <View style={styles.arrowContainer}>
            <Text style={styles.arrowText}>→</Text>
          </View>

          {/* AFTER Section */}
          <View style={styles.comparisonBox}>
            <Text style={styles.comparisonLabel}>AFTER BURN</Text>
            {isCalculating ? (
              <View style={styles.comparisonContent}>
                <Text style={styles.calculatingText}>...</Text>
              </View>
            ) : previewPayout ? (
              <View style={styles.comparisonContent}>
                <Text style={styles.comparisonStreak}>
                  {previewPayout.newStreak} day{previewPayout.newStreak !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.comparisonValue}>
                  ${previewPayout.newValueDollars?.toFixed(2) || '0.00'}
                </Text>
                <Text style={styles.comparisonSubtext}>
                  -{parseInt(daysInput, 10) || 0} day{parseInt(daysInput, 10) !== 1 ? 's' : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.comparisonContent}>
                <Text style={styles.comparisonPlaceholder}>
                  Enter days above
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Payout Preview - Only show when we have calculation */}
        {previewPayout && !isCalculating && (
          <View style={styles.payoutPreview}>
            <View style={styles.payoutRow}>
              <Text style={styles.payoutRowLabel}>You're burning:</Text>
              <Text style={styles.payoutRowValue}>
                {parseInt(daysInput, 10)} day{parseInt(daysInput, 10) !== 1 ? 's' : ''}
              </Text>
            </View>
            <View style={styles.payoutRow}>
              <Text style={styles.payoutRowLabel}>Equity lost:</Text>
              <Text style={styles.payoutRowValue}>
                ${previewPayout.equityLostDollars?.toFixed(2) || '0.00'}
              </Text>
            </View>
            <View style={styles.payoutDivider} />
            <View style={styles.payoutRow}>
              <Text style={styles.payoutRowLabelBig}>You receive (10%):</Text>
              <Text style={styles.payoutRowValueBig}>
                ${previewPayout.payoutDollars?.toFixed(2) || '0.00'}
              </Text>
            </View>
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
          placeholder="your-handle"
          placeholderTextColor="rgba(92, 64, 51, 0.5)"
          value={handle}
          onChangeText={(text) => {
            // Auto-add @ symbol if user doesn't include it
            if (text === '' || text === '@') {
              // Allow clearing the field
              setHandle('');
            } else {
              const formattedHandle = text.startsWith('@') ? text : '@' + text;
              setHandle(formattedHandle);
            }
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Submit Button */}
        <Pressable
          style={[
            styles.submitButton,
            (isSubmitting || !payoutMethod || !handle.trim() || !previewPayout) && styles.submitButtonDisabled
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || !payoutMethod || !handle.trim() || !previewPayout}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Processing...' :
             !previewPayout ? 'Enter days to continue' :
             !payoutMethod ? 'Select payment method' :
             !handle.trim() ? 'Enter payment handle' :
             'Confirm Cash Out'}
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
    fontFamily: 'ZenDots_400Regular',
    fontSize: 28,
    fontWeight: '600',
    color: '#5C4033',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: '#8B6F5C',
    marginBottom: 40,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: 'ZenDots_400Regular',
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
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    fontWeight: '500',
    color: '#5C4033',
    marginBottom: 12,
    textAlign: 'center',
  },
  daysInput: {
    fontFamily: 'ZenDots_400Regular',
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
    fontFamily: 'ZenDots_400Regular',
    color: '#E85555',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  inputHint: {
    fontFamily: 'ZenDots_400Regular',
    color: 'rgba(139, 111, 92, 0.7)',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  comparisonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  comparisonBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(232, 153, 126, 0.3)',
  },
  comparisonLabel: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 10,
    fontWeight: '700',
    color: '#8B6F5C',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
  },
  comparisonContent: {
    alignItems: 'center',
  },
  comparisonStreak: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    fontWeight: '600',
    color: '#5C4033',
    marginBottom: 4,
  },
  comparisonValue: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 28,
    fontWeight: 'bold',
    color: '#E8997E',
    marginBottom: 4,
  },
  comparisonSubtext: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 11,
    color: '#8B6F5C',
  },
  comparisonPlaceholder: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: 'rgba(139, 111, 92, 0.5)',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  arrowContainer: {
    paddingHorizontal: 12,
  },
  arrowText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 32,
    color: '#E8997E',
    fontWeight: 'bold',
  },
  payoutPreview: {
    backgroundColor: 'rgba(232, 153, 126, 0.15)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    width: '100%',
    borderWidth: 2,
    borderColor: '#E8997E',
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  payoutRowLabel: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: '#5C4033',
    fontWeight: '500',
  },
  payoutRowValue: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: '#5C4033',
    fontWeight: '600',
  },
  payoutDivider: {
    height: 1,
    backgroundColor: 'rgba(232, 153, 126, 0.3)',
    marginVertical: 8,
  },
  payoutRowLabelBig: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    color: '#E8997E',
    fontWeight: '700',
  },
  payoutRowValueBig: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 22,
    color: '#E8997E',
    fontWeight: 'bold',
  },
  calculatingText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    color: '#8B6F5C',
    textAlign: 'center',
    fontStyle: 'italic',
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
    fontFamily: 'ZenDots_400Regular',
    fontSize: 18,
    fontWeight: '600',
    color: '#E8997E',
  },
  methodButtonTextSelected: {
    color: '#fff',
  },
  input: {
    fontFamily: 'ZenDots_400Regular',
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
    fontFamily: 'ZenDots_400Regular',
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
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    fontWeight: '500',
    color: '#8B6F5C',
  },
});
