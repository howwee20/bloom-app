// components/BloomCard.tsx
// The Bloom Card - Premium glass slab with iridescent sheen

import React, { useRef, useState, useEffect } from 'react';
import {
  AccessibilityInfo,
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

const GRADIENT_COLORS = [
  '#F3C7DC', // soft pink
  '#E0BFEA', // lavender
  '#C9BDE8', // violet
  '#B7C6EC', // periwinkle
  '#A8C9F0', // blue haze
] as const;

const FRAME_COLORS = [
  'rgba(255, 255, 255, 0.9)',
  'rgba(215, 225, 255, 0.7)',
  'rgba(255, 230, 248, 0.7)',
] as const;

export function BloomCard({ totalValue, dailyChange, onPress, style }: BloomCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      setReduceMotionEnabled
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  // Subtle sheen animation for the glass surface
  useEffect(() => {
    if (reduceMotionEnabled) {
      shimmerAnim.setValue(0);
      return;
    }
    const sweep = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 18000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 18000,
          useNativeDriver: true,
        }),
      ])
    );
    sweep.start();
    return () => sweep.stop();
  }, [reduceMotionEnabled, shimmerAnim]);

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

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 12],
  });
  const shimmerTranslateY = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 8],
  });
  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.02, 0.05, 0.02],
  });

  const breakdown = BREAKDOWN_ITEMS.map((item) => ({
    ...item,
    value: formatValue(Math.round(totalValue * item.ratio)),
  }));

  const displayValue = totalValue > 0 ? formatValue(totalValue) : '$47,291';
  const displayChange = totalValue > 0 ? formatChange(dailyChange) : '+ $127 today';

  const renderCardFace = (isBack: boolean) => (
    <>
      {/* Base gradient */}
      <LinearGradient
        colors={[...GRADIENT_COLORS]}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0.05, y: 0.05 }}
        end={{ x: 0.95, y: 0.95 }}
        style={styles.gradient}
      />

      {/* Frosted glass haze */}
      <View style={styles.frostOverlay} />

      {/* Subtle dark vignette for depth */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.06)',
        ]}
        locations={[0, 0.6, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.vignetteOverlay}
      />

      {/* Inner edge shadow for depth */}
      <View style={styles.edgeShadow} />

      {/* Specular highlight (top-left) */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.32)',
          'rgba(255,255,255,0.12)',
          'rgba(255,255,255,0)',
        ]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.9, y: 0.6 }}
        style={styles.topGlow}
      />

      {/* Inner rim lighting (glass thickness) */}
      <View style={styles.innerRimOuter} />
      <View style={styles.innerRimInner} />

      {/* Subtle animated sheen */}
      <Animated.View
        style={[
          styles.specularSweep,
          {
            opacity: reduceMotionEnabled ? 0 : shimmerOpacity,
            transform: [
              { translateX: shimmerTranslateX },
              { translateY: shimmerTranslateY },
              { rotate: '-18deg' },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            'rgba(255,255,255,0.35)',
            'rgba(255,255,255,0)',
          ]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.specularGradient}
        />
      </Animated.View>

      {/* Subtle grain overlay to prevent banding */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.02)',
          'rgba(0,0,0,0.02)',
          'rgba(255,255,255,0.015)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.grainOverlay}
      />

      {/* Content */}
      {!isBack ? (
        <View style={styles.content}>
          <Text style={styles.valueText}>{displayValue}</Text>
          <Text style={styles.changeText}>{displayChange}</Text>
        </View>
      ) : (
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
      )}
    </>
  );

  return (
    <Pressable style={[styles.container, style]} onPress={toggleFlip}>
      {/* Layer 1: Shadow wrapper */}
      <View style={styles.shadowWrapper}>
        {/* Layer 2: Glass frame (refined, less pillowy) */}
        <LinearGradient
          colors={[...FRAME_COLORS]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glassFrame}
        >
          {/* Layer 3: Inner slab */}
          <View style={styles.innerSlab}>
            {/* Front face */}
            <Animated.View
              style={[
                styles.face,
                { transform: [{ perspective: 1200 }, { rotateY: frontRotation }] },
              ]}
            >
              {renderCardFace(false)}
            </Animated.View>

            {/* Back face */}
            <Animated.View
              style={[
                styles.face,
                styles.faceBack,
                { transform: [{ perspective: 1200 }, { rotateY: backRotation }] },
              ]}
            >
              {renderCardFace(true)}
            </Animated.View>
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

const OUTER_RADIUS = 46;
const FRAME_PADDING = 6;
const INNER_RADIUS = 40;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  // Layer 1: Shadow (softer, more realistic)
  shadowWrapper: {
    flex: 1,
    borderRadius: OUTER_RADIUS,
    shadowColor: '#2F2A3A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 10,
  },
  // Layer 2: Glass frame (refined, less pillowy)
  glassFrame: {
    flex: 1,
    padding: FRAME_PADDING,
    borderRadius: OUTER_RADIUS,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
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
  faceBack: {},
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  // Subtle vertical vignette
  vignetteOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  frostOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  edgeShadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: INNER_RADIUS,
    borderWidth: 16,
    borderColor: 'rgba(0, 0, 0, 0.02)',
  },
  // Animated specular sweep (narrow diagonal streak)
  specularSweep: {
    position: 'absolute',
    top: -30,
    left: -60,
    width: '140%',
    height: '55%',
  },
  specularGradient: {
    flex: 1,
  },
  // Secondary top glow
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    borderTopLeftRadius: INNER_RADIUS,
    borderTopRightRadius: INNER_RADIUS,
  },
  // Inner rim outer edge (glass thickness)
  innerRimOuter: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: INNER_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  // Inner rim inner edge (subtle)
  innerRimInner: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: INNER_RADIUS - 2,
    borderWidth: 1,
    borderColor: 'rgba(210, 225, 255, 0.2)',
  },
  // Subtle grain to prevent banding (simulated)
  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
    transform: [{ rotate: '12deg' }],
  },
  // Content
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -8 }],
  },
  valueText: {
    fontSize: 48,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.98)',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.18)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  changeText: {
    fontSize: 17,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.84)',
    marginTop: 6,
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0, 0, 0, 0.14)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  backContent: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 32,
    paddingVertical: 36,
    justifyContent: 'center',
    gap: 14,
  },
  breakdownTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  breakdownLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  breakdownValue: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  breakdownHint: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 10,
    textAlign: 'center',
  },
});

export default BloomCard;
