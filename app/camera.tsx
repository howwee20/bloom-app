import { View, Pressable, StyleSheet, Text, Button, ActivityIndicator, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { FontAwesome } from '@expo/vector-icons';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';

// Helper function for the stabilization delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function CameraScreen() {
  const [cameraState, setCameraState] = useState<'idle' | 'activating' | 'ready' | 'recording'>('idle');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const cameraRef = useRef<CameraView>(null);
  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);

  const curtainOpacity = useSharedValue(1);
  const animatedCurtainStyle = useAnimatedStyle(() => ({ opacity: curtainOpacity.value }));

  useEffect(() => {
    if (!cameraPermission?.granted) { requestCameraPermission(); }
    if (!microphonePermission?.granted) { requestMicrophonePermission(); }
  }, [cameraPermission, microphonePermission]);

  const onCameraReady = useCallback(() => {
    setCameraState('ready');
  }, []);

  const toggleCameraVisibility = useCallback(() => {
    if (cameraState === 'idle') {
      setCameraState('activating');
      curtainOpacity.value = withTiming(0, { duration: 200 });
    } else if (cameraState === 'ready') {
      setCameraState('idle');
      curtainOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [cameraState, curtainOpacity]);

  const toggleCameraType = useCallback(() => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, []);

  // THE FINAL, DEFINITIVE VERSION OF THIS FUNCTION
  const recordVideo = async () => {
    if (cameraState !== 'ready' || !cameraRef.current) {
      return;
    }
    setCameraState('recording');
    try {
      // THE FIX: A simple, brute-force delay to let the hardware stabilize.
      await sleep(150);

      const video = await cameraRef.current.recordAsync({ maxDuration: 6 });
      console.log('Video recorded:', video.uri);
      setHasSubmittedToday(true);
    } catch (e) {
      console.error("Recording failed:", e);
      Alert.alert('Recording Failed', 'The camera could not start. Please try again.');
    } finally {
      setCameraState('idle');
      curtainOpacity.value = withTiming(1, { duration: 0 });
    }
  };

  if (!cameraPermission?.granted || !microphonePermission?.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={{ textAlign: 'center', marginBottom: 20 }}>
          Bloom needs access to your camera and microphone to record your daily video.
        </Text>
        <Button
          onPress={() => {
            requestCameraPermission();
            requestMicrophonePermission();
          }}
          title="Grant Permissions"
        />
      </View>
    );
  }

  // --- UI ---
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {cameraState !== 'idle' && (
        <CameraView
          style={styles.cameraPreview}
          facing={facing}
          ref={cameraRef}
          onCameraReady={onCameraReady}
          mode="video"
        />
      )}

      <Animated.View style={[styles.curtain, animatedCurtainStyle]}>
        {hasSubmittedToday ? (
          <View style={styles.lockoutContainer}>
            <Text style={styles.lockoutText}>7 am</Text>
          </View>
        ) : (
          <View style={styles.whiteCurtainContent} />
        )}
      </Animated.View>

      {!hasSubmittedToday && (
        <View style={styles.controlsContainer}>
          <Pressable
            style={[styles.iconButton, { opacity: cameraState === 'ready' ? 1 : 0 }]}
            onPress={toggleCameraVisibility}
            disabled={cameraState !== 'ready'}
          >
            <FontAwesome name="arrow-left" size={24} color="#333" />
          </Pressable>

          <Pressable
            style={[
              styles.recordButton,
              cameraState === 'recording' && styles.recordButtonRecording,
            ]}
            onPress={cameraState === 'idle' ? toggleCameraVisibility : recordVideo}
            disabled={cameraState === 'activating' || cameraState === 'recording'}
          >
            {cameraState === 'activating' && <ActivityIndicator color="#fff" />}
          </Pressable>

          <Pressable
            style={[styles.iconButton, { opacity: cameraState === 'ready' ? 1 : 0 }]}
            onPress={toggleCameraType}
            disabled={cameraState !== 'ready'}
          >
            <FontAwesome name="refresh" size={24} color="#333" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cameraPreview: {
    ...StyleSheet.absoluteFillObject,
  },
  curtain: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  whiteCurtainContent: {
    flex: 1,
    backgroundColor: 'white',
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
  controlsContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    zIndex: 10,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFD7B5',
    borderWidth: 4,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  recordButtonRecording: {
    backgroundColor: '#E53935',
  },
  iconButton: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
