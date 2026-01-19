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
  '#FFD4EA', // soft pink highlight
  '#F8BDF0', // airy pink
  '#F3B0E2', // pastel pink center
  '#EBC7FA', // light lavender lift
  '#FAF7FC', // near-white fade
] as const;

const FRAME_COLORS = [
  'rgba(255, 255, 255, 0.22)',
  'rgba(235, 240, 255, 0.55)',
  'rgba(255, 255, 255, 0.25)',
] as const;

const PARTICLES = Array.from({ length: 180 }).map((_, i) => ({
  key: `p-${i}`,
  top: 8 + (i * 11) % 78, // scatter across vertical range
  left: 12 + (i * 23) % 76, // scatter across horizontal range
  size: 1.6 + (i % 9) * 0.55,
  opacity: 0.28 + ((i % 6) * 0.08),
  drift: 10 + (i % 16), // px drift
}));

const FLARES = [
  { key: 'flare-1', top: '18%', left: '28%', size: 160 },
  { key: 'flare-2', top: '58%', left: '68%', size: 180 },
  { key: 'flare-3', top: '42%', left: '48%', size: 140 },
];

export function BloomCard({ totalValue, dailyChange, onPress, style }: BloomCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const textShimmerAnim = useRef(new Animated.Value(0)).current;
  const particleDrift = useRef(new Animated.Value(0)).current;
  const particleColorShift = useRef(new Animated.Value(0)).current;
  const particlePulse = useRef(new Animated.Value(0)).current;
  const hueOverlay = useRef(new Animated.Value(0)).current;
  const flarePulse = useRef(new Animated.Value(0)).current;
  const swirlAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;

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

  // Text shimmer - gentle periodic shine to make numbers feel alive
  useEffect(() => {
    if (reduceMotionEnabled) {
      textShimmerAnim.setValue(0);
      return;
    }
    const textSweep = Animated.loop(
      Animated.sequence([
        // Wait 10 seconds before starting
        Animated.delay(10000),
        // Slow, gentle sweep across in 2 seconds
        Animated.timing(textShimmerAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        // Reset instantly
        Animated.timing(textShimmerAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    textSweep.start();
    return () => textSweep.stop();
  }, [reduceMotionEnabled, textShimmerAnim]);

  // Gentle particle drift
  useEffect(() => {
    if (reduceMotionEnabled) {
      particleDrift.setValue(0);
      particleColorShift.setValue(0);
      particlePulse.setValue(0);
      hueOverlay.setValue(0);
      flarePulse.setValue(0);
      swirlAnim.setValue(0);
      flashAnim.setValue(0);
      return;
    }
    const drift = Animated.loop(
      Animated.sequence([
        Animated.timing(particleDrift, {
          toValue: 1,
          duration: 3600,
          useNativeDriver: true,
        }),
        Animated.timing(particleDrift, {
          toValue: 0,
          duration: 3600,
          useNativeDriver: true,
        }),
      ])
    );
    const colorCycle = Animated.loop(
      Animated.sequence([
        Animated.timing(particleColorShift, {
          toValue: 1,
          duration: 5400,
          useNativeDriver: false, // backgroundColor needs JS thread
        }),
        Animated.timing(particleColorShift, {
          toValue: 0,
          duration: 5400,
          useNativeDriver: false,
        }),
      ])
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(particlePulse, {
          toValue: 1,
          duration: 3600,
          useNativeDriver: true,
        }),
        Animated.timing(particlePulse, {
          toValue: 0,
          duration: 3600,
          useNativeDriver: true,
        }),
      ])
    );
    const hue = Animated.loop(
      Animated.sequence([
        Animated.timing(hueOverlay, {
          toValue: 1,
          duration: 7800,
          useNativeDriver: false,
        }),
        Animated.timing(hueOverlay, {
          toValue: 0,
          duration: 7800,
          useNativeDriver: false,
        }),
      ])
    );
    const flare = Animated.loop(
      Animated.sequence([
        Animated.timing(flarePulse, {
          toValue: 1,
          duration: 6200,
          useNativeDriver: true,
        }),
        Animated.timing(flarePulse, {
          toValue: 0,
          duration: 6200,
          useNativeDriver: true,
        }),
      ])
    );
    const swirl = Animated.loop(
      Animated.sequence([
        Animated.timing(swirlAnim, {
          toValue: 1,
          duration: 5200,
          useNativeDriver: true,
        }),
        Animated.timing(swirlAnim, {
          toValue: 0,
          duration: 5200,
          useNativeDriver: true,
        }),
      ])
    );
    const flash = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0.12,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.delay(2200),
        Animated.timing(flashAnim, {
          toValue: 0.55,
          duration: 620,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    );
    drift.start();
    colorCycle.start();
    pulse.start();
    hue.start();
    flare.start();
    swirl.start();
    flash.start();
    return () => {
      drift.stop();
      colorCycle.stop();
      pulse.stop();
      hue.stop();
      flare.stop();
      swirl.stop();
      flash.stop();
    };
  }, [
    reduceMotionEnabled,
    particleDrift,
    particleColorShift,
    particlePulse,
    hueOverlay,
    flarePulse,
    swirlAnim,
    flashAnim,
  ]);

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

  // Text shimmer sweep position (from -100% to +200% of container width)
  const textShimmerTranslate = textShimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-150, 350], // px - sweeps from left off-screen to right off-screen
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
        locations={[0, 0.28, 0.52, 0.78, 1]}
        start={{ x: 0.08, y: 0.05 }}
        end={{ x: 0.92, y: 0.95 }}
        style={styles.gradient}
      />

      {/* Frosted glass haze */}
      <View style={styles.frostOverlay} />

      {/* Subtle dark vignette for depth */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.025)',
          'rgba(0,0,0,0.04)',
        ]}
        locations={[0, 0.72, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.vignetteOverlay}
      />

      {/* Inner edge shadow for depth */}
      <View style={styles.edgeShadow} />

      {/* Premium specular highlight - diagonal */}
      <Animated.View style={[styles.specularFixed, { transform: [{ rotate: '-12deg' }] }]}>
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.35)',
            'rgba(255,255,255,0.10)',
            'rgba(255,255,255,0.0)',
          ]}
          locations={[0, 0.22, 0.55]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.specularGradient}
        />
      </Animated.View>

      {/* Inner rim lighting (glass thickness) */}
      <View style={styles.innerRimOuter} />
      <View style={styles.innerRimInner} />
      <View style={styles.innerRimStroke} />

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

      {/* Bottom silver fog */}
      <LinearGradient
        colors={[
          'rgba(247,242,250,0.0)',
          'rgba(247,242,250,0.55)',
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bottomFog}
      />

      {/* Subtle grain overlay to prevent banding */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.02)',
          'rgba(0,0,0,0.02)',
          'rgba(255,255,255,0.025)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.grainOverlay}
      />

      {/* Swirling aurora layer */}
      {!reduceMotionEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swirlOverlay,
            {
              opacity: swirlAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.14, 0.34],
              }),
              transform: [
                {
                  translateX: swirlAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-26, 22],
                  }),
                },
                {
                  translateY: swirlAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, -16],
                  }),
                },
                {
                  rotate: swirlAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['-10deg', '16deg'],
                  }),
                },
                {
                  scale: swirlAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.1],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.08)',
              'rgba(255,210,245,0.18)',
              'rgba(205,215,255,0.14)',
              'rgba(255,255,255,0.02)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.swirlGradient}
          />
        </Animated.View>
      )}

      {/* Hue overlay shift */}
      {!reduceMotionEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.hueOverlay,
            {
              opacity: 0.16,
              backgroundColor: hueOverlay.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(255,200,240,0.6)', 'rgba(195,210,255,0.6)'],
              }),
            },
          ]}
        />
      )}

      {/* Cinematic light flash */}
      {!reduceMotionEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flashOverlay,
            {
              opacity: flashAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.45],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.35)',
              'rgba(255,215,245,0.18)',
              'rgba(255,255,255,0)',
            ]}
            locations={[0, 0.28, 1]}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 0.9, y: 0.9 }}
            style={styles.flashGradient}
          />
        </Animated.View>
      )}

      {/* Flares */}
      {!reduceMotionEnabled && (
        <View style={styles.flareLayer} pointerEvents="none">
          {FLARES.map((flare) => (
            <Animated.View
              key={flare.key}
              style={[
                styles.flare,
                {
                  top: flare.top,
                  left: flare.left,
                  width: flare.size,
                  height: flare.size,
                  opacity: 0.32,
                  transform: [
                    {
                      scale: flarePulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1.15],
                      }),
                    },
                  ],
                  backgroundColor: hueOverlay.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['rgba(255, 210, 250, 0.4)', 'rgba(205, 220, 255, 0.4)'],
                  }),
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Particle drift layer */}
      {!reduceMotionEnabled && (
        <View style={styles.particleLayer} pointerEvents="none">
          {PARTICLES.map((p, idx) => (
            <Animated.View
              key={p.key}
              style={[
                styles.particle,
                {
                  top: `${p.top}%`,
                  left: `${p.left}%`,
                  width: p.size,
                  height: p.size,
                  opacity: particlePulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [p.opacity * 0.6, p.opacity * 1.1],
                  }),
                  backgroundColor: particleColorShift.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['rgba(255,255,255,0.98)', 'rgba(205,220,255,0.95)'],
                  }),
                  transform: [
                    {
                      translateX: particleDrift.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-p.drift, p.drift],
                      }),
                    },
                    {
                      translateY: particleDrift.interpolate({
                        inputRange: [0, 1],
                        outputRange: [p.drift * 0.6, -p.drift * 0.6],
                      }),
                    },
                    {
                      scale: particlePulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.82, 1.25],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Content */}
      {!isBack ? (
        <View style={styles.content}>
          {/* Value text with shimmer */}
          <View style={styles.textShimmerContainer}>
            <Text style={styles.valueText}>{displayValue}</Text>
            {!reduceMotionEnabled && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.textShimmer,
                  {
                    transform: [
                      { translateX: textShimmerTranslate },
                      { skewX: '-20deg' },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={[
                    'rgba(255,255,255,0)',
                    'rgba(255,255,255,0.08)',
                    'rgba(255,255,255,0.22)',
                    'rgba(255,255,255,0.08)',
                    'rgba(255,255,255,0)',
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.textShimmerGradient}
                />
              </Animated.View>
            )}
          </View>
          {/* Change text with shimmer */}
          <View style={styles.textShimmerContainerSmall}>
            <Text style={styles.changeText}>{displayChange}</Text>
            {!reduceMotionEnabled && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.textShimmerSmall,
                  {
                    transform: [
                      { translateX: textShimmerTranslate },
                      { skewX: '-20deg' },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={[
                    'rgba(255,255,255,0)',
                    'rgba(255,255,255,0.05)',
                    'rgba(255,255,255,0.15)',
                    'rgba(255,255,255,0.05)',
                    'rgba(255,255,255,0)',
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.textShimmerGradient}
                />
              </Animated.View>
            )}
          </View>
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
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 0.5,
    borderColor: 'rgba(235, 240, 255, 0.55)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    transform: [{ rotate: '-18deg' }],
  },
  specularFixed: {
    position: 'absolute',
    top: -10,
    left: -20,
    width: '130%',
    height: '60%',
  },
  specularGradient: {
    flex: 1,
  },
  // Secondary top glow
  topGlow: {
    display: 'none',
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
  // Thin inner rim stroke
  innerRimStroke: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: INNER_RADIUS - 4,
    borderWidth: 0.6,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  // Subtle grain to prevent banding (simulated)
  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
    transform: [{ rotate: '12deg' }],
    pointerEvents: 'none',
  },
  bottomFog: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '26%',
    opacity: 0.9,
  },
  particleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  hueOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  flareLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  flare: {
    position: 'absolute',
    borderRadius: 999,
    filter: 'blur(18px)' as any,
  },
  swirlOverlay: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ rotate: '-6deg' }],
  },
  swirlGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  flashGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  // Content
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -8 }],
  },
  // Text shimmer containers
  textShimmerContainer: {
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 20,
  },
  textShimmerContainerSmall: {
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 16,
    marginTop: 6,
  },
  textShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 60,
  },
  textShimmerSmall: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 40,
  },
  textShimmerGradient: {
    flex: 1,
  },
  valueText: {
    fontSize: 48,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: 'rgba(255, 255, 255, 0.98)',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.18)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  changeText: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans-Regular',
    color: 'rgba(255, 255, 255, 0.84)',
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
    fontFamily: 'PlusJakartaSans-SemiBold',
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
    fontFamily: 'PlusJakartaSans-Medium',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  breakdownValue: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  breakdownHint: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Regular',
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 10,
    textAlign: 'center',
  },
});

export default BloomCard;
