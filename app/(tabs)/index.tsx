import { router, useFocusEffect } from 'expo-router'; // We will need this to navigate to the camera
import React, { useEffect, useState, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, Button } from 'react-native';
import VideoPlayer from '../../components/VideoPlayer';
import WinLoseAnimation from '../../components/WinLoseAnimation';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../_layout';

// Define the steps of our flow, based on your Figma
const FLOW_STEPS = [
  'SPLASH',
  'USER_VIDEO',
  'WIN_LOSE',
  'WINNER_VIDEO',
  'AD_BUMPER',
  'AD_VIDEO',
  'PAYOUT',
  'STREAK',
  'LOCKED_OUT',
];

// This is the magic number for detecting a double-tap (in milliseconds)
const DOUBLE_PRESS_DELAY = 300;

const MainFlowScreen = () => {
  const { session } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = FLOW_STEPS[stepIndex];

  // We need to store the timestamp of the last tap
  const [lastTap, setLastTap] = useState(0);

  // Track if the main ad can be skipped
  const [isAdSkippable, setIsAdSkippable] = useState(false);

  // User's streak number (real data from database)
  const [userStreak, setUserStreak] = useState(0);

  // State to hold the user's video URL
  const [userVideoUrl, setUserVideoUrl] = useState<string | null>(null);

  // State to track if the user is locked out for today
  const [isLockedOut, setIsLockedOut] = useState(false);

  // State to hold the daily winner's video URL
  const [winnerVideoUrl, setWinnerVideoUrl] = useState<string | null>(null);

  // Time-based automatic transitions
  useEffect(() => {
    // Logic for the unskippable 3-second "Sponsored by" bumper
    if (currentStep === 'AD_BUMPER') {
      const timer = setTimeout(() => {
        // After 3 seconds, automatically advance the flow to the ad
        advanceToNextStep();
      }, 3000); // 3000 milliseconds = 3 seconds

      return () => clearTimeout(timer); // Cleanup the timer
    }

    // Logic for the 6-second unskippable ad video
    if (currentStep === 'AD_VIDEO') {
      // When the ad video starts, it is NOT skippable
      setIsAdSkippable(false);
      const timer = setTimeout(() => {
        // After 6 seconds, make the ad skippable
        setIsAdSkippable(true);
      }, 6000); // 6000 milliseconds = 6 seconds

      return () => clearTimeout(timer); // Cleanup the timer
    }

    if (currentStep === 'STREAK') {
      const timer = setTimeout(() => {
        router.push('/camera');
      }, 3000); // 3 seconds

      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  // Fetch user's video on component load
  useEffect(() => {
    const fetchUserVideo = async () => {
      if (!session) return;

      try {
        // Query the videos table for the user's most recent video
        const { data, error } = await supabase
          .from('videos')
          .select('storage_path')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('Error fetching user video:', error);
          return;
        }

        if (data && data.length > 0) {
          // Get the public URL for the video
          const { data: urlData } = supabase.storage
            .from('videos')
            .getPublicUrl(data[0].storage_path);

          setUserVideoUrl(urlData.publicUrl);
          console.log('User video URL:', urlData.publicUrl);
        }
      } catch (error) {
        console.error('Error in fetchUserVideo:', error);
      }
    };

    fetchUserVideo();
  }, [session]);

  // Fetch user data and check lockout status on focus
  useFocusEffect(
    useCallback(() => {
      const fetchUserDataAndCheckLockout = async () => {
        if (!session) return;

        try {
          // --- 1. DEFINE THE CURRENT "BLOOM DAY" WINDOW START ---
          const now = new Date();
          const windowStart = new Date(now);

          // If it's before 7 AM, the window started at 7 AM *yesterday*
          if (now.getHours() < 7) {
            windowStart.setDate(now.getDate() - 1);
          }

          // Set the window start time to 7:00:00 AM
          windowStart.setHours(7, 0, 0, 0);

          // --- 2. CHECK FOR A SUBMISSION IN THIS WINDOW ---
          const { data: videoData, error: videoError } = await supabase
            .from('videos')
            .select('id')
            .eq('user_id', session.user.id)
            .gte('created_at', windowStart.toISOString()) // "greater than or equal to" the window start
            .limit(1)
            .maybeSingle();

          if (videoError) throw videoError;

          // --- 3. CHECK FOR STREAK (must be a separate call) ---
          // We use an RPC call to get the streak, which bypasses caching
          const { data: streakData, error: streakError } = await supabase.rpc('get_current_streak');
          if (streakError) throw streakError;

          if (typeof streakData === 'number') {
            setUserStreak(streakData);
          } else {
            setUserStreak(0);
          }

          // --- 4. FETCH THE DAILY WINNER ---
          const today = new Date().toISOString().split('T')[0];
          const { data: winnerData, error: winnerError } = await supabase
            .from('daily_winners')
            .select('video_id, videos ( storage_path )') // Use a join to get the video path
            .eq('date', today)
            .maybeSingle();

          if (winnerError) throw winnerError;

          if (winnerData && winnerData.videos) {
            const videoPath = (winnerData.videos as any).storage_path;
            const { data: urlData } = supabase.storage
              .from('videos')
              .getPublicUrl(videoPath);
            setWinnerVideoUrl(urlData.publicUrl);
          } else {
            // FALLBACK: If no winner is picked yet, use the demo video
            setWinnerVideoUrl('https://idsirmgnimjbvehwdtag.supabase.co/storage/v1/object/public/videos/demo-assets/IMG_1883.MOV');
          }

          // --- 5. SET LOCKOUT STATE ---
          if (videoData) {
            // A video exists for this window. USER IS LOCKED OUT.
            setIsLockedOut(true);
            setStepIndex(FLOW_STEPS.indexOf('LOCKED_OUT'));
          } else {
            // No video found for this window. USER IS FREE TO PLAY.
            setIsLockedOut(false);
            setStepIndex(FLOW_STEPS.indexOf('SPLASH'));
          }

        } catch (e) {
          console.error('Error fetching user data/lockout:', e);
          setIsLockedOut(false); // Fail-safe: let the user play
          setStepIndex(FLOW_STEPS.indexOf('SPLASH'));
        }
      };

      fetchUserDataAndCheckLockout();
    }, [session])
  );

  const handlePress = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTap < DOUBLE_PRESS_DELAY;

    if (isDoubleTap) {
      // UPDATED Bouncer: Now also blocks taps on the final STREAK screen
      if (
        currentStep === 'AD_BUMPER' ||
        (currentStep === 'AD_VIDEO' && !isAdSkippable) ||
        currentStep === 'STREAK'
      ) {
        return; // Do nothing, screen is unskippable
      }

      advanceToNextStep();
    } else {
      setLastTap(now);
    }
  };

  const advanceToNextStep = () => {
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
      case 'SPLASH':
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFD7B5' }}>
            <Text style={{ fontSize: 64, fontWeight: 'bold', color: 'white' }}>BLOOM</Text>
          </View>
        );
      case 'USER_VIDEO':
        return <VideoPlayer uri={userVideoUrl || "https://idsirmgnimjbvehwdtag.supabase.co/storage/v1/object/public/videos/demo-assets/IMG_0985.MOV"} />;
      case 'WIN_LOSE':
        return <WinLoseAnimation />;
      case 'WINNER_VIDEO':
        return <VideoPlayer uri={winnerVideoUrl || "https://idsirmgnimjbvehwdtag.supabase.co/storage/v1/object/public/videos/demo-assets/IMG_1883.MOV"} />;
      case 'AD_BUMPER':
        return (
          <View style={styles.adBumperContainer}>
            <Text style={styles.adBumperText}>Sponsored by...</Text>
          </View>
        );
      case 'AD_VIDEO':
        return <VideoPlayer uri="https://idsirmgnimjbvehwdtag.supabase.co/storage/v1/object/public/videos/demo-assets/IMG_1878.MOV" />;
      case 'PAYOUT':
        return (
          <View style={styles.payoutContainer}>
            <Text style={styles.payoutText}>$5.00 PAID</Text>
          </View>
        );
      case 'STREAK':
        return (
          <View style={styles.streakContainer}>
            <Text style={styles.streakTextLabel}>BLOOM STREAK</Text>
            <Text style={styles.streakTextNumber}>{userStreak}</Text>
          </View>
        );
      case 'LOCKED_OUT':
        return (
          <View style={styles.lockoutContainer}>
            <Text style={styles.lockoutText}>7 am</Text>
          </View>
        );
      default:
        // This will show a loading or error state if something is wrong
        return <FullScreenView text="Loading..." backgroundColor="#ccc" />;
    }
  };

  // The 'Pressable' component is how we detect taps.
  // We're wrapping our entire screen in it.
  return (
    <Pressable onPress={handlePress} style={styles.container} disabled={currentStep === 'LOCKED_OUT'}>
      {renderCurrentStep()}

      {/* --- START: NEW DEBUG PANEL --- */}
      <View style={styles.debugPanel}>
        <Text style={styles.debugText}>-- DEBUG --</Text>
        <Text style={styles.debugText}>Email: {session?.user?.email}</Text>
        <Text style={styles.debugText}>Streak: {userStreak}</Text>
        <Button title="Log Out" color="#888" onPress={() => supabase.auth.signOut()} />
      </View>
      {/* --- END: NEW DEBUG PANEL --- */}
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
  adBumperContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFD7B5',
  },
  adBumperText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  payoutContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFD7B5',
  },
  payoutText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  streakContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFD7B5',
  },
  streakTextLabel: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
  },
  streakTextNumber: {
    color: 'white',
    fontSize: 96,
    fontWeight: 'bold',
    marginTop: 8,
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
  lockoutContainer: {
    flex: 1,
    backgroundColor: '#FFD7B5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockoutText: {
    color: 'white',
    fontSize: 48,
    fontWeight: 'bold',
  },
});

export default MainFlowScreen;
