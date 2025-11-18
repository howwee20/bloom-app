// File: app/send-streak.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './_layout';
import { supabase } from '../lib/supabase';

export default function SendStreakScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [userStreak, setUserStreak] = useState(0);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [daysInput, setDaysInput] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch user's current streak
  useEffect(() => {
    const fetchStreak = async () => {
      if (!session) return;

      try {
        const { data: streakData, error } = await supabase.rpc('get_current_streak');
        if (error) throw error;
        setUserStreak(typeof streakData === 'number' ? streakData : 0);
      } catch (e) {
        console.error('Error fetching streak:', e);
        setUserStreak(0);
      }
    };

    fetchStreak();
  }, [session]);

  // Validation function
  const validateInput = () => {
    const days = parseInt(daysInput, 10);

    if (!daysInput || isNaN(days)) {
      setValidationError('Please enter a valid number');
      return false;
    }

    if (days < 1) {
      setValidationError('Must send at least 1 day');
      return false;
    }

    if (days >= userStreak) {
      setValidationError(`You only have ${userStreak} days (must keep at least 1)`);
      return false;
    }

    if (userStreak < 3) {
      setValidationError('Need at least 3 days in your streak to send');
      return false;
    }

    if (!recipientUsername.trim()) {
      setValidationError('Enter a username');
      return false;
    }

    setValidationError('');
    return true;
  };

  const handleSend = async () => {
    console.log('=== SEND STREAK DEBUG START ===');

    if (!validateInput()) {
      console.log('❌ Validation failed');
      return;
    }

    const daysToSend = parseInt(daysInput, 10);
    const cleanUsername = recipientUsername.trim().replace('@', ''); // Remove @ if present

    setIsSubmitting(true);

    try {
      console.log('🚀 Sending days:', {
        recipient_username: cleanUsername,
        days_to_send: daysToSend,
      });

      const { data, error } = await supabase.rpc('transfer_streak_days', {
        recipient_username: cleanUsername,
        days_to_send: daysToSend,
      });

      console.log('📡 RPC Response:', { data, error });

      if (error) {
        console.error('❌ Supabase RPC error:', error);
        Alert.alert('Error', error.message);
        setIsSubmitting(false);
        return;
      }

      // SUCCESS - redirect back immediately
      console.log('✅ Transfer successful! Redirecting...', data);
      router.replace('/(tabs)');

      // Show confirmation alert AFTER redirect (prevents multiple clicks)
      setTimeout(() => {
        Alert.alert(
          '✅ Sent!',
          `${daysToSend} day${daysToSend !== 1 ? 's' : ''} sent to @${cleanUsername}`
        );
      }, 300);

    } catch (err: any) {
      console.error('❌ Unexpected error:', err);
      Alert.alert('Error', 'Failed to send days. Try again.');
      setIsSubmitting(false);
    } finally {
      console.log('=== SEND STREAK DEBUG END ===');
    }
  };

  // Check if user can send (needs at least 3 days)
  const canSend = userStreak >= 3;

  if (!canSend) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          You need at least 3 streak days to send.
        </Text>
        <Pressable style={styles.submitButton} onPress={() => router.back()}>
          <Text style={styles.submitButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        {/* Username Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Who do you want to send days to?</Text>
          <TextInput
            style={styles.input}
            placeholder="username"
            placeholderTextColor="rgba(92, 64, 51, 0.4)"
            value={recipientUsername}
            onChangeText={(text) => {
              // Auto-add @ symbol
              if (text === '' || text === '@') {
                setRecipientUsername('');
              } else {
                const formattedUsername = text.startsWith('@') ? text : '@' + text;
                setRecipientUsername(formattedUsername);
              }
              setValidationError('');
            }}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting}
          />
        </View>

        {/* Days Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>How many days do you want to send?</Text>
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
            editable={!isSubmitting}
          />
          {validationError ? (
            <Text style={styles.validationError}>{validationError}</Text>
          ) : (
            <Text style={styles.inputHint}>
              You have {userStreak} days (must keep at least 1)
            </Text>
          )}
        </View>

        {/* Preview Box */}
        {daysInput && !isNaN(parseInt(daysInput, 10)) && parseInt(daysInput, 10) > 0 && parseInt(daysInput, 10) < userStreak && (
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>PREVIEW</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewText}>Your current streak:</Text>
              <Text style={styles.previewValue}>{userStreak} days</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewText}>After sending:</Text>
              <Text style={styles.previewValue}>{userStreak - parseInt(daysInput, 10)} days</Text>
            </View>
            <View style={styles.previewDivider} />
            <View style={styles.previewRow}>
              <Text style={styles.previewTextBig}>Days to send:</Text>
              <Text style={styles.previewValueBig}>{parseInt(daysInput, 10)} days</Text>
            </View>
          </View>
        )}

        {/* Submit Button */}
        <Pressable
          style={[styles.submitButton, (isSubmitting || !recipientUsername.trim() || !daysInput) && styles.submitButtonDisabled]}
          onPress={handleSend}
          disabled={isSubmitting || !recipientUsername.trim() || !daysInput}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Sending...' : 'Send'}
          </Text>
        </Pressable>

        {/* Cancel Button */}
        <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={isSubmitting}>
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
  input: {
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
  previewBox: {
    backgroundColor: 'rgba(230, 230, 250, 0.15)', // Lavender tint
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    width: '100%',
    borderWidth: 2,
    borderColor: '#E6E6FA',
  },
  previewLabel: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 12,
    fontWeight: '700',
    color: '#8B6F5C',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 1,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: '#5C4033',
    fontWeight: '500',
  },
  previewValue: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: '#5C4033',
    fontWeight: '600',
  },
  previewDivider: {
    height: 1,
    backgroundColor: 'rgba(230, 230, 250, 0.3)',
    marginVertical: 8,
  },
  previewTextBig: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    color: '#9370DB', // Medium purple
    fontWeight: '700',
  },
  previewValueBig: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 22,
    color: '#9370DB', // Medium purple
    fontWeight: 'bold',
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
