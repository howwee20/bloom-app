// In File: app/(tabs)/index.tsx
// REPLACE THE ENTIRE FILE CONTENT WITH THIS:

import { router } from 'expo-router';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, Button, Dimensions, TouchableOpacity, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  runOnJS,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
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
  const streakScreenRef = useRef<View>(null);

  // --- Real Backend State ---
  const [isLockedOut, setIsLockedOut] = useState(true); // Default true to be safe
  const [userStreak, setUserStreak] = useState(0);
  const [streakValue, setStreakValue] = useState<number>(0);
  const [todayPrize, setTodayPrize] = useState<number>(5.00);
  const [yesterdayPrizeAmount, setYesterdayPrizeAmount] = useState<number>(5.00);
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

          // --- 3.5. FETCH TODAY'S PRIZE ---
          const today = new Date();
          const todayDateString = today.toISOString().split('T')[0];
          const { data: prizeData, error: prizeError } = await supabase
            .from('daily_prizes')
            .select('prize_amount')
            .eq('date', todayDateString)
            .single();

          if (!prizeError && prizeData) {
            setTodayPrize(prizeData.prize_amount);
          }

          // --- 4. FETCH YESTERDAY'S WINNER ---
          // Users should see who won YESTERDAY's lottery (completed this morning at 7 AM)
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayDateString = yesterday.toISOString().split('T')[0]; // Format: "2025-11-09"

          console.log('[DEBUG] Looking for winner on date:', yesterdayDateString); // Debug log

          const { data: winnerData, error: winnerError } = await supabase
            .from('daily_winners')
            .select('user_id, prize_amount')
            .eq('date', yesterdayDateString) // Fetch yesterday's winner
            .maybeSingle();

          if (winnerError) {
            console.error("Error fetching winner info:", winnerError);
            throw winnerError;
          }

          console.log('[DEBUG] Winner data:', winnerData); // Debug log

          // Fetch winner's username if winner exists
          let winnerUsername = null;
          if (winnerData) {
            const { data: winnerProfile } = await supabase
              .from('profile')
              .select('username')
              .eq('id', winnerData.user_id)
              .single();

            winnerUsername = winnerProfile?.username || 'Unknown';
            console.log('[DEBUG] Winner username:', winnerUsername); // Debug log

            // Store yesterday's prize amount
            setYesterdayPrizeAmount(winnerData.prize_amount || 5.00);
          }

          // Check if current user is the winner
          setIsWinner(winnerData ? winnerData.user_id === session.user.id : false);
          setDailyWinnerUsername(winnerUsername);

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

  // --- Fetch Streak Value with Retry Logic ---
  const fetchStreakValue = async (retryCount = 0) => {
    try {
      // Add small delay to let database update propagate
      if (retryCount === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const { data, error } = await supabase.rpc('get_streak_value');
      if (error) throw error;

      const value = data || 0;

      // If value is 0 and we have a streak, retry once
      if (value === 0 && userStreak > 0 && retryCount === 0) {
        console.log('[DEBUG] Streak value is 0 but streak > 0, retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchStreakValue(1);
      }

      setStreakValue(value);
    } catch (error) {
      console.error('Error fetching streak value:', error);
      setStreakValue(0);
    }
  };

  // --- Refetch Streak Value When Streak Changes ---
  useEffect(() => {
    if (userStreak > 0) {
      fetchStreakValue();
    }
  }, [userStreak]);

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

  // --- Share Handler ---
  const handleShare = async () => {
    // Web doesn't support react-native-view-shot
    if (Platform.OS === 'web') {
      alert('Sharing is not available on web. Download the mobile app to share your streak!');
      return;
    }

    // Native iOS/Android screenshot sharing
    try {
      if (streakScreenRef.current) {
        // Automatically capture the streak screen
        const uri = await captureRef(streakScreenRef.current, {
          format: 'png',
          quality: 1,
        });

        // Open native iOS share sheet with the captured image
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your Bloom Streak',
        });
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

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
            <Text style={styles.prizeText}>Today's Prize: ${todayPrize.toFixed(2)}</Text>
            {isWinner ? (
              <Text style={styles.headerText}>You Won!</Text>
            ) : (
              <Text style={styles.headerText}>Winner: @{dailyWinnerUsername || 'No winner yet'}</Text>
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
          <View
            ref={streakScreenRef}
            style={[styles.stepContainer, styles.brandBackground]}
            collapsable={false}
          >
            <Text style={styles.streakLabel}>BLOOM STREAK</Text>
            <Text style={styles.headerText}>{userStreak}</Text>
            <Text style={styles.streakValue}>
              ${streakValue.toFixed(2)} value
            </Text>
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

      {/* --- BUTTONS --- */}
      {currentStep === 'STREAK' ? (
        <View style={styles.buttonContainer}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
            >
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
          )}

          {userStreak >= 1 && (
            <Pressable
              onPress={() => router.push('/liquidate-streak')}
              style={({ pressed }) => [
                styles.liquidateTextContainer,
                pressed && styles.liquidateTextPressed
              ]}
            >
              <Text style={styles.liquidateText}>Liquidate</Text>
            </Pressable>
          )}

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => supabase.auth.signOut()}
          >
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.debugPanel}>
          <Button title="Log Out" color="#888" onPress={() => supabase.auth.signOut()} />
        </View>
      )}
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
  streakLabel: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 10,
  },
  streakValue: {
    fontSize: 18,
    color: '#666',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  prizeText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
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
  buttonContainer: {
    width: '100%',
    paddingHorizontal: 20,
    position: 'absolute',
    bottom: 40,
    gap: 12,
  },
  shareButton: {
    backgroundColor: '#E8997E',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  liquidateTextContainer: {
    padding: 18,
    alignItems: 'center',
  },
  liquidateText: {
    color: 'rgba(232, 153, 126, 0.6)',
    fontSize: 16,
    fontWeight: '500',
  },
  liquidateTextPressed: {
    opacity: 0.4,
  },
  logoutButton: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  blurCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFD7B5', // Your brand orange
    // This cover is 100% opaque, completely hiding the text pulsing beneath it.
    // The user will only see the "shape" of the pulse.
  },
});

export default MainFlowScreen;
