// File: app/winner-lockout.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function WinnerLockoutScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>7 am</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFD7B5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
  },
});
