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
  flipData?: {
    payments: { id?: string; title: string; time_label: string; amount_cents: number }[];
    holdings: { label: string; amount_cents: number; kind?: string }[];
    other_assets?: { label: string; amount_cents: number }[];
    liabilities?: { label: string; amount_cents: number }[];
  };
}

const RECENT_PAYMENTS = [
  { merchant: 'Spotify', amount: '-$12', time: 'Today 9:24a' },
  { merchant: 'Blue Bottle', amount: '-$7', time: 'Today 8:11a' },
  { merchant: 'Apple', amount: '-$3', time: 'Yesterday' },
];

const HOLDINGS = [
  { label: 'Cash', value: '$12,480', pct: 0.34 },
  { label: 'Stocks', value: '$21,940', pct: 0.46 },
  { label: 'BTC', value: '$7,820', pct: 0.2 },
];

const HOLDING_TREND = [0.35, 0.6, 0.42, 0.78, 0.56, 0.7, 0.48];

const OTHER_ASSETS = [
  { label: '401(k)', value: '$64,200' },
  { label: 'IRA', value: '$22,450' },
  { label: 'Home Equity', value: '$128,000' },
];

const LIABILITIES = [
  { label: 'Mortgage', value: '-$312,000' },
  { label: 'Student Loan', value: '-$18,400' },
];

const GRADIENT_COLORS = [
  '#A8D8F0', // soft sky blue top
  '#B8E0F8', // light blue
  '#D0ECFC', // pale blue center
  '#E8F6FF', // very light blue
  '#FFFFFF', // white at bottom
] as const;

const FRAME_COLORS = [
  'rgba(255, 255, 255, 0.22)',
  'rgba(235, 240, 255, 0.55)',
  'rgba(255, 255, 255, 0.25)',
] as const;

const PARTICLE_COUNT = 45;
const STAR_COUNT = 10;
const PARTICLE_COLORS = [
  'rgba(255, 255, 255, 0.85)',
  'rgba(220, 240, 255, 0.8)',
  'rgba(200, 230, 255, 0.75)',
  'rgba(240, 250, 255, 0.8)',
] as const;

const FLARES = [
  { key: 'flare-1', top: '16%', left: '22%', size: 220, alpha: 0.28 },
  { key: 'flare-2', top: '30%', left: '70%', size: 280, alpha: 0.34 },
  { key: 'flare-3', top: '52%', left: '50%', size: 240, alpha: 0.3 },
  { key: 'flare-4', top: '68%', left: '28%', size: 220, alpha: 0.26 },
  { key: 'flare-5', top: '40%', left: '84%', size: 300, alpha: 0.36 },
  { key: 'flare-6', top: '74%', left: '66%', size: 320, alpha: 0.32 },
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacityBase: number;
  flickerSpeed: number;
  flickerPhase: number;
  flickerAmp: number;
  color: string;
  isOrb: boolean;
  highlightOpacity: number;
  wanderSpeed: number;
  wanderPhase: number;
  wanderAmp: number;
  biasX: number;
  biasY: number;
  xVal: Animated.Value;
  yVal: Animated.Value;
  opacityVal: Animated.Value;
};

type ShootingStar = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  length: number;
  thickness: number;
  opacityBase: number;
  life: number;
  duration: number;
  delay: number;
  xVal: Animated.Value;
  yVal: Animated.Value;
  opacityVal: Animated.Value;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function ParticleField({
  enabled,
  reduceMotionEnabled,
  showParticles,
  showStars,
}: {
  enabled: boolean;
  reduceMotionEnabled: boolean;
  showParticles: boolean;
  showStars: boolean;
}) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<ShootingStar[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  const spawnStar = (width: number, height: number, initialDelay = false): ShootingStar => {
    const fromTop = Math.random() > 0.4;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const angle = (Math.PI / 8) + Math.random() * (Math.PI / 5);
    const speed = 240 + Math.random() * 260;
    const length = 70 + Math.random() * 140;
    const thickness = 1 + Math.random() * 2.6;
    const x = fromTop ? Math.random() * width : direction === 1 ? -length : width + length;
    const y = fromTop ? -length : Math.random() * height * 0.75;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed * direction,
      vy: Math.sin(angle) * speed,
      angle: direction === 1 ? angle : Math.PI - angle,
      length,
      thickness,
      opacityBase: 0.45 + Math.random() * 0.5,
      life: 0,
      duration: 0.7 + Math.random() * 1.2,
      delay: initialDelay ? Math.random() * 2.2 : 0,
      xVal: new Animated.Value(x),
      yVal: new Animated.Value(y),
      opacityVal: new Animated.Value(0),
    };
  };

  const initParticles = (width: number, height: number) => {
    const particles: Particle[] = [];
    if (showParticles) {
      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        // Floating spheres - mix of sizes
        const isOrb = Math.random() > 0.3; // 70% are orbs
        const radius = isOrb ? 3 + Math.random() * 5 : 1.5 + Math.random() * 2.5; // Orbs: 3-8px, small: 1.5-4px
        const speed = 3 + Math.random() * 6;
        const angle = Math.random() * Math.PI * 2;
        const x = radius + Math.random() * (width - radius * 2);
        const y = radius + Math.random() * (height - radius * 2);
        const opacityBase = isOrb ? 0.5 + Math.random() * 0.35 : 0.4 + Math.random() * 0.3; // More visible
        const flickerSpeed = 0.3 + Math.random() * 0.8;
        const flickerPhase = Math.random() * Math.PI * 2;
        const flickerAmp = 0.08 + Math.random() * 0.12;
        const wanderSpeed = 0.2 + Math.random() * 0.4;
        const wanderPhase = Math.random() * Math.PI * 2;
        const wanderAmp = 10 + Math.random() * 18;
        const biasX = (Math.random() - 0.5) * 3;
        const biasY = -0.8 - Math.random() * 1.5; // Upward drift
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius,
          opacityBase,
          flickerSpeed,
          flickerPhase,
          flickerAmp,
          color: isOrb ? 'rgba(255, 255, 255, 0.9)' : PARTICLE_COLORS[i % PARTICLE_COLORS.length],
          isOrb,
          highlightOpacity: isOrb ? 0.6 + Math.random() * 0.3 : 0,
          wanderSpeed,
          wanderPhase,
          wanderAmp,
          biasX,
          biasY,
          xVal: new Animated.Value(x - radius),
          yVal: new Animated.Value(y - radius),
          opacityVal: new Animated.Value(opacityBase),
        });
      }
    }
    particlesRef.current = particles;
    starsRef.current = showStars
      ? Array.from({ length: STAR_COUNT }).map(() => spawnStar(width, height, true))
      : [];
    sizeRef.current = { width, height };
  };

  useEffect(() => {
    if (!layout.width || !layout.height) return;
    initParticles(layout.width, layout.height);
  }, [layout.width, layout.height, showParticles, showStars]);

  useEffect(() => {
    if (!enabled || reduceMotionEnabled) {
      lastTimeRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      particlesRef.current.forEach((p) => {
        p.opacityVal.setValue(p.opacityBase);
      });
      starsRef.current.forEach((star) => {
        star.opacityVal.setValue(0);
      });
      return;
    }
    if (!layout.width || !layout.height) return;

    const animate = (time: number) => {
      const last = lastTimeRef.current ?? time;
      const dt = Math.min(0.033, (time - last) / 1000);
      lastTimeRef.current = time;
      const width = layout.width;
      const height = layout.height;
      const particles = particlesRef.current;
      const runParticles = showParticles && particles.length > 0;
      const maxSpeed = 12; // Noticeable but smooth
      const jitter = 4;
      const flowScaleX = 0.12;
      const flowScaleY = 0.12;
      const cellSize = 24;
      let cols = 0;
      let rows = 0;
      let grid: number[][] = [];

      if (runParticles) {
        cols = Math.max(1, Math.floor(width / cellSize));
        rows = Math.max(1, Math.floor(height / cellSize));
        grid = new Array(cols * rows);
        for (let i = 0; i < grid.length; i += 1) {
          grid[i] = [];
        }
        for (let i = 0; i < particles.length; i += 1) {
          const p = particles[i];
          const flowX = Math.sin((p.y + time * 0.04) / 140) * 10;
          const flowY = Math.cos((p.x - time * 0.03) / 160) * 10;
          p.vx += flowX * flowScaleX * dt;
          p.vy += flowY * flowScaleY * dt;
          const wanderX = Math.sin(time / 1000 * p.wanderSpeed + p.wanderPhase) * p.wanderAmp;
          const wanderY = Math.cos(time / 1000 * (p.wanderSpeed * 0.85) + p.wanderPhase) * p.wanderAmp;
          p.vx += wanderX * dt;
          p.vy += wanderY * dt;
          p.vx += p.biasX * dt;
          p.vy += p.biasY * dt;
          p.vx += (Math.random() - 0.5) * jitter * dt;
          p.vy += (Math.random() - 0.5) * jitter * dt;
          const speed = Math.hypot(p.vx, p.vy);
          if (speed > maxSpeed) {
            p.vx = (p.vx / speed) * maxSpeed;
            p.vy = (p.vy / speed) * maxSpeed;
          }

          p.x += p.vx * dt;
          p.y += p.vy * dt;

          if (p.x - p.radius < 0) {
            p.x = p.radius;
            p.vx = Math.abs(p.vx) * 0.9;
          } else if (p.x + p.radius > width) {
            p.x = width - p.radius;
            p.vx = -Math.abs(p.vx) * 0.9;
          }
          if (p.y - p.radius < 0) {
            p.y = p.radius;
            p.vy = Math.abs(p.vy) * 0.9;
          } else if (p.y + p.radius > height) {
            p.y = height - p.radius;
            p.vy = -Math.abs(p.vy) * 0.9;
          }

          const cx = clamp(Math.floor(p.x / cellSize), 0, cols - 1);
          const cy = clamp(Math.floor(p.y / cellSize), 0, rows - 1);
          grid[cx + cy * cols].push(i);
        }

        for (let i = 0; i < particles.length; i += 1) {
          const a = particles[i];
          const cx = clamp(Math.floor(a.x / cellSize), 0, cols - 1);
          const cy = clamp(Math.floor(a.y / cellSize), 0, rows - 1);
          for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
            for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
              if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
              const cell = grid[gx + gy * cols] as number[];
              for (let k = 0; k < cell.length; k += 1) {
                const j = cell[k];
                if (j <= i) continue;
                const b = particles[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                const minDist = a.radius + b.radius + 1;
                if (dist > 0 && dist < minDist) {
                  const nx = dx / dist;
                  const ny = dy / dist;
                  const overlap = (minDist - dist) * 0.5;
                  a.x -= nx * overlap;
                  a.y -= ny * overlap;
                  b.x += nx * overlap;
                  b.y += ny * overlap;

                  const dvx = b.vx - a.vx;
                  const dvy = b.vy - a.vy;
                  const relVel = dvx * nx + dvy * ny;
                  if (relVel < 0) {
                    const impulse = -relVel * 0.6;
                    a.vx -= impulse * nx;
                    a.vy -= impulse * ny;
                    b.vx += impulse * nx;
                    b.vy += impulse * ny;
                  }
                }
              }
            }
          }
        }

        for (let i = 0; i < particles.length; i += 1) {
          const p = particles[i];
          p.xVal.setValue(p.x - p.radius);
          p.yVal.setValue(p.y - p.radius);
          const flicker = Math.sin(time / 1000 * p.flickerSpeed + p.flickerPhase) * p.flickerAmp;
          p.opacityVal.setValue(clamp(p.opacityBase + flicker, 0.3, 0.85));
        }
      }

      if (showStars) {
        const stars = starsRef.current;
        for (let i = 0; i < stars.length; i += 1) {
          const star = stars[i];
          if (star.delay > 0) {
            star.delay -= dt;
            star.opacityVal.setValue(0);
            continue;
          }
          star.life += dt / star.duration;
          star.x += star.vx * dt;
          star.y += star.vy * dt;
          const lifeFade = Math.sin(Math.PI * clamp(star.life, 0, 1));
          star.opacityVal.setValue(star.opacityBase * lifeFade);
          star.xVal.setValue(star.x);
          star.yVal.setValue(star.y);

          const offscreen =
            star.x > width + star.length ||
            star.y > height + star.length ||
            star.life >= 1;
          if (offscreen) {
            stars[i] = spawnStar(width, height, true);
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
    };
  }, [enabled, reduceMotionEnabled, layout.width, layout.height, showParticles, showStars]);

  return (
    <View
      style={styles.particleLayer}
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setLayout({ width, height });
      }}
    >
      {particlesRef.current.map((particle, index) => (
        <Animated.View
          key={`particle-${index}`}
          style={[
            styles.particle,
            particle.isOrb && styles.particleOrb,
            {
              width: particle.radius * 2,
              height: particle.radius * 2,
              backgroundColor: particle.color,
              opacity: particle.opacityVal,
              transform: [
                { translateX: particle.xVal },
                { translateY: particle.yVal },
              ],
            },
          ]}
        >
          {particle.isOrb && (
            <View
              pointerEvents="none"
              style={[
                styles.particleOrbHighlight,
                {
                  width: particle.radius * 1.2,
                  height: particle.radius * 1.2,
                  opacity: particle.highlightOpacity,
                },
              ]}
            />
          )}
        </Animated.View>
      ))}
      {starsRef.current.map((star, index) => (
        <Animated.View
          key={`star-${index}`}
          style={[
            styles.shootingStar,
            {
              width: star.length,
              height: star.thickness,
              opacity: star.opacityVal,
              transform: [
                { translateX: star.xVal },
                { translateY: star.yVal },
                { rotate: `${star.angle}rad` },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.0)',
              'rgba(255,255,255,0.9)',
              'rgba(255,210,245,0.7)',
              'rgba(205,220,255,0.25)',
              'rgba(255,255,255,0.0)',
            ]}
            locations={[0, 0.3, 0.6, 0.82, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.shootingStarGradient}
          />
          <View style={styles.shootingStarCore} />
        </Animated.View>
      ))}
    </View>
  );
}

// Minimal elegant butterflies - just 2, simple V-shapes
const BUTTERFLY_COUNT = 2;

type Butterfly = {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  phase: number;
  size: number;
  flapPhase: number;
  opacity: number;
  xVal: Animated.Value;
  yVal: Animated.Value;
  flapVal: Animated.Value;
  opacityVal: Animated.Value;
};

function Butterflies({
  enabled,
  reduceMotionEnabled,
}: {
  enabled: boolean;
  reduceMotionEnabled: boolean;
}) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const butterfliesRef = useRef<Butterfly[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const initButterflies = (width: number, height: number) => {
    const butterflies: Butterfly[] = [];
    // Place them in different areas of the card
    const positions = [
      { x: 0.28, y: 0.3 },
      { x: 0.68, y: 0.6 },
    ];
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const pos = positions[i];
      const centerX = pos.x * width;
      const centerY = pos.y * height;
      butterflies.push({
        x: centerX,
        y: centerY,
        centerX,
        centerY,
        phase: Math.random() * Math.PI * 2,
        size: 4 + Math.random() * 1.6,
        flapPhase: Math.random() * Math.PI * 2,
        opacity: 0.28 + Math.random() * 0.18,
        xVal: new Animated.Value(centerX),
        yVal: new Animated.Value(centerY),
        flapVal: new Animated.Value(0),
        opacityVal: new Animated.Value(0.28 + Math.random() * 0.18),
      });
    }
    butterfliesRef.current = butterflies;
  };

  useEffect(() => {
    if (!layout.width || !layout.height) return;
    initButterflies(layout.width, layout.height);
  }, [layout.width, layout.height]);

  useEffect(() => {
    if (!enabled || reduceMotionEnabled) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
      return;
    }
    if (!layout.width || !layout.height) return;

    const animate = (time: number) => {
      lastTimeRef.current = time;
      const butterflies = butterfliesRef.current;
      const t = time / 1000;

      for (let i = 0; i < butterflies.length; i++) {
        const b = butterflies[i];
        // Very gentle drift - figure-8 pattern
        const targetX = b.centerX + Math.sin(t * 0.22 + b.phase) * 18;
        const targetY =
          b.centerY +
          Math.sin(t * 0.36 + b.phase) * Math.cos(t * 0.22 + b.phase) * 12;

        // Smooth movement
        b.x += (targetX - b.x) * 0.018;
        b.y += (targetY - b.y) * 0.018;

        // Gentle flapping - slower, more natural
        const flap = Math.sin(t * 3 + b.flapPhase);

        b.xVal.setValue(b.x);
        b.yVal.setValue(b.y);
        b.flapVal.setValue(flap);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, reduceMotionEnabled, layout.width, layout.height]);

  if (!enabled || reduceMotionEnabled) return null;

  return (
    <View
      style={styles.butterflyLayer}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setLayout({ width, height });
        }
      }}
    >
      {butterfliesRef.current.map((b, index) => (
        <Animated.View
          key={`butterfly-${index}`}
          style={[
            styles.butterfly,
            {
              opacity: b.opacity,
              transform: [
                { translateX: b.xVal },
                { translateY: b.yVal },
              ],
            },
          ]}
        >
          {/* Simple V-shape: two angled lines */}
          <Animated.View
            style={[
              styles.butterflyWingSimple,
              {
                width: b.size,
                transform: [
                  { rotate: '-30deg' },
                  { translateX: -b.size * 0.3 },
                  {
                    scaleY: b.flapVal.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [0.8, 1.1],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.butterflyWingSimple,
              {
                width: b.size,
                transform: [
                  { rotate: '30deg' },
                  { translateX: b.size * 0.3 },
                  {
                    scaleY: b.flapVal.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [1.1, 0.8],
                    }),
                  },
                ],
              },
            ]}
          />
        </Animated.View>
      ))}
    </View>
  );
}

export function BloomCard({
  totalValue,
  dailyChange,
  onPress,
  style,
  footer,
  footerOffset = 16,
  footerHeight = 52,
  flipData,
}: BloomCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const textShimmerAnim = useRef(new Animated.Value(0)).current;
  const hueOverlay = useRef(new Animated.Value(0)).current;
  const flarePulse = useRef(new Animated.Value(0)).current;
  const swirlAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
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

  // Atmosphere animation loops (hue, flares, swirls, flashes, smoke)
  useEffect(() => {
    if (reduceMotionEnabled) {
      hueOverlay.setValue(0);
      flarePulse.setValue(0);
      swirlAnim.setValue(0);
      flashAnim.setValue(0);
      smokeAnimA.setValue(0);
      smokeAnimB.setValue(0);
      return;
    }
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
    hue.start();
    flare.start();
    swirl.start();
    flash.start();
    smokeA.start();
    smokeB.start();
    return () => {
      hue.stop();
      flare.stop();
      swirl.stop();
      flash.stop();
      smokeA.stop();
      smokeB.stop();
    };
  }, [
    reduceMotionEnabled,
    hueOverlay,
    flarePulse,
    swirlAnim,
    flashAnim,
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

  const formatCents = (value: number) => {
    const abs = Math.abs(value);
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(abs / 100);
    return value < 0 ? `-${formatted}` : formatted;
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

  const displayValue = totalValue > 0 ? formatValue(totalValue) : '$47,291';
  const displayChange = totalValue > 0 ? formatChange(dailyChange) : '+ $127 today';
  const payments = flipData?.payments?.length
    ? flipData.payments.map((p) => ({
        merchant: p.title,
        amount: formatCents(p.amount_cents),
        time: p.time_label,
      }))
    : RECENT_PAYMENTS;

  const holdingsRaw = flipData?.holdings?.length
    ? flipData.holdings.map((h) => ({
        label: h.label,
        value: formatCents(h.amount_cents),
        amount: h.amount_cents,
      }))
    : HOLDINGS.map((h) => ({
        label: h.label,
        value: h.value,
        amount: Math.round(h.pct * 10000),
      }));

  const holdingsTotal = holdingsRaw.reduce((sum, h) => sum + Math.max(h.amount, 0), 0) || 1;
  const holdings = holdingsRaw.map((h) => ({
    label: h.label,
    value: h.value,
    pct: Math.max(h.amount, 0) / holdingsTotal,
  }));

  const otherAssets = flipData?.other_assets?.length
    ? flipData.other_assets.map((a) => ({ label: a.label, value: formatCents(a.amount_cents) }))
    : OTHER_ASSETS;

  const liabilities = flipData?.liabilities?.length
    ? flipData.liabilities.map((l) => ({ label: l.label, value: formatCents(l.amount_cents) }))
    : LIABILITIES;

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

      {/* Bottom white fog */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.0)',
          'rgba(255,255,255,0.4)',
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

      {/* Smoke / nebula energy - blue/white */}
      {!reduceMotionEnabled && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.smokeOverlay,
              {
                opacity: smokeAnimA.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.08, 0.25],
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
                'rgba(200,230,255,0.2)',
                'rgba(180,220,255,0.15)',
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
                  outputRange: [0.06, 0.22],
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
                'rgba(190,225,255,0.2)',
                'rgba(170,215,255,0.18)',
                'rgba(255,255,255,0.06)',
              ]}
              start={{ x: 0.1, y: 0.2 }}
              end={{ x: 0.9, y: 0.8 }}
              style={styles.smokeGradient}
            />
          </Animated.View>
        </>
      )}

      {/* Swirling aurora layer - blue/white */}
      {!reduceMotionEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swirlOverlay,
            {
              opacity: swirlAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.15, 0.4],
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
              'rgba(190,225,255,0.18)',
              'rgba(175,215,255,0.15)',
              'rgba(255,255,255,0.04)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.swirlGradient}
          />
        </Animated.View>
      )}

      {/* Hue overlay shift - subtle blue */}
      {!reduceMotionEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.hueOverlay,
            {
              opacity: 0.15,
              backgroundColor: hueOverlay.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(180,220,255,0.5)', 'rgba(200,235,255,0.5)'],
              }),
            },
          ]}
        />
      )}

      {/* Cinematic light flash - white/blue */}
      {!reduceMotionEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flashOverlay,
            {
              opacity: flashAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.6],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.6)',
              'rgba(200,230,255,0.3)',
              'rgba(180,220,255,0.12)',
              'rgba(255,255,255,0)',
            ]}
            locations={[0, 0.2, 0.55, 1]}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 0.9, y: 0.9 }}
            style={styles.flashGradient}
          />
        </Animated.View>
      )}

      {/* Flares - subtle white/blue */}
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
                      outputRange: [flare.alpha * 0.4, flare.alpha * 1.0],
                    }),
                    flashAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.2],
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
                    outputRange: ['rgba(200, 230, 255, 0.4)', 'rgba(220, 240, 255, 0.4)'],
                  }),
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Shooting stars only - no particles */}
      <ParticleField
        enabled={!reduceMotionEnabled && ((!isBack && !flipped) || (isBack && flipped))}
        reduceMotionEnabled={reduceMotionEnabled}
        showParticles={!isBack}
        showStars
      />

      {/* Bottom haze - white */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.0)',
          'rgba(255,255,255,0.15)',
          'rgba(255,255,255,0.25)',
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

      {/* Footer dock inside card - visible on both faces */}
      {footer && (
        <Pressable
          onPress={(e) => e.stopPropagation()}
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
        </Pressable>
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
          <View style={styles.paymentsSection}>
            <Text style={styles.sectionTitle}>Payments</Text>
            <View style={styles.paymentList}>
              {payments.map((item) => (
                <View key={item.merchant} style={styles.paymentRow}>
                  <View style={styles.paymentMeta}>
                    <Text style={styles.paymentMerchant}>{item.merchant}</Text>
                    <Text style={styles.paymentTime}>{item.time}</Text>
                  </View>
                  <View style={styles.paymentAmountWrap}>
                    <Text style={styles.paymentArrow}>-&gt;</Text>
                    <Text style={styles.paymentAmount}>{item.amount}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.investmentsSection}>
            <Text style={styles.sectionTitle}>Investments</Text>
            <View style={styles.trendChart}>
              {HOLDING_TREND.map((value, index) => (
                <View key={`trend-${index}`} style={styles.chartBar}>
                  <View style={[styles.chartFill, { height: `${value * 100}%` }]} />
                </View>
              ))}
            </View>
            <View style={styles.holdingsList}>
              {holdings.map((item) => (
                <View key={item.label} style={styles.holdingRow}>
                  <View style={styles.holdingMeta}>
                    <Text style={styles.holdingLabel}>{item.label}</Text>
                    <Text style={styles.holdingValue}>{item.value}</Text>
                  </View>
                  <View style={styles.holdingBar}>
                    <View style={[styles.holdingFill, { width: `${item.pct * 100}%` }]} />
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.assetsSection}>
            <View style={styles.assetsHeader}>
              <Text style={styles.sectionTitle}>Other Assets</Text>
              <Text style={styles.sectionTitleMuted}>Liabilities</Text>
            </View>
            <View style={styles.assetsGrid}>
              <View style={styles.assetsColumn}>
                {otherAssets.map((item) => (
                  <View key={item.label} style={styles.assetRow}>
                    <Text style={styles.assetLabel}>{item.label}</Text>
                    <Text style={styles.assetValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.assetsColumn}>
                {liabilities.map((item) => (
                  <View key={item.label} style={styles.assetRow}>
                    <Text style={styles.assetLabel}>{item.label}</Text>
                    <Text style={styles.assetValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
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
    top: 0,
    left: 0,
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(255, 220, 245, 0.9)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 0,
  },
  particleOrb: {
    overflow: 'hidden',
  },
  particleOrbHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  shootingStar: {
    position: 'absolute',
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: 'rgba(255, 225, 250, 0.9)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
  },
  shootingStarGradient: {
    flex: 1,
  },
  shootingStarCore: {
    position: 'absolute',
    right: 0,
    top: -2,
    bottom: -2,
    width: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  butterflyLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  butterfly: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  butterflyWingSimple: {
    height: 1,
    backgroundColor: 'rgba(255, 235, 250, 0.55)',
    borderRadius: 1,
    shadowColor: 'rgba(255, 220, 245, 0.6)',
    shadowOpacity: 0.25,
    shadowRadius: 3,
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
    color: '#1a1a2e',
    letterSpacing: -0.4,
  },
  changeText: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans-Regular',
    color: 'rgba(26, 26, 46, 0.7)',
    letterSpacing: 0.1,
  },
  backContent: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 28,
    paddingVertical: 30,
    justifyContent: 'flex-start',
  },
  paymentsSection: {
    marginBottom: 16,
  },
  investmentsSection: {
    marginBottom: 16,
  },
  assetsSection: {
    marginBottom: 8,
  },
  assetsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleMuted: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: 'rgba(26, 26, 46, 0.5)',
  },
  assetsGrid: {
    flexDirection: 'row',
    marginTop: 10,
  },
  assetsColumn: {
    flex: 1,
    paddingRight: 10,
  },
  assetRow: {
    marginBottom: 8,
  },
  assetLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
    color: 'rgba(26, 26, 46, 0.6)',
  },
  assetValue: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: '#1a1a2e',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: '#1a1a2e',
    letterSpacing: 0.2,
  },
  paymentList: {
    marginTop: 10,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  paymentMeta: {
    flex: 1,
  },
  paymentMerchant: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: '#1a1a2e',
  },
  paymentTime: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
    color: 'rgba(26, 26, 46, 0.5)',
    marginTop: 2,
  },
  paymentAmountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentArrow: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
    color: 'rgba(26, 26, 46, 0.5)',
    marginRight: 6,
  },
  paymentAmount: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: '#1a1a2e',
  },
  trendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 12,
    height: 54,
  },
  chartBar: {
    width: 14,
    height: 54,
    borderRadius: 6,
    backgroundColor: 'rgba(26, 26, 46, 0.08)',
    overflow: 'hidden',
    marginRight: 6,
  },
  chartFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 6,
    backgroundColor: 'rgba(26, 26, 46, 0.5)',
  },
  holdingsList: {
    marginTop: 16,
  },
  holdingRow: {
    marginBottom: 12,
  },
  holdingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  holdingLabel: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
    color: 'rgba(26, 26, 46, 0.7)',
  },
  holdingValue: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: '#1a1a2e',
  },
  holdingBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(26, 26, 46, 0.1)',
    marginTop: 6,
    overflow: 'hidden',
  },
  holdingFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(26, 26, 46, 0.4)',
  },
  breakdownTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: '#1a1a2e',
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
    color: 'rgba(26, 26, 46, 0.7)',
  },
  breakdownValue: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: '#1a1a2e',
  },
  breakdownHint: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Regular',
    color: 'rgba(26, 26, 46, 0.5)',
    marginTop: 10,
    textAlign: 'center',
  },
});

export default BloomCard;
