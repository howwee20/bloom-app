// app/please-confirm-email.tsx
import { View, Text, StyleSheet, Button } from 'react-native';
import { router } from 'expo-router';

export default function PleaseConfirmEmail() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Check Your Email</Text>
      <Text style={styles.subtitle}>
        We sent a confirmation link to your email address.
      </Text>
      <Text style={styles.subtitle}>
        Please click the link to activate your account.
      </Text>
      <Button
        title="Go to Log In"
        onPress={() => router.replace('/login')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFD7B5', // Your brand orange
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#fff',
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    color: '#fff',
  },
});
