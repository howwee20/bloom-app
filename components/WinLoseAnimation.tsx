import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export default function WinLoseAnimation({
  isWinner,
  backgroundColor,
  onAnimationComplete
}: {
  isWinner: boolean;
  backgroundColor: string;
  onAnimationComplete: () => void;
}) {
  const [showText, setShowText] = useState(false);
  const strobeOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    const onAnimationFinish = () => {
      setShowText(true);
      textOpacity.value = withTiming(1, { duration: 500 }, () => {
        // Call the callback after text is fully visible
        runOnJS(onAnimationComplete)();
      });
    };

    const pulses = [];
    const numberOfPulses = 25;
    const baseDuration = 20;
    const durationIncrease = 6;
    const maxOpacity = 0.9;
    const opacityDecrease = 0.03;

    for (let i = 0; i < numberOfPulses; i++) {
      const duration = baseDuration + i * durationIncrease;
      const opacity = Math.max(0, maxOpacity - i * opacityDecrease);

      // Flash ON
      pulses.push(withTiming(opacity, { duration }));

      // THE FIX IS HERE: We check if this is the absolute last pulse in the sequence.
      if (i === numberOfPulses - 1) {
        // If it IS the last one, we attach the callback to the final "Flash OFF" animation.
        pulses.push(
          withTiming(0, { duration }, () => {
            runOnJS(onAnimationFinish)();
          })
        );
      } else {
        // If it's NOT the last one, we add the "Flash OFF" animation normally.
        pulses.push(withTiming(0, { duration }));
      }
    }

    strobeOpacity.value = withSequence(...pulses);
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
    <View style={[styles.container, { backgroundColor: backgroundColor }]}>
      <Animated.View style={[styles.strobeOverlay, strobeStyle]} />
      {showText && (
        <Animated.View style={textStyle}>
          <Text style={styles.text}>{isWinner ? 'YOU WON!' : 'Not Today.'}</Text>
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
  },
  strobeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'white',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
