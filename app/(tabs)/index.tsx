// In File: app/(tabs)/index.tsx

// 1. Add these imports back at the top
import React, { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WinLoseAnimation from '../../components/WinLoseAnimation'; // We'll re-use this

// 2. REPLACE your entire 'MainFlowScreen' component and 'FLOW_STEPS' with this:

// --- The New "Pure Play" Flow ---
const FLOW_STEPS = [
  'LOCKED_OUT', // NOTE: Logic for this comes in a later ticket. We start at SPLASH.
  'SPLASH',
  'REVEAL',
  'PAYOUT',
  'AD_VIDEO',
  'POLL',
  'RESULTS',
  'STREAK',
];

const DOUBLE_PRESS_DELAY = 300;

const MainFlowScreen = () => {
  // --- State Management ---
  const [stepIndex, setStepIndex] = useState(FLOW_STEPS.indexOf('SPLASH')); // Start at SPLASH
  const currentStep = FLOW_STEPS[stepIndex];
  const lastTap = React.useRef(0);
  const [pollChoice, setPollChoice] = useState<string | null>(null);

  // --- Auto-advancing logic ---
  useEffect(() => {
    if (currentStep === 'AD_VIDEO') {
      const timer = setTimeout(() => {
        advanceStep();
      }, 6000); // 6-second ad
      return () => clearTimeout(timer);
    }
    if (currentStep === 'STREAK') {
      const timer = setTimeout(() => {
        // This is the end of the line. Send to Lockout.
        setStepIndex(FLOW_STEPS.indexOf('LOCKED_OUT'));
      }, 3000); // 3-second streak view
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  // --- Navigation Logic ---
  const advanceStep = () => {
    if (stepIndex < FLOW_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      setStepIndex(FLOW_STEPS.indexOf('LOCKED_OUT'));
    }
  };

  const handlePollSelect = (choice: string) => {
    setPollChoice(choice);
    setStepIndex(FLOW_STEPS.indexOf('RESULTS'));
  };

  const handlePress = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTap.current < DOUBLE_PRESS_DELAY;
    lastTap.current = now;

    if (!isDoubleTap) return;

    // --- Double-Tap Bouncer ---
    // These steps cannot be skipped
    if (currentStep === 'AD_VIDEO' || currentStep === 'STREAK' || currentStep === 'LOCKED_OUT' || currentStep === 'REVEAL') {
      return;
    }

    advanceStep();
  };

  // --- The new UI ---
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'LOCKED_OUT':
        return (
          <View style={[styles.container, styles.brandBackground]}>
            <Text style={styles.headerText}>7 am</Text>
          </View>
        );
      case 'SPLASH':
        return (
          <View style={[styles.container, styles.brandBackground]}>
            <Text style={styles.headerText}>BLOOM</Text>
          </View>
        );
      case 'REVEAL':
        // We'll reuse this. We'll add real win/lose logic later.
        return <WinLoseAnimation onAnimationEnd={advanceStep} />;
      case 'PAYOUT':
        return (
          <View style={[styles.container, styles.brandBackground]}>
            <Text style={styles.headerText}>Winner: @username</Text>
            <Text style={styles.subText}>(Placeholder)</Text>
          </View>
        );
      case 'AD_VIDEO':
        return (
          <View style={[styles.container, styles.adBackground]}>
            <Text style={styles.headerText}>6-Second Ad</Text>
            <Text style={styles.subText}>(Auto-advances)</Text>
          </View>
        );
      case 'POLL':
        return (
          <View style={[styles.container, styles.brandBackground]}>
            <Text style={styles.headerText}>Would You Rather?</Text>
            <View style={styles.pollContainer}>
              <Pressable style={styles.pollButton} onPress={() => handlePollSelect('Coffee')}>
                <Text style={styles.pollButtonText}>Coffee</Text>
              </Pressable>
              <Pressable style={styles.pollButton} onPress={() => handlePollSelect('Tea')}>
                <Text style={styles.pollButtonText}>Tea</Text>
              </Pressable>
            </View>
          </View>
        );
      case 'RESULTS':
        return (
          <View style={[styles.container, styles.brandBackground]}>
            <Text style={styles.headerText}>You and 68% chose:</Text>
            <Text style={styles.pollResultText}>{pollChoice}</Text>
          </View>
        );
      case 'STREAK':
        return (
          <View style={[styles.container, styles.brandBackground]}>
            <Text style={styles.subText}>BLOOM STREAK</Text>
            <Text style={styles.headerText}>0</Text>
          </View>
        );
      default:
        return (
          <View style={[styles.container, styles.brandBackground]}>
            <Text style={styles.headerText}>BLOOM</Text>
          </View>
        );
    }
  };

  return (
    <Pressable onPress={handlePress} style={styles.container} disabled={currentStep === 'LOCKED_OUT'}>
      {renderCurrentStep()}
      {/* We can re-add the debug panel here later */}
    </Pressable>
  );
};

// --- Add these styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandBackground: {
    backgroundColor: '#FFD7B5', // Your brand orange
  },
  adBackground: {
    backgroundColor: '#A0A0A0', // Grey for the ad
  },
  headerText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
  },
  subText: {
    fontSize: 24,
    color: 'white',
    opacity: 0.8,
    marginTop: 10,
  },
  pollContainer: {
    flexDirection: 'row',
    marginTop: 30,
  },
  pollButton: {
    backgroundColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    marginHorizontal: 10,
  },
  pollButtonText: {
    color: '#FFD7B5', // Your brand orange
    fontSize: 24,
    fontWeight: 'bold',
  },
  pollResultText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
    textTransform: 'capitalize',
  },
});

export default MainFlowScreen;
