// components/BloomCard.tsx
// The Bloom Card - Premium glass slab with iridescent sheen

import React, { useRef, useState, useEffect, ReactNode } from 'react';
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
  footer?: ReactNode;
  footerOffset?: number;
  footerHeight?: number;
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

const seeded = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const PARTICLES = Array.from({ length: 260 }).map((_, i) => {
  const r1 = seeded(i * 1.7 + 1);
  const r2 = seeded(i * 2.9 + 11);
  const r3 = seeded(i * 3.3 + 21);
  const r4 = seeded(i * 4.1 + 37);
  const r5 = seeded(i * 5.7 + 49);
  const big = r5 > 0.86 ? 1.8 : 1;
  return {
    key: `p-${i}`,
    top: 6 + r1 * 88,
    left: 6 + r2 * 88,
    size: (1.2 + r3 * 2.8) * big,
    opacity: 0.18 + r4 * 0.55,
    drift: 14 + r3 * 24,
    altDrift: 6 + r2 * 12,
    fastX: 2.6 + r1 * 6.4,
    fastY: 2.4 + r2 * 6.2,
    scaleHi: 1.12 + r4 * 0.55,
    dirX: r2 > 0.5 ? 1 : -1,
    dirY: r3 > 0.5 ? 1 : -1,
  };
});

const FLARES = [
  { key: 'flare-1', top: '16%', left: '22%', size: 220, alpha: 0.28 },
  { key: 'flare-2', top: '30%', left: '70%', size: 280, alpha: 0.34 },
  { key: 'flare-3', top: '52%', left: '50%', size: 240, alpha: 0.3 },
  { key: 'flare-4', top: '68%', left: '28%', size: 220, alpha: 0.26 },
  { key: 'flare-5', top: '40%', left: '84%', size: 300, alpha: 0.36 },
  { key: 'flare-6', top: '74%', left: '66%', size: 320, alpha: 0.32 },
];

export function BloomCard({
  totalValue,
  dailyChange,
  onPress,
  style,
  footer,
  footerOffset = 16,
  footerHeight = 52,
}: BloomCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const textShimmerAnim = useRef(new Animated.Value(0)).current;
  const particleDrift = useRef(new Animated.Value(0)).current;
  const particleDriftAlt = useRef(new Animated.Value(0)).current;
  const particleColorShift = useRef(new Animated.Value(0)).current;
  const particlePulse = useRef(new Animated.Value(0)).current;
  const hueOverlay = useRef(new Animated.Value(0)).current;
  const flarePulse = useRef(new Animated.Value(0)).current;
  const swirlAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const fastJitter = useRef(new Animated.Value(0)).current;
  const fastJitterAlt = useRef(new Animated.Value(0)).current;
  const smokeAnimA = useRef(new Animated.Value(0)).current;
  const smokeAnimB = useRef(new Animated.Value(0)).current;

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
      particleDriftAlt.setValue(0);
      particleColorShift.setValue(0);
      particlePulse.setValue(0);
      hueOverlay.setValue(0);
      flarePulse.setValue(0);
      swirlAnim.setValue(0);
      flashAnim.setValue(0);
      fastJitter.setValue(0);
      fastJitterAlt.setValue(0);
      smokeAnimA.setValue(0);
      smokeAnimB.setValue(0);
      return;
    }
    const drift = Animated.loop(
      Animated.sequence([
        Animated.timing(particleDrift, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(particleDrift, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: true,
        }),
      ])
    );
    const driftAlt = Animated.loop(
      Animated.sequence([
        Animated.timing(particleDriftAlt, {
          toValue: 1,
          duration: 4300,
          useNativeDriver: true,
        }),
        Animated.timing(particleDriftAlt, {
          toValue: 0,
          duration: 4300,
          useNativeDriver: true,
        }),
      ])
    );
    const colorCycle = Animated.loop(
      Animated.sequence([
        Animated.timing(particleColorShift, {
          toValue: 1,
          duration: 4200,
          useNativeDriver: false, // backgroundColor needs JS thread
        }),
        Animated.timing(particleColorShift, {
          toValue: 0,
          duration: 4200,
          useNativeDriver: false,
        }),
      ])
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(particlePulse, {
          toValue: 1,
          duration: 2400,
          useNativeDriver: true,
        }),
        Animated.timing(particlePulse, {
          toValue: 0,
          duration: 2400,
          useNativeDriver: true,
        }),
      ])
    );
    const hue = Animated.loop(
      Animated.sequence([
        Animated.timing(hueOverlay, {
          toValue: 1,
          duration: 5200,
          useNativeDriver: false,
        }),
        Animated.timing(hueOverlay, {
          toValue: 0,
          duration: 5200,
          useNativeDriver: false,
        }),
      ])
    );
    const flare = Animated.loop(
      Animated.sequence([
        Animated.timing(flarePulse, {
          toValue: 1,
          duration: 4200,
          useNativeDriver: true,
        }),
        Animated.timing(flarePulse, {
          toValue: 0,
          duration: 4200,
          useNativeDriver: true,
        }),
      ])
    );
    const swirl = Animated.loop(
      Animated.sequence([
        Animated.timing(swirlAnim, {
          toValue: 1,
          duration: 3600,
          useNativeDriver: true,
        }),
        Animated.timing(swirlAnim, {
          toValue: 0,
          duration: 3600,
          useNativeDriver: true,
        }),
      ])
    );
    const flash = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0.12,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.delay(1400),
        Animated.timing(flashAnim, {
          toValue: 0.7,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    const fast = Animated.loop(
      Animated.sequence([
        Animated.timing(fastJitter, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(fastJitter, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    const fastAlt = Animated.loop(
      Animated.sequence([
        Animated.timing(fastJitterAlt, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(fastJitterAlt, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    const smokeA = Animated.loop(
      Animated.sequence([
        Animated.timing(smokeAnimA, {
          toValue: 1,
          duration: 6200,
          useNativeDriver: true,
        }),
        Animated.timing(smokeAnimA, {
          toValue: 0,
          duration: 6200,
          useNativeDriver: true,
        }),
      ])
    );
    const smokeB = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(smokeAnimB, {
          toValue: 1,
          duration: 7400,
          useNativeDriver: true,
        }),
        Animated.timing(smokeAnimB, {
          toValue: 0,
          duration: 7400,
          useNativeDriver: true,
        }),
      ])
    );
    drift.start();
    driftAlt.start();
    colorCycle.start();
    pulse.start();
    hue.start();
    flare.start();
    swirl.start();
    flash.start();
    fast.start();
    fastAlt.start();
    smokeA.start();
    smokeB.start();
    return () => {
      drift.stop();
      driftAlt.stop();
      colorCycle.stop();
      pulse.stop();
      hue.stop();
      flare.stop();
      swirl.stop();
      flash.stop();
      fast.stop();
      fastAlt.stop();
      smokeA.stop();
      smokeB.stop();
    };
  }, [
    reduceMotionEnabled,
    particleDrift,
    particleDriftAlt,
    particleColorShift,
    particlePulse,
    hueOverlay,
    flarePulse,
    swirlAnim,
    flashAnim,
    fastJitter,
    fastJitterAlt,
    smokeAnimA,
    smokeAnimB,
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

      {/* Outer bevel to add 3D edge */}
      <View style={styles.outerBevel} pointerEvents="none" />
      <View style={styles.outerBevelInner} pointerEvents="none" />

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
          'rgba(255,228,242,0.0)',
          'rgba(245,225,255,0.32)',
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

      {/* Smoke / nebula energy */}
      {!reduceMotionEnabled && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.smokeOverlay,
              {
                opacity: smokeAnimA.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.12, 0.4],
                }),
                transform: [
                  {
                    translateX: smokeAnimA.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-40, 36],
                    }),
                  },
                  {
                    translateY: smokeAnimA.interpolate({
                      inputRange: [0, 1],
                      outputRange: [30, -28],
                    }),
                  },
                  {
                    scale: smokeAnimA.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1.05, 1.2],
                    }),
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.1)',
                'rgba(255,210,240,0.32)',
                'rgba(210,225,255,0.24)',
                'rgba(255,255,255,0.04)',
              ]}
              start={{ x: 0.2, y: 0.1 }}
              end={{ x: 0.9, y: 0.9 }}
              style={styles.smokeGradient}
            />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.smokeOverlay,
              {
                opacity: smokeAnimB.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.1, 0.36],
                }),
                transform: [
                  {
                    translateX: smokeAnimB.interpolate({
                      inputRange: [0, 1],
                      outputRange: [32, -28],
                    }),
                  },
                  {
                    translateY: smokeAnimB.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 24],
                    }),
                  },
                  {
                    scale: smokeAnimB.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1.1, 1.28],
                    }),
                  },
                  { rotate: '-8deg' },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.08)',
                'rgba(240,200,255,0.32)',
                'rgba(205,220,255,0.28)',
                'rgba(255,255,255,0.06)',
              ]}
              start={{ x: 0.1, y: 0.2 }}
              end={{ x: 0.9, y: 0.8 }}
              style={styles.smokeGradient}
            />
          </Animated.View>
        </>
      )}

      {/* Swirling aurora layer */}
      {!reduceMotionEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swirlOverlay,
            {
              opacity: swirlAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.22, 0.6],
              }),
              transform: [
                {
                  translateX: swirlAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-40, 34],
                  }),
                },
                {
                  translateY: swirlAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [32, -26],
                  }),
                },
                {
                  rotate: swirlAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['-14deg', '20deg'],
                  }),
                },
                {
                  scale: swirlAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1.05, 1.25],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.12)',
              'rgba(255,200,240,0.26)',
              'rgba(205,215,255,0.22)',
              'rgba(255,255,255,0.04)',
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
              opacity: 0.28,
              backgroundColor: hueOverlay.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(255,190,235,0.75)', 'rgba(190,215,255,0.75)'],
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
                outputRange: [0, 0.75],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.5)',
              'rgba(255,200,240,0.3)',
              'rgba(210,225,255,0.12)',
              'rgba(255,255,255,0)',
            ]}
            locations={[0, 0.2, 0.55, 1]}
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
                  opacity: Animated.add(
                    flarePulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [flare.alpha * 0.6, flare.alpha * 1.4],
                    }),
                    flashAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.28],
                    })
                  ),
                  transform: [
                    {
                      scale: flarePulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1.4],
                      }),
                    },
                  ],
                  backgroundColor: hueOverlay.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['rgba(255, 190, 245, 0.55)', 'rgba(195, 220, 255, 0.55)'],
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
                    outputRange: [p.opacity * 0.45, p.opacity * 1.4],
                  }),
                  backgroundColor: particleColorShift.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['rgba(255,235,248,0.95)', 'rgba(200,225,255,0.95)'],
                  }),
                  transform: [
                    {
                      translateX: Animated.add(
                        Animated.add(
                          particleDrift.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-p.drift * p.dirX, p.drift * p.dirX],
                          }),
                          particleDriftAlt.interpolate({
                            inputRange: [0, 1],
                            outputRange: [p.altDrift * p.dirX, -p.altDrift * p.dirX],
                          })
                        ),
                        Animated.add(
                          fastJitter.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-p.fastX, p.fastX],
                          }),
                          fastJitterAlt.interpolate({
                            inputRange: [0, 1],
                            outputRange: [p.fastX * 0.6, -p.fastX * 0.6],
                          })
                        )
                      ),
                    },
                    {
                      translateY: Animated.add(
                        Animated.add(
                          particleDrift.interpolate({
                            inputRange: [0, 1],
                            outputRange: [p.drift * 0.6 * p.dirY, -p.drift * 0.6 * p.dirY],
                          }),
                          particleDriftAlt.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-p.altDrift * p.dirY, p.altDrift * p.dirY],
                          })
                        ),
                        Animated.add(
                          fastJitter.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-p.fastY, p.fastY],
                          }),
                          fastJitterAlt.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-p.fastY * 0.6, p.fastY * 0.6],
                          })
                        )
                      ),
                    },
                    {
                      scale: particlePulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.7, p.scaleHi],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Bottom haze to blend dock */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.0)',
          'rgba(255,210,236,0.18)',
          'rgba(245,235,255,0.28)',
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[
          styles.bottomHaze,
          {
            height: footerHeight + footerOffset + 40,
          },
        ]}
        pointerEvents="none"
      />

      {/* Footer dock inside card */}
      {!isBack && footer && (
        <View
          style={[
            styles.footerDock,
            {
              left: 24,
              right: 24,
              bottom: footerOffset,
            },
          ]}
        >
          {footer}
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
    position: 'relative',
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
  outerBevel: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: INNER_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  outerBevelInner: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: INNER_RADIUS - 1,
    borderWidth: 1,
    borderColor: 'rgba(210, 220, 255, 0.28)',
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
    opacity: 0.65,
  },
  bottomHaze: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  smokeOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  smokeGradient: {
    ...StyleSheet.absoluteFillObject,
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
  footerDock: {
    position: 'absolute',
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
