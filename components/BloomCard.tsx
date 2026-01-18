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

// Gradient colors matching the reference (pink → purple → light blue)
const GRADIENT_COLORS = ['#F87FC4', '#C490F0', '#8FC7FF'] as const;

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

  // Use placeholder values if totalValue is 0
  const displayValue = totalValue > 0 ? formatValue(totalValue) : '$47,291';
  const displayChange = totalValue > 0 ? formatChange(dailyChange) : '+ $127 today';

  return (
    <Pressable style={[styles.container, style]} onPress={toggleFlip}>
      {/* Front face - Balance view */}
      <Animated.View
        style={[
          styles.face,
          { transform: [{ perspective: 1200 }, { rotateY: frontRotation }] },
        ]}
      >
        <LinearGradient
          colors={[...GRADIENT_COLORS]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.content}>
            <Text style={styles.valueText}>{displayValue}</Text>
            <Text style={styles.changeText}>{displayChange}</Text>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Back face - Breakdown view */}
      <Animated.View
        style={[
          styles.face,
          styles.faceBack,
          { transform: [{ perspective: 1200 }, { rotateY: backRotation }] },
        ]}
      >
        <LinearGradient
          colors={[...GRADIENT_COLORS]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  faceBack: {
    // Back face starts rotated
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  valueText: {
    fontSize: 44,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  changeText: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 8,
  },
  backContent: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 28,
    paddingVertical: 32,
    justifyContent: 'center',
    gap: 16,
  },
  breakdownTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  breakdownValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  breakdownHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 12,
    textAlign: 'center',
  },
});

export default BloomCard;
