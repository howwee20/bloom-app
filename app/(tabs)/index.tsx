import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WinLoseAnimation from '../../components/WinLoseAnimation';

// Define the steps of our flow, based on your Figma
const FLOW_STEPS = [
  'SPLASH',
  'USER_VIDEO',
  'WIN_LOSE',
  'WINNER_VIDEO',
  'AD_BUMPER',
  'AD_VIDEO',
  'PAYOUT',
  'STREAK',
  'LOCKED_OUT',
];

// This is the magic number for detecting a double-tap (in milliseconds)
const DOUBLE_PRESS_DELAY = 300;

const MainFlowScreen = () => {
  // This function decides what to show on the screen
  const renderCurrentStep = () => {
    // Placeholder - will be rebuilt for new flow
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFD7B5' }}>
        <Text style={{ fontSize: 64, fontWeight: 'bold', color: 'white' }}>BLOOM</Text>
      </View>
    );
  };

  return (
    <Pressable style={styles.container}>
      {renderCurrentStep()}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default MainFlowScreen;
