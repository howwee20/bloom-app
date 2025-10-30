import { router } from 'expo-router'; // We will need this to navigate to the camera
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import VideoPlayer from '../../components/VideoPlayer';
import WinLoseAnimation from '../../components/WinLoseAnimation';

// Define the steps of our flow, based on your Figma
const FLOW_STEPS = [
  'USER_VIDEO',
  'WIN_LOSE',
  'WINNER_VIDEO',
  'AD_VIDEO',
  'PAYOUT',
  'STREAK',
  'GO_TO_CAMERA',
];

// This is the magic number for detecting a double-tap (in milliseconds)
const DOUBLE_PRESS_DELAY = 300;

const MainFlowScreen = () => {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = FLOW_STEPS[stepIndex];

  // We need to store the timestamp of the last tap
  const [lastTap, setLastTap] = useState(0);

  // We're renaming this function to be more accurate
  const handlePress = () => {
    const now = Date.now();

    if (now - lastTap < DOUBLE_PRESS_DELAY) {
      // It's a double-tap! Advance the flow.
      handleAdvanceFlow();
    } else {
      // It's just a single tap. Update the last tap time.
      setLastTap(now);
    }
  };

  const handleAdvanceFlow = () => {
    const nextIndex = stepIndex + 1;

    if (nextIndex >= FLOW_STEPS.length) {
      router.push('/camera');
    } else {
      setStepIndex(nextIndex);
    }
  };

  // This function decides what to show on the screen
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'USER_VIDEO':
        return <VideoPlayer uri="https://idsirmgnimjbvehwdtag.supabase.co/storage/v1/object/public/videos/demo-assets/IMG_0985.MOV" />;
      case 'WIN_LOSE':
        return <WinLoseAnimation />;
      case 'WINNER_VIDEO':
        return <VideoPlayer uri="https://idsirmgnimjbvehwdtag.supabase.co/storage/v1/object/public/videos/demo-assets/IMG_1883.MOV" />;
      case 'AD_VIDEO':
        return <FullScreenView text="6 Second Ad" backgroundColor="#ffe000" />;
      case 'PAYOUT':
        return <FullScreenView text="$5.00 PAID" backgroundColor="#fffb00" />;
      case 'STREAK':
        return <FullScreenView text="BLOOM STREAK 5" backgroundColor="#ffdd00" />;
      default:
        // This will show a loading or error state if something is wrong
        return <FullScreenView text="Loading..." backgroundColor="#ccc" />;
    }
  };

  // The 'Pressable' component is how we detect taps.
  // We're wrapping our entire screen in it.
  return (
    <Pressable onPress={handlePress} style={styles.container}>
      {renderCurrentStep()}
    </Pressable>
  );
};

// A helper component to render our fake full-screen views
const FullScreenView = ({ text, backgroundColor }) => (
  <View style={[styles.fullScreen, { backgroundColor }]}>
    <Text style={styles.text}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
});

export default MainFlowScreen;
