// In File: app/(tabs)/index.tsx
// Time Savings Account - Simplified Flow

import { router } from 'expo-router';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../_layout';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from 'expo-router';

// Simplified 3-step flow: Splash → Ad → Streak
const FLOW_STEPS = [
  'SPLASH',
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
  const [lifetimeDays, setLifetimeDays] = useState<number>(0);

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

          // --- 4. FETCH LIFETIME DAYS ---
          const { data: profileData } = await supabase
            .from('profile')
            .select('lifetime_days')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileData) {
            setLifetimeDays(profileData.lifetime_days || 0);
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

    // AD_VIDEO auto-advances to STREAK after 10 seconds
    if (currentStep === 'AD_VIDEO') {
      timeout = setTimeout(() => {
        advanceStep();
      }, 10000); // 10-second ad
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [currentStep]);

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
  }, []);

  const handlePress = () => {
    if (isLockedOut) return;
    const now = Date.now();
    const isDoubleTap = now - lastTap.current < DOUBLE_PRESS_DELAY;
    lastTap.current = now;

    if (!isDoubleTap) return;

    // SPLASH advances on double-tap
    // AD_VIDEO auto-advances (no tap)
    // STREAK is final (no tap)
    if (currentStep === 'SPLASH') {
      advanceStep();
    }
  };

  // --- The UI ---
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'SPLASH':
        return (
          <View style={[styles.stepContainer, styles.brandBackground]}>
            <Text style={styles.headerText}>BLOOM</Text>
            <View style={styles.warningContainer}>
              <Text style={styles.warningText}>Double tap to start</Text>
            </View>
          </View>
        );
      case 'AD_VIDEO':
        return (
          <View style={[styles.stepContainer, styles.adBackground]}>
            <Text style={styles.headerText}>15-Second Ad</Text>
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
            {/* Top spacer - pushes streak to center */}
            <View style={{ flex: 1 }} />

            {/* User's streak info - CENTERED */}
            <View style={styles.streakTopSection}>
              <Text style={styles.streakLabel}>BLOOM STREAK</Text>
              <Text style={styles.streakNumber}>{userStreak}</Text>
              <Text style={styles.lifetimeText}>Lifetime: {lifetimeDays}</Text>
              <Text style={styles.returnText}>Return tomorrow at 7 am</Text>
            </View>

            {/* Bottom spacer - pushes buttons to bottom */}
            <View style={{ flex: 1 }} />

            {/* Bottom section - Actions */}
            <View style={styles.streakBottomSection}>
              {/* Store button */}
              <Pressable
                onPress={() => router.push('/redeem-streak')}
                style={({ pressed }) => [
                  styles.redeemButton,
                  pressed && { opacity: 0.6 }
                ]}
              >
                <Text style={styles.redeemButtonText}>
                  Store
                </Text>
              </Pressable>

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
    >
      {renderCurrentStep()}
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
  streakBottomSection: {
    gap: 40,
    alignItems: 'center',
    paddingBottom: 40,
  },
  lifetimeText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 8,
  },
  returnText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  warningContainer: {
    position: 'absolute',
    bottom: 100,
    alignItems: 'center',
  },
  warningText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  redeemButton: {
    paddingVertical: 8,
  },
  redeemButtonText: {
    fontFamily: 'ZenDots_400Regular',
    fontSize: 16,
    fontWeight: '600',
    color: '#A84296', // Magenta
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
});

export default MainFlowScreen;
