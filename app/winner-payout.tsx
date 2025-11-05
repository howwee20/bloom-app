// File: app/winner-payout.tsx
import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './_layout';
import { supabase } from '../lib/supabase';

export default function WinnerPayoutScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [payoutMethod, setPayoutMethod] = useState<'venmo' | 'cashapp' | null>(null);
  const [handle, setHandle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!payoutMethod || !handle.trim() || !session) {
      // TODO: Show validation error
      return;
    }

    setIsSubmitting(true);

    try {
      // Save the payout info to the database
      const { error } = await supabase.from('payout_requests').insert({
        user_id: session.user.id,
        payout_method: payoutMethod,
        handle: handle.trim(),
      });

      if (error) throw error;

      // Reset winner's streak to 0
      // This will become 1 when they play tomorrow (via increment_streak)
      const { error: streakError } = await supabase
        .from('profile')
        .update({ current_streak: 0 })
        .eq('id', session.user.id);

      if (streakError) {
        console.error('Error resetting winner streak:', streakError);
        // Don't block the form submission - just log the error
      }

      // Navigate back to main flow - useFocusEffect will detect submission and show STREAK
      router.replace('/(tabs)');
    } catch (e) {
      console.error('Error submitting payout:', e);
      setIsSubmitting(false);
      // TODO: Show error to user
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>You won Bloom!</Text>

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

      <TextInput
        style={styles.input}
        placeholder="@your-handle"
        placeholderTextColor="#999"
        value={handle}
        onChangeText={setHandle}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting || !payoutMethod || !handle.trim()}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFD7B5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 60,
    textAlign: 'center',
  },
  methodContainer: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 40,
  },
  methodButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: 'white',
  },
  methodButtonSelected: {
    backgroundColor: '#FFD7B5',
    borderColor: 'white',
  },
  methodButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD7B5',
  },
  methodButtonTextSelected: {
    color: 'white',
  },
  input: {
    width: '100%',
    backgroundColor: 'white',
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    borderRadius: 12,
    marginBottom: 40,
    color: '#333',
  },
  submitButton: {
    width: '100%',
    backgroundColor: 'white',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD7B5',
  },
});
