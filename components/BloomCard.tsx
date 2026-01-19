// components/BloomCard.tsx
// The Bloom Card - Premium liquid glass financial surface

import React, { useRef, useState, useEffect } from 'react';
import {
  Animated,
  Easing,
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

// Premium gradient: smooth 5-stop blend (pink glow → purple → periwinkle glow)
const GRADIENT_COLORS = [
  '#F7B9D8', // top-left warm pink glow
  '#EAA2F0', // upper mid orchid
  '#C989F2', // center purple
  '#B6A7F2', // lower mid lavender
  '#9EC0F7', // bottom-right cool blue glow
] as const;

export function BloomCard({ totalValue, dailyChange, onPress, style }: BloomCardProps) {
  const [flipped, setFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Subtle breathing animation for specular highlight
  useEffect(() => {
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    breathe.start();
    return () => breathe.stop();
  }, [shimmerAnim]);

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

  // Subtle shimmer position shift (4-8px)
  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });
  const shimmerTranslateY = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });
  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.18, 0.26, 0.18],
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

      {/* Subtle dark vignette for depth */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.04)',
        ]}
        locations={[0, 0.6, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.vignetteOverlay}
      />

      {/* Radial-like edge darkening */}
      <View style={styles.edgeVignette} />

      {/* Animated specular sweep highlight (diagonal streak) */}
      <Animated.View
        style={[
          styles.specularSweep,
          {
            opacity: shimmerOpacity,
            transform: [
              { translateX: shimmerTranslateX },
              { translateY: shimmerTranslateY },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.5)',
            'rgba(255,255,255,0.2)',
            'rgba(255,255,255,0)',
          ]}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.specularGradient}
        />
      </Animated.View>

      {/* Secondary soft glow (top) */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.12)',
          'rgba(255,255,255,0.04)',
          'rgba(255,255,255,0)',
        ]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 0.4 }}
        style={styles.topGlow}
      />

      {/* Inner rim lighting (glass thickness) */}
      <View style={styles.innerRimOuter} />
      <View style={styles.innerRimInner} />

      {/* Subtle grain overlay to prevent banding */}
      <View style={styles.grainOverlay} />

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
        <View style={styles.glassFrame}>
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
        </View>
      </View>
    </Pressable>
  );
}

const OUTER_RADIUS = 48;
const FRAME_PADDING = 8;
const INNER_RADIUS = 40;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  // Layer 1: Shadow (softer, more realistic)
  shadowWrapper: {
    flex: 1,
    borderRadius: OUTER_RADIUS,
    shadowColor: '#4A3060',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 32,
    elevation: 12,
  },
  // Layer 2: Glass frame (refined, less pillowy)
  glassFrame: {
    flex: 1,
    padding: FRAME_PADDING,
    borderRadius: OUTER_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
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
  // Edge darkening (simulates radial vignette)
  edgeVignette: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: INNER_RADIUS,
    borderWidth: 20,
    borderColor: 'rgba(0,0,0,0.025)',
  },
  // Animated specular sweep (narrow diagonal streak)
  specularSweep: {
    position: 'absolute',
    top: -20,
    left: -40,
    width: '80%',
    height: '60%',
    transform: [{ rotate: '-15deg' }],
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
    height: '35%',
    borderTopLeftRadius: INNER_RADIUS,
    borderTopRightRadius: INNER_RADIUS,
  },
  // Inner rim outer edge (glass thickness)
  innerRimOuter: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: INNER_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
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
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  // Subtle grain to prevent banding (simulated)
  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(128, 128, 128, 0.03)',
    opacity: 0.5,
  },
  // Content
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 42,
    fontFamily: 'ZenDots',
    color: 'rgba(255, 255, 255, 0.98)',
    letterSpacing: -0.5,
  },
  changeText: {
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 6,
    letterSpacing: 0.2,
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
