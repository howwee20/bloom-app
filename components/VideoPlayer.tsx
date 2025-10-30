import { ResizeMode, Video } from 'expo-av';
import { StyleSheet } from 'react-native';

export default function VideoPlayer({ uri }: { uri: string }) {
  return (
    <Video
      style={StyleSheet.absoluteFill}
      source={{ uri }}
      shouldPlay
      isLooping
      isMuted
      resizeMode={ResizeMode.COVER}
    />
  );
}