// In File: app/(tabs)/index.tsx
// REPLACE THE ENTIRE FILE CONTENT WITH THIS:

import { router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, Button, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  runOnJS,
} from 'react-native-reanimated';
import StrobeAnimation from '../../components/StrobeAnimation';
import { useAuth } from '../_layout';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from 'expo-router';

// The 7-step "Vending Machine" Flow
const FLOW_STEPS = [
  'SPLASH',
  'STROBE',
  'PULSE',
  'REVEAL',
  'PAYOUT',
  'AD_VIDEO',
  'STREAK',
];

const DOUBLE_PRESS_DELAY = 300;

const MainFlowScreen = () => {
  // --- Real Auth & State ---
  const { session } = useAuth();
  const [stepIndex, setStepIndex] = useState(FLOW_STEPS.indexOf('SPLASH'));
  const currentStep = FLOW_STEPS[stepIndex];
  const lastTap = React.useRef(0);

  // --- Real Backend State ---
  const [isLockedOut, setIsLockedOut] = useState(true); // Default true to be safe
  const [userStreak, setUserStreak] = useState(0);
  const [isWinner, setIsWinner] = useState(false); // Did *I* win?
  const [dailyWinnerUsername, setDailyWinnerUsername] = useState<string | null>(null); // Who won?

  // --- Reveal Animation Shared Values ---
  const revealOpacity = useSharedValue(0);
  const revealScale = useSharedValue(1);

  // --- Animated Style for Reveal ---
  const animatedRevealStyle = useAnimatedStyle(() => {
    return {
      opacity: revealOpacity.value,
      transform: [{ scale: revealScale.value }],
    };
  });

  // --- Data Fetching ---
  useFocusEffect(
    useCallback(() => {
      const fetchAllData = async () => {
        if (!session) return;

        try {
          // --- 1. DEFINE THE CURRENT "BLOOM DAY" WINDOW START ---
          const now = new Date();
          const windowStart = new Date(now);
          if (now.getHours() < 7) {
            windowStart.setDate(now.getDate() - 1);
          }
          windowStart.setHours(7, 0, 0, 0);

          // --- 2. CHECK IF USER HAS PLAYED TODAY ---
          const { data: submissionData, error: submissionError } = await supabase
            .from('poll_submissions') // Track plays (legacy table name)
            .select('id')
            .eq('user_id', session.user.id)
            .gte('created_at', windowStart.toISOString())
            .maybeSingle();

          if (submissionError) throw submissionError;

          // --- 3. CHECK FOR STREAK ---
          const { data: streakData, error: streakError } = await supabase.rpc('get_current_streak');
          if (streakError) throw streakError;
          setUserStreak(typeof streakData === 'number' ? streakData : 0);

          // --- 4. FETCH THE DAILY WINNER (CACHE-PROOF) ---
          const { data: winnerInfo, error: winnerError } = await supabase.rpc('get_winner_info');
          if (winnerError) {
            console.error("Error fetching winner info:", winnerError);
            throw winnerError;
          }

          if (winnerInfo) {
            setDailyWinnerUsername(winnerInfo.dailyWinnerUsername);
            setIsWinner(winnerInfo.isWinner);
          } else {
            // No winner picked yet or function returned null
            setDailyWinnerUsername(null);
            setIsWinner(false);
          }

          // --- 5. SET LOCKOUT STATE ---
          if (submissionData) {
            // User has already played today. Lock them out at STREAK.
            setIsLockedOut(true);
            setStepIndex(FLOW_STEPS.indexOf('STREAK'));
          } else {
            // User is free to play.
            setIsLockedOut(false);
            setStepIndex(FLOW_STEPS.indexOf('SPLASH'));
          }

        } catch (e) {
          console.error('Error fetching data:', e);
          setIsLockedOut(false); // Fail-safe
          setStepIndex(FLOW_STEPS.indexOf('SPLASH'));
        }
      };

      fetchAllData();
    }, [session])
  );

  // --- Auto-advancing logic ---
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    // 1. RESET ANIMATIONS ON SPLASH
    if (currentStep === 'SPLASH') {
      revealOpacity.value = 0;
      revealScale.value = 1;
    }

    // 2. HANDLE "PULSE" ANIMATION & AUTO-ADVANCE
    else if (currentStep === 'PULSE') {
      // Start the PULSING animation (it will be covered)
      revealOpacity.value = withTiming(0.7, { duration: 100 });
      revealScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 150 }), // VIOLENT pulse
          withTiming(1, { duration: 150 })
        ),
        -1, true // Loop infinitely
      );

      // After 2.5 seconds, advance to the final REVEAL step
      timeout = setTimeout(() => {
        runOnJS(advanceStep)();
      }, 2500); // 2.5 seconds of pulsing
    }

    // 3. HANDLE FINAL "REVEAL" STATE (THE FIX)
    else if (currentStep === 'REVEAL') {
      // This is the final, clear state.
      // Stop all animations and set to 100% visible.
      revealOpacity.value = withTiming(1);
      revealScale.value = withTiming(1);
    }

    // 4. HANDLE "AD_VIDEO" AUTO-ADVANCE WITH FORK
    else if (currentStep === 'AD_VIDEO') {
      timeout = setTimeout(async () => {
        // After ad completes, fork based on winner status
        if (isWinner) {
          // Record play BEFORE redirecting to payout form
          await recordPlay();
          runOnJS(router.push)('/winner-payout'); // Winner goes to payout form
        } else {
          runOnJS(advanceStep)(); // Loser advances to STREAK
        }
      }, 10000); // 10-second ad
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [currentStep, isWinner, router]); // Dependencies for auto-advance logic

  // --- Record Play Function ---
  // Extracted for reuse by both winners (after ad) and losers (at STREAK)
  const recordPlay = async () => {
    if (!session?.user || isLockedOut) return;

    try {
      // 1. INCREMENT STREAK
      const { data: newStreak, error: streakError } = await supabase.rpc('increment_streak');
      if (streakError) throw streakError;
      setUserStreak(newStreak);

      // 2. RECORD SUBMISSION (to prevent replays)
      const { error: submissionError } = await supabase.from('poll_submissions').insert({
        user_id: session.user.id,
      });
      if (submissionError) throw submissionError;

      // 3. SET LOCKOUT
      setIsLockedOut(true);
    } catch (err) {
      console.error('Error recording play:', err);
    }
  };

  // --- Streak Increment & Submission Logic ---
  // When losers reach STREAK screen, record their play
  useEffect(() => {
    const recordPlayOnStreak = async () => {
      if (currentStep !== 'STREAK') return;
      await recordPlay();
    };

    recordPlayOnStreak();
  }, [currentStep]);

  // --- Navigation Logic ---
  const advanceStep = useCallback(() => {
    setStepIndex((prevIndex) => Math.min(prevIndex + 1, FLOW_STEPS.length - 1));
  }, []); // Empty dependency array means this function *never* changes.

  // This is the new, STABLE callback we will pass as a prop.
  // It's wrapped in useCallback and depends on the stable advanceStep.
  const onStrobeComplete = useCallback(() => {
    advanceStep();
  }, [advanceStep]);

  const handlePress = () => {
    if (isLockedOut) return;
    const now = Date.now();
    const isDoubleTap = now - lastTap.current < DOUBLE_PRESS_DELAY;
    lastTap.current = now;

    if (!isDoubleTap) return;

    // These are the ONLY steps that advance on double-tap
    const manualSteps = [
      'SPLASH',
      'REVEAL', // The final, revealed text
      'PAYOUT',
      'STREAK' // The final step
    ];

    if (manualSteps.includes(currentStep)) {

      // PAYOUT LOGIC: Always advance to AD, no fork
      if (currentStep === 'PAYOUT') {
        advanceStep(); // Everyone watches the ad
        return;
      }

      // STREAK LOGIC: It's the final screen. Do nothing on double-tap.
      if (currentStep === 'STREAK') {
        return;
      }

      // All other manual steps
      advanceStep();
    }
    // If the step is 'STROBE', 'PULSE', or 'AD_VIDEO',
    // this function does NOTHING.
  };

  // --- The UI ---
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'SPLASH':
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            <Text style={styles.headerText}>BLOOM</Text>
          </View>
        );
      case 'STROBE':
        return (
          <StrobeAnimation
            onAnimationComplete={onStrobeComplete}
          />
        );
      case 'PULSE':
        // This is the "blurred, pulsing" state.
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            {/* 1. The text pulses underneath */}
            <Animated.View style={[styles.stepContainer, animatedRevealStyle]}>
              <Text style={styles.headerText}>{isWinner ? 'YOU WON!' : 'Not Today.'}</Text>
            </Animated.View>

            {/* 2. The "blur cover" sits on top, hiding it */}
            <View style={styles.blurCover} />
          </View>
        );
      case 'REVEAL':
        // This is the final, stable, "revealed" state that waits
        // for the user to double-tap.
        // The logic is now in the useEffect, this just renders.
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            <Animated.View style={[styles.stepContainer, animatedRevealStyle]}>
              <Text style={styles.headerText}>{isWinner ? 'YOU WON!' : 'Not Today.'}</Text>
            </Animated.View>
          </View>
        );
      case 'PAYOUT':
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            {isWinner ? (
              <Text style={styles.headerText}>You Won $5.00!</Text>
            ) : (
              <>
                <Text style={styles.headerText}>Winner: @{dailyWinnerUsername || 'No winner today'}</Text>
                <Text style={styles.subText}>Won $5.00 Today</Text>
              </>
            )}
          </View>
        );
      case 'AD_VIDEO':
        return (
          <View style={[styles.stepContainer, styles.adBackground]}>
            <Text style={styles.headerText}>10-Second Ad</Text>
            <Text style={styles.subText}>(Auto-advances)</Text>
          </View>
        );
      case 'STREAK':
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            <Text style={styles.subText}>BLOOM STREAK</Text>
            <Text style={styles.headerText}>{userStreak}</Text>

            {/* ADD THIS LINE */}
            <Text style={styles.subText}>Return tomorrow at 7 am</Text>
          </View>
        );
      default:
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            <Text style={styles.headerText}>BLOOM</Text>
          </View>
        );
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={styles.container}
      disabled={isLockedOut}
    >
      {renderCurrentStep()}

      {/* --- DEBUG PANEL --- */}
      <View style={styles.debugPanel}>
        <Text style={styles.debugText}>-- DEBUG --</Text>
        <Text style={styles.debugText}>Email: {session?.user?.email}</Text>
        <Text style={styles.debugText}>Streak: {userStreak}</Text>
        <Button title="Log Out" color="#888" onPress={() => supabase.auth.signOut()} />
      </View>
    </Pressable>
  );
};

// --- Add/Keep these styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stepContainer: {
    flex: 1,
    width: '100%',
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
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  subText: {
    fontSize: 24,
    color: 'white',
    opacity: 0.8,
    marginTop: 10,
  },
  debugPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
    zIndex: 10,
  },
  debugText: {
    color: 'white',
    fontSize: 12,
    marginBottom: 5,
  },
  blurCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFD7B5', // Your brand orange
    // This cover is 100% opaque, completely hiding the text pulsing beneath it.
    // The user will only see the "shape" of the pulse.
  },
});

export default MainFlowScreen;
