import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, View } from '@/components/Themed';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';

export default function SignUpScreen() {
  const PRIVACY_URL = 'https://docs.google.com/document/d/e/2PACX-1vR8IV8nOlmshct2SP7BK-mEJbsOIym25AzlM-Yl2udekWpvi_HMPrCJkJa4EbvC5Sbg0aHbHBktwgMb/pub';
  const RULES_URL = 'https://docs.google.com/document/d/e/2PACX-1vR0xmmEntGta26qhqx7ZPbfuZktvRc7U5CX3qE1GjTeCuUm76CY9GX9b99cXjzMhqGie6CusdFl_LoZ/pub';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      Alert.alert('Sign Up Error', error.message);
      setLoading(false);
      return; // Stop execution if there was an error
    }

    // Success - navigate to the "please confirm" screen
    router.replace('/please-confirm-email');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.formContainer}>
        <Text style={styles.title}>Sign Up</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />
        
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!loading}
        />

        <Text style={{ fontFamily: 'ZenDots_400Regular', color: '#6e6e6e', fontSize: 12, textAlign: 'center', marginHorizontal: 30, marginBottom: 15 }}>
          By signing up, you agree to our
          <Text
            style={{ fontFamily: 'ZenDots_400Regular', textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(RULES_URL)}
          >
            {' '}Official Rules
          </Text>
          {' '}and
          <Text
            style={{ fontFamily: 'ZenDots_400Regular', textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          >
            {' '}Privacy Policy
          </Text>
          .
        </Text>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Creating Account...' : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/login')}
          disabled={loading}
        >
          <Text style={styles.linkText}>
            Already have an account? Log In
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#FFD7B5',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
  title: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 40,
    textAlign: 'center',
  },
  input: {
    fontFamily: 'ZenDots_400Regular',
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    color: '#000',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: 'ZenDots_400Regular',
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    fontFamily: 'ZenDots_400Regular',
    color: '#007AFF',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
});
