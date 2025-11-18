// In File: app/(tabs)/index.tsx
// REPLACE THE ENTIRE FILE CONTENT WITH THIS:

import { router } from 'expo-router';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, Button, Platform, Alert } from 'react-native';
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
  const streakScreenRef = useRef<View>(null);

  // --- Real Backend State ---
  const [isLockedOut, setIsLockedOut] = useState(true); // Default true to be safe
  const [userStreak, setUserStreak] = useState(0);
  const [streakValue, setStreakValue] = useState<number>(0);
  const [todayPrize, setTodayPrize] = useState<number>(5.00);
  const [yesterdayPrizeAmount, setYesterdayPrizeAmount] = useState<number>(5.00);
  const [isWinner, setIsWinner] = useState(false); // Did *I* win?
  const [dailyWinnerUsername, setDailyWinnerUsername] = useState<string | null>(null); // Who won?
  const [canLiquidateToday, setCanLiquidateToday] = useState(true); // Can user liquidate today?
  const [totalNetworkStreaks, setTotalNetworkStreaks] = useState(0); // Total streaks across all users
  const [totalPlayers, setTotalPlayers] = useState(0); // Number of active players

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

  // --- Helper: Cross-platform Alert ---
  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      // Web fallback - use window.alert
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

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

          // --- 4.5. CHECK IF USER CAN LIQUIDATE TODAY ---
          const { data: profileData } = await supabase
            .from('profile')
            .select('last_liquidation_date')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileData?.last_liquidation_date) {
            const lastLiquidation = new Date(profileData.last_liquidation_date);
            const todayDate = new Date();

            // Compare dates (ignoring time)
            const lastLiquidationDateStr = lastLiquidation.toISOString().split('T')[0];
            const todayDateStr = todayDate.toISOString().split('T')[0];

            const isSameDay = lastLiquidationDateStr === todayDateStr;
            setCanLiquidateToday(!isSameDay);

            console.log('[DEBUG] Liquidation check:', {
              lastLiquidationDateStr,
              todayDateStr,
              canLiquidate: !isSameDay
            });
          } else {
            // No liquidation record, user can liquidate
            setCanLiquidateToday(true);
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

  // --- Fetch Network Stats with Real-Time Updates ---
  useEffect(() => {
    const fetchNetworkStats = async () => {
      try {
        // 1. Calculate total network streaks from all users
        const { data: streaksData } = await supabase
          .from('profile')
          .select('current_streak')
          .gt('current_streak', 0);

        const total = streaksData?.reduce((sum, p) => sum + (p.current_streak || 0), 0) || 0;
        setTotalNetworkStreaks(total);
        console.log('📊 Total network streaks:', total);

        // 2. Calculate REAL-TIME player count (who played TODAY)
        // Define the current "Bloom Day" window (7 AM to 7 AM)
        const now = new Date();
        const windowStart = new Date(now);
        if (now.getHours() < 7) {
          windowStart.setDate(now.getDate() - 1);
        }
        windowStart.setHours(7, 0, 0, 0);

        console.log('🔍 Searching for submissions after:', windowStart.toISOString());

        // Count how many unique users have played in this window
        const { data: submissionsData, error: submissionsError } = await supabase
          .from('poll_submissions')
          .select('user_id')
          .gte('created_at', windowStart.toISOString());

        if (submissionsError) {
          console.error('❌ Error fetching submissions:', submissionsError);
        } else if (submissionsData) {
          console.log('📥 Raw submissions data:', submissionsData?.length, 'entries');

          // Count UNIQUE user_ids using Array spread and Set
          const uniqueUserIds = [...new Set(submissionsData?.map(s => s.user_id) || [])];
          const playerCount = uniqueUserIds.length;

          setTotalPlayers(playerCount);

          console.log('✅ Network stats updated:', {
            totalStreaks: total,
            playersToday: playerCount,
            uniqueUsers: uniqueUserIds.length,
            rawSubmissions: submissionsData?.length || 0,
            windowStart: windowStart.toISOString()
          });
        }
      } catch (e) {
        console.error('❌ Error fetching network stats:', e);
      }
    };

    // Fetch immediately
    fetchNetworkStats();

    // Then poll every 10 seconds for real-time updates
    const interval = setInterval(fetchNetworkStats, 10000);

    return () => clearInterval(interval);
  }, [currentStep]); // Refresh when screen changes

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
            {/* Top section - Streak info */}
            <View style={styles.streakTopSection}>
              <Text style={styles.streakLabel}>BLOOM STREAK</Text>
              <Text style={styles.streakNumber}>{userStreak}</Text>
              <Text style={styles.streakValue}>${streakValue.toFixed(2)} value</Text>
            </View>

            {/* Spacer - pushes network stats and buttons to bottom */}
            <View style={{ flex: 1 }} />

            {/* Middle section - Network stats (closer to bottom) */}
            <View style={styles.networkStatsSection}>
              <Text style={styles.networkStatsText}>
                {totalNetworkStreaks} total streaks
              </Text>
              <Text style={styles.networkStatsSubtext}>
                {totalPlayers} {totalPlayers === 1 ? 'player' : 'players'}
              </Text>
            </View>

            {/* Bottom section - Actions */}
            <View style={styles.streakBottomSection}>
              <Text style={styles.returnText}>Return tomorrow at 7 am</Text>

              {canLiquidateToday && (
                <Pressable
                  onPress={() => {
                    if (userStreak < 3) {
                      showAlert('Locked', 'Need a Bloom Streak of 3 to liquidate');
                      return;
                    }
                    router.push('/liquidate-streak');
                  }}
                  style={({ pressed }) => [
                    styles.liquidateButton,
                    pressed && { opacity: 0.6 }
                  ]}
                >
                  <Text style={[
                    styles.liquidateButtonText,
                    userStreak < 3 && { opacity: 0.4 }
                  ]}>
                    Liquidate
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => supabase.auth.signOut()}
                style={({ pressed }) => [
                  styles.logoutButton,
                  pressed && { opacity: 0.6 }
                ]}
              >
                <Text style={styles.logoutButtonText}>Log Out</Text>
              </Pressable>
            </View>
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

      {/* Debug panel for non-STREAK screens */}
      {currentStep !== 'STREAK' && (
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
    fontFamily: 'ZenDots_400Regular',
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  subText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 24,
    color: 'white',
    opacity: 0.8,
    marginTop: 10,
  },
  // --- STREAK SCREEN LAYOUT ---
  streakTopSection: {
    paddingTop: 120,
    gap: 24,
    alignItems: 'center',
  },
  streakLabel: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 18,
    letterSpacing: 2,
    color: '#fff',
    textAlign: 'center',
  },
  streakNumber: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 100,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  streakValue: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 28,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
  },
  networkStatsSection: {
    marginBottom: 40,
    gap: 20,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  networkStatsText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 24,
  },
  networkStatsSubtext: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    marginTop: 4,
  },
  streakBottomSection: {
    gap: 32,
    alignItems: 'center',
    paddingBottom: 60,
  },
  returnText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  liquidateButton: {
    paddingVertical: 8,
  },
  liquidateButtonText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    color: '#6ccff0', // Bright cyan blue - perfect!
    textAlign: 'center',
  },
  logoutButton: {
    paddingVertical: 8,
  },
  logoutButtonText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  prizeText: {
    fontFamily: 'ZenDots_400Regular',
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
  blurCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFD7B5', // Your brand orange
    // This cover is 100% opaque, completely hiding the text pulsing beneath it.
    // The user will only see the "shape" of the pulse.
  },
});

export default MainFlowScreen;
