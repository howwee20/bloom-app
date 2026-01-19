// components/BloomCard.tsx
// The Bloom Card - 3D glass-framed gradient slab

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

// Gradient colors matching reference (pink → purple → periwinkle)
const GRADIENT_COLORS = ['#F8B6D2', '#EC9FED', '#C97EDA', '#B6A6EE'] as const;

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
      {/* Layer 1: Outer shadow wrapper */}
      <View style={styles.shadowWrapper}>
        {/* Layer 2: Glass frame / bevel */}
        <View style={styles.glassFrame}>
          {/* Bevel highlight overlay (top-left light) */}
          <View style={styles.bevelHighlight} />
          {/* Bevel shadow overlay (bottom-right dark) */}
          <View style={styles.bevelShadow} />

          {/* Layer 3: Inner gradient slab */}
          <View style={styles.innerSlab}>
            {/* Front face - Balance view */}
            <Animated.View
              style={[
                styles.face,
                { transform: [{ perspective: 1200 }, { rotateY: frontRotation }] },
              ]}
            >
              <LinearGradient
                colors={[...GRADIENT_COLORS]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.gradient}
              >
                {/* Specular highlight for glass effect */}
                <LinearGradient
                  colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.7, y: 0.5 }}
                  style={styles.specularHighlight}
                />
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
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.gradient}
              >
                {/* Specular highlight for glass effect */}
                <LinearGradient
                  colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.7, y: 0.5 }}
                  style={styles.specularHighlight}
                />
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
        </View>
      </View>
    </Pressable>
  );
}

const OUTER_RADIUS = 52;
const FRAME_PADDING = 12;
const INNER_RADIUS = 44;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  // Layer 1: Shadow wrapper for float effect
  shadowWrapper: {
    flex: 1,
    borderRadius: OUTER_RADIUS,
    shadowColor: '#6B4C7A',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.18,
    shadowRadius: 36,
    elevation: 14,
  },
  // Layer 2: Glass frame / bevel
  glassFrame: {
    flex: 1,
    padding: FRAME_PADDING,
    borderRadius: OUTER_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  // Bevel highlight (top-left)
  bevelHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: '50%',
    bottom: '50%',
    borderTopLeftRadius: OUTER_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  // Bevel shadow (bottom-right)
  bevelShadow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    right: 0,
    bottom: 0,
    borderBottomRightRadius: OUTER_RADIUS,
    backgroundColor: 'rgba(160, 140, 200, 0.12)',
  },
  // Layer 3: Inner gradient slab
  innerSlab: {
    flex: 1,
    borderRadius: INNER_RADIUS,
    overflow: 'hidden',
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: INNER_RADIUS,
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
  // Specular highlight for glass effect
  specularHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '70%',
    height: '45%',
    borderTopLeftRadius: INNER_RADIUS,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 48,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -1,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  changeText: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  backContent: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 32,
    paddingVertical: 36,
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
