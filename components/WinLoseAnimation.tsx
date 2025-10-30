import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

export default function WinLoseAnimation() {
  const [showText, setShowText] = useState(false);
  const strobeOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    const onAnimationFinish = () => {
      setShowText(true);
      textOpacity.value = withTiming(1, { duration: 500 });
    };

    // This is the new, dynamic pulse animation
    const pulses = [];
    const numberOfPulses = 25; // Controls the total number of flashes
    const baseDuration = 20; // The duration of the very first flash (in ms)
    const durationIncrease = 6; // How much longer each subsequent flash is
    const maxOpacity = 0.9; // The brightness of the first flash
    const opacityDecrease = 0.03; // How much dimmer each subsequent flash is

    for (let i = 0; i < numberOfPulses; i++) {
      const duration = baseDuration + i * durationIncrease;
      const opacity = Math.max(0, maxOpacity - i * opacityDecrease); // Ensure opacity doesn't go below 0

      // Flash ON with calculated opacity and duration
      pulses.push(withTiming(opacity, { duration }));
      // Flash OFF with the same duration for a rhythmic pulse
      pulses.push(withTiming(0, { duration }));
    }

    strobeOpacity.value = withSequence(
      ...pulses,
      // The final callback to show the text
      () => {
        runOnJS(onAnimationFinish)();
      }
    );
  }, []);

  const strobeStyle = useAnimatedStyle(() => {
    return {
      opacity: strobeOpacity.value,
    };
  });

  const textStyle = useAnimatedStyle(() => {
    return {
      opacity: textOpacity.value,
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.strobeOverlay, strobeStyle]} />
      {showText && (
        <Animated.View style={textStyle}>
          <Text style={styles.text}>Not today.</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFD7B5',
  },
  strobeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'white',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
  },
});
