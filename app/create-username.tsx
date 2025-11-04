// app/create-username.tsx
import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from './_layout';

export default function CreateUsername() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  // Get the session from the AuthContext
  const { session } = useAuth();

  const handleCreateUsername = async () => {
    if (username.length < 3) {
      Alert.alert('Username too short', 'Usernames must be at least 3 characters long.');
      return;
    }

    // Simple regex to allow only letters, numbers, and underscores
    const validUsername = /^[a-zA-Z0-9_]{3,50}$/;
    if (!validUsername.test(username)) {
      Alert.alert('Invalid username', 'Usernames can only contain letters, numbers, and underscores.');
      return;
    }

    setLoading(true);

    try {
      // Get the user from the session, not from getUser()
      const user = session?.user;

      if (!user) {
        // This should be impossible if _layout.tsx is working,
        // but it's a good safeguard.
        throw new Error('User session not found. Please log in again.');
      }

      // Update the 'username' column in the 'profile' table
      const { error: profileError } = await supabase
        .from('profile')
        .update({ username: username.toLowerCase() })
        .eq('id', user.id);

      if (profileError) {
        // This will catch the 'isUnique' constraint violation
        if (profileError.code === '23505') {
          Alert.alert('Username taken', 'This username is already taken. Please try another.');
        } else {
          Alert.alert('Error', 'Could not create username. Please try again.');
        }
        throw profileError;
      }

      // Success! Manually replace the route to the main app.
      // We use replace to clear the history, so the user can't go "back"
      // to the username screen.
      router.replace('/(tabs)');

    } catch (error: any) {
      console.error('Error in handleCreateUsername:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your Username</Text>
      <Text style={styles.subtitle}>This will be your public name on Bloom.</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter username"
        placeholderTextColor="#999"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <ActivityIndicator size="large" color="#fff" />
      ) : (
        <Button title="Save and Continue" onPress={handleCreateUsername} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#FFD7B5', // Your brand orange
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#fff',
  },
  input: {
    height: 50,
    backgroundColor: 'white',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
  },
});
