// In File: app/(tabs)/index.tsx
// REPLACE THE ENTIRE FILE CONTENT WITH THIS:

import { router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, Button } from 'react-native';
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

// The 10-step "Pure Play" Flow
const FLOW_STEPS = [
  'LOCKED_OUT',
  'SPLASH',
  'STROBE',
  'PULSE',
  'REVEAL',
  'PAYOUT',
  'AD_VIDEO',
  'POLL',
  'RESULTS',
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
  const [dailyPoll, setDailyPoll] = useState<any>(null); // The poll question
  const [userPollSubmission, setUserPollSubmission] = useState<any>(null); // What did I pick?
  const [pollResults, setPollResults] = useState<{ option_a: number, option_b: number } | null>(null); // Aggregate results (faked for now)

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

          // --- 2. CHECK FOR A SUBMISSION IN THIS WINDOW ---
          const { data: submissionData, error: submissionError } = await supabase
            .from('poll_submissions') // Check the *new* submissions table
            .select('id, selected_option')
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

          // --- 5. FETCH THE DAILY POLL ---
          const today = new Date().toISOString().split('T')[0];
          const { data: pollData, error: pollError } = await supabase
            .from('daily_polls')
            .select('*')
            .eq('date', today)
            .single(); // Use .single() - we need a poll to function

          if (pollError) throw pollError;
          setDailyPoll(pollData);

          // --- 6. SET LOCKOUT STATE ---
          if (submissionData) {
            // User has already submitted. Lock them out.
            setIsLockedOut(true);
            setUserPollSubmission(submissionData); // Save their submission
            setStepIndex(FLOW_STEPS.indexOf('LOCKED_OUT'));
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

    // 4. HANDLE "AD_VIDEO" AUTO-ADVANCE
    else if (currentStep === 'AD_VIDEO') {
      timeout = setTimeout(() => {
        runOnJS(advanceStep)();
      }, 6000); // 6-second ad
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [currentStep]); // This hook runs *only* when the step changes

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
      'RESULTS',
      'STREAK' // The final step
    ];

    if (manualSteps.includes(currentStep)) {
      if (currentStep === 'STREAK') {
        // Fork logic: STREAK is the final decision point
        if (isWinner) {
          router.replace('/winner-payout'); // Send to winner flow
        } else {
          setIsLockedOut(true); // Send to normal lockout
          setStepIndex(FLOW_STEPS.indexOf('LOCKED_OUT'));
        }
        return;
      }

      advanceStep();
    }
    // If the step is 'STROBE', 'PULSE', 'AD_VIDEO', or 'POLL',
    // this function does NOTHING.
  };

  // --- NEW Poll Submission Logic ---
  const handlePollSelect = async (choice: string) => {
    if (!session || !dailyPoll) return;

    setUserPollSubmission({ selected_option: choice });

    // FAKE results for now
    setPollResults({ option_a: 68, option_b: 32 });

    try {
      // 1. Submit the poll answer
      const { error: submitError } = await supabase.from('poll_submissions').insert({
        user_id: session.user.id,
        poll_id: dailyPoll.id,
        selected_option: choice,
      });
      if (submitError) throw submitError;

      // 2. Increment the streak
      const { error: streakError } = await supabase.rpc('increment_streak', { user_id_param: session.user.id });
      if (streakError) throw streakError;

      // 3. Update local streak state to feel instant
      setUserStreak(userStreak + 1);

    } catch (e) {
      console.error('Error submitting poll:', e);
      // In a real app, you'd show an error here
    }

    // Advance to the results screen
    setStepIndex(FLOW_STEPS.indexOf('RESULTS'));
  };

  // --- The new UI ---
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'LOCKED_OUT':
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            <Text style={styles.headerText}>7 am</Text>
          </View>
        );
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
              <>
                <Text style={styles.headerText}>You Won $5.00!</Text>
                <Text style={styles.subText}>(Payout flow coming soon)</Text>
              </>
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
            <Text style={styles.headerText}>6-Second Ad</Text>
            <Text style={styles.subText}>(Auto-advances)</Text>
          </View>
        );
      case 'POLL':
        if (!dailyPoll) return <View style={[styles.stepContainer, styles.brandBackground]} />;
        return (
          // Use a new container to hold the split layout
          <View style={styles.pollSplitContainer}>
            {/* --- Option A (Left Side) --- */}
            <Pressable
              style={[styles.pollSplitButton, styles.pollSplitLeft]}
              onPress={() => handlePollSelect(dailyPoll.option_a)}
            >
              <Text style={styles.pollSplitTextLeft}>{dailyPoll.option_a}</Text>
            </Pressable>

            {/* --- Option B (Right Side) --- */}
            <Pressable
              style={[styles.pollSplitButton, styles.pollSplitRight]}
              onPress={() => handlePollSelect(dailyPoll.option_b)}
            >
              <Text style={styles.pollSplitText}>{dailyPoll.option_b}</Text>
            </Pressable>
          </View>
        );
      case 'RESULTS':
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            <Text style={styles.headerText}>You chose:</Text>
            <Text style={styles.pollResultText}>{userPollSubmission?.selected_option}</Text>
            <Text style={styles.subText}>(Real results coming soon)</Text>
          </View>
        );
      case 'STREAK':
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            <Text style={styles.subText}>BLOOM STREAK</Text>
            <Text style={styles.headerText}>{userStreak}</Text>
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
      disabled={currentStep === 'LOCKED_OUT' || isLockedOut}
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
  pollSplitContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  pollSplitButton: {
    flex: 1, // Each button takes 50% of the space
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pollSplitLeft: {
    backgroundColor: '#FFD7B5', // Brand Orange
  },
  pollSplitRight: {
    backgroundColor: 'white', // White
  },
  pollSplitText: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#FFD7B5', // Brand orange for right side (white background)
  },
  pollSplitTextLeft: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    color: 'white', // White text for left side (orange background)
  },
  pollResultText: {
    fontSize: 64, // Make the result bigger
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
    textTransform: 'capitalize',
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
