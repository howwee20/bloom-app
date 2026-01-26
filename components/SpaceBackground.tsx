import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const PARTICLE_COUNT = 70;
const STAR_COUNT = 6;
const PARTICLE_COLORS = [
  'rgba(255, 255, 255, 0.85)',
  'rgba(220, 240, 255, 0.8)',
  'rgba(200, 230, 255, 0.75)',
  'rgba(240, 250, 255, 0.8)',
] as const;

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
}: {
  enabled: boolean;
  reduceMotionEnabled: boolean;
}) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<ShootingStar[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const spawnStar = (width: number, height: number, initialDelay = false): ShootingStar => {
    const fromTop = Math.random() > 0.4;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const angle = (Math.PI / 8) + Math.random() * (Math.PI / 5);
    const speed = 220 + Math.random() * 220;
    const length = 60 + Math.random() * 120;
    const thickness = 1 + Math.random() * 2.4;
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
      opacityBase: 0.45 + Math.random() * 0.45,
      life: 0,
      duration: 0.7 + Math.random() * 1.1,
      delay: initialDelay ? Math.random() * 2.4 : 0,
      xVal: new Animated.Value(x),
      yVal: new Animated.Value(y),
      opacityVal: new Animated.Value(0),
    };
  };

  const initParticles = (width: number, height: number) => {
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const isOrb = Math.random() > 0.3;
      const radius = isOrb ? 3 + Math.random() * 5 : 1.4 + Math.random() * 2.3;
      const speed = 3 + Math.random() * 5;
      const angle = Math.random() * Math.PI * 2;
      const x = radius + Math.random() * (width - radius * 2);
      const y = radius + Math.random() * (height - radius * 2);
      const opacityBase = isOrb ? 0.5 + Math.random() * 0.35 : 0.35 + Math.random() * 0.25;
      const flickerSpeed = 0.3 + Math.random() * 0.8;
      const flickerPhase = Math.random() * Math.PI * 2;
      const flickerAmp = 0.08 + Math.random() * 0.12;
      const wanderSpeed = 0.2 + Math.random() * 0.4;
      const wanderPhase = Math.random() * Math.PI * 2;
      const wanderAmp = 10 + Math.random() * 18;
      const biasX = (Math.random() - 0.5) * 3;
      const biasY = -0.8 - Math.random() * 1.3;
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
    particlesRef.current = particles;
    starsRef.current = Array.from({ length: STAR_COUNT }).map(() => spawnStar(width, height, true));
  };

  useEffect(() => {
    if (!layout.width || !layout.height) return;
    initParticles(layout.width, layout.height);
  }, [layout.width, layout.height]);

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
      const maxSpeed = 12;
      const jitter = 4;
      const flowScaleX = 0.12;
      const flowScaleY = 0.12;
      const cellSize = 24;
      const cols = Math.max(1, Math.floor(width / cellSize));
      const rows = Math.max(1, Math.floor(height / cellSize));
      const grid: number[][] = new Array(cols * rows);

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

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
    };
  }, [enabled, reduceMotionEnabled, layout.width, layout.height]);

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
              transform: [{ translateX: particle.xVal }, { translateY: particle.yVal }],
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

export function SpaceBackground() {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

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

  return (
    <View style={styles.container} pointerEvents="none">
      <LinearGradient
        colors={['#05060f', '#070b18', '#030307']}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[
          'rgba(46, 68, 150, 0.32)',
          'rgba(22, 30, 70, 0.12)',
          'rgba(0, 0, 0, 0)',
        ]}
        locations={[0, 0.4, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.aurora}
      />
      <ParticleField enabled={!reduceMotionEnabled} reduceMotionEnabled={reduceMotionEnabled} />
      <View style={styles.vignette} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  aurora: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.8,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  particleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
    borderRadius: 999,
    top: 0,
    left: 0,
    shadowColor: 'rgba(255, 220, 245, 0.7)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  particleOrb: {
    overflow: 'hidden',
  },
  particleOrbHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
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
});
