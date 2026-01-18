// components/BloomCard.tsx
// The Bloom Card - Primary balance surface with flip breakdown.

import React, { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface BloomCardProps {
  totalValue: number;
  dailyChange: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const BREAKDOWN_ITEMS = [
  { label: 'S&P 500', ratio: 0.42 },
  { label: 'Cash buffer', ratio: 0.18 },
  { label: 'BTC', ratio: 0.22 },
  { label: 'Treasuries', ratio: 0.18 },
];

export function BloomCard({ totalValue, dailyChange, onPress, style }: BloomCardProps) {
  const [flipped, setFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  const formatValue = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatChange = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)} today`;
  };

  const toggleFlip = () => {
    const next = !flipped;
    setFlipped(next);
    Animated.spring(flipAnim, {
      toValue: next ? 180 : 0,
      useNativeDriver: true,
      tension: 90,
      friction: 10,
    }).start();
    onPress?.();
  };

  const frontRotation = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const backRotation = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const breakdown = BREAKDOWN_ITEMS.map((item) => ({
    ...item,
    value: formatValue(Math.round(totalValue * item.ratio)),
  }));

  return (
    <Pressable style={[styles.container, style]} onPress={toggleFlip}>
      <View style={styles.surface}>
        <Animated.View
          style={[
            styles.face,
            { transform: [{ perspective: 1200 }, { rotateY: frontRotation }] },
          ]}
        >
          <LinearGradient
            colors={['#F5A1D8', '#C8A5F1', '#9CB4F5']}
            start={{ x: 0.15, y: 0.05 }}
            end={{ x: 0.9, y: 0.95 }}
            style={styles.gradient}
          >
            <View style={styles.content}>
              <Text style={styles.valueText}>{formatValue(totalValue)}</Text>
              <Text style={styles.changeText}>{formatChange(dailyChange)}</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View
          style={[
            styles.face,
            { transform: [{ perspective: 1200 }, { rotateY: backRotation }] },
          ]}
        >
          <LinearGradient
            colors={['#F5A1D8', '#C8A5F1', '#9CB4F5']}
            start={{ x: 0.15, y: 0.05 }}
            end={{ x: 0.9, y: 0.95 }}
            style={styles.gradient}
          >
            <View style={styles.backContent}>
              <Text style={styles.breakdownTitle}>Breakdown</Text>
              {breakdown.map((item) => (
                <View key={item.label} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{item.label}</Text>
                  <Text style={styles.breakdownValue}>{item.value}</Text>
                </View>
              ))}
              <Text style={styles.breakdownHint}>Tap to return</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 10,
  },
  surface: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: 'hidden',
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
    transform: [{ translateY: -12 }],
  },
  valueText: {
    fontSize: 52,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -1,
    textShadowColor: 'rgba(0, 0, 0, 0.12)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  changeText: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  backContent: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 28,
    paddingVertical: 26,
    justifyContent: 'center',
    gap: 14,
  },
  breakdownTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  breakdownLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  breakdownValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  breakdownHint: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 4,
  },
});

export default BloomCard;
