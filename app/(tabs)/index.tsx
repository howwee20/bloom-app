// In File: app/(tabs)/index.tsx
// REPLACE THE ENTIRE FILE CONTENT WITH THIS:

import { router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, Button } from 'react-native';
import WinLoseAnimation from '../../components/WinLoseAnimation';
import { useAuth } from '../_layout';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from 'expo-router';

// The 8-step "Pure Play" Flow
const FLOW_STEPS = [
  'LOCKED_OUT',
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
  const [isRevealComplete, setIsRevealComplete] = useState(false);

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
    if (currentStep === 'AD_VIDEO') {
      const timer = setTimeout(() => advanceStep(), 6000);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  // --- Navigation Logic ---
  const advanceStep = () => {
    setStepIndex((prevIndex) => Math.min(prevIndex + 1, FLOW_STEPS.length - 1));
  };

  const handlePress = () => {
    if (isLockedOut) return;
    const now = Date.now();
    const isDoubleTap = now - lastTap.current < DOUBLE_PRESS_DELAY;
    lastTap.current = now;

    if (!isDoubleTap) return;

    // Fork logic: STREAK is the final decision point
    if (currentStep === 'STREAK') {
      // This is the final step. Check if they won.
      if (isWinner) {
        router.replace('/winner-payout'); // Send to new winner flow
      } else {
        setIsLockedOut(true); // Send to normal lockout
        setStepIndex(FLOW_STEPS.indexOf('LOCKED_OUT'));
      }
      return; // Stop here
    }

    // Block double-tap on REVEAL until animation is complete
    if (currentStep === 'REVEAL' && !isRevealComplete) {
      return;
    }
    // Continue to block these other steps
    if (['AD_VIDEO', 'LOCKED_OUT', 'POLL'].includes(currentStep)) {
      return;
    }

    advanceStep();
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
      case 'REVEAL':
        return (
          <WinLoseAnimation
            isWinner={isWinner}
            backgroundColor="#FFD7B5"
            onAnimationComplete={() => setIsRevealComplete(true)}
          />
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
});

export default MainFlowScreen;
