// components/StrobeAnimation.tsx
import React, { useEffect, useCallback, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
  runOnJS,
  interpolateColor,
  cancelAnimation,
} from 'react-native-reanimated';

const WHITE = '#FFFFFF';
const ORANGE = '#FFD7B5'; // Your brand orange
const FAST_STROBE_DURATION = 2000; // 2 seconds
const MEDIUM_STROBE_DURATION = 2000; // 2 seconds
const SLOW_STROBE_DURATION = 2000; // 2 seconds

export default function StrobeAnimation({ onAnimationComplete }) {
  const flash = useSharedValue(0);
  const isMounted = useRef(true);

  const stableOnComplete = useCallback(() => {
    if (isMounted.current && onAnimationComplete) {
      onAnimationComplete();
    }
  }, [onAnimationComplete]);

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      flash.value,
      [0, 1],
      [ORANGE, WHITE]
    );
    return {
      backgroundColor,
    };
  });

  useEffect(() => {
    isMounted.current = true;
    let fastTimer: ReturnType<typeof setTimeout>;
    let mediumTimer: ReturnType<typeof setTimeout>;
    let slowTimer: ReturnType<typeof setTimeout>;

    // --- PHASE 1: FAST STROBE ---
    // Start a 50ms infinite loop
    flash.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 50 }), // White
        withTiming(0, { duration: 50 })  // Orange
      ),
      -1, true
    );

    // --- PHASE 2: MEDIUM STROBE ---
    // Set a timer to switch to the medium strobe
    fastTimer = setTimeout(() => {
      if (!isMounted.current) return;
      cancelAnimation(flash); // Stop the fast loop

      // Start a new, medium 150ms infinite loop
      flash.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 150 }), // Medium flash
          withTiming(0, { duration: 150 })
        ),
        -1, true
      );

      // --- PHASE 3: SLOW STROBE ---
      // Set a timer to switch to the slow strobe
      mediumTimer = setTimeout(() => {
        if (!isMounted.current) return;
        cancelAnimation(flash); // Stop the medium loop

        // Start a new, slower 250ms infinite loop
        flash.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 250 }), // Slower flash
            withTiming(0, { duration: 250 })
          ),
          -1, true
        );

        // --- PHASE 4: FINISH ---
        // Set a timer to end the slow strobe
        slowTimer = setTimeout(() => {
          if (!isMounted.current) return;
          cancelAnimation(flash); // Stop the slow loop

          // Settle on orange and call the callback
          flash.value = withTiming(0, { duration: 250 }, (isFinished) => {
            if (isFinished) {
              runOnJS(stableOnComplete)();
            }
          });
        }, SLOW_STROBE_DURATION); // 2 seconds of slow flashing

      }, MEDIUM_STROBE_DURATION); // 2 seconds of medium flashing

    }, FAST_STROBE_DURATION); // 3 seconds of fast flashing

    // --- CLEANUP ---
    return () => {
      isMounted.current = false;
      clearTimeout(fastTimer);
      clearTimeout(mediumTimer);
      clearTimeout(slowTimer);
      cancelAnimation(flash);
    };
  }, [stableOnComplete]);

  return (
    <Animated.View style={[styles.flash, animatedStyle]} />
  );
}

const styles = StyleSheet.create({
  flash: {
    ...StyleSheet.absoluteFillObject,
  },
});
