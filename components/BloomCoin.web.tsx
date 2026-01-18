// components/BloomCoin.web.tsx
// The Bloom Coin - Premium 3D Interactive Version for Web
// One object. All value. Always growing.

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BloomCoinProps {
  totalValue: number;
  dailyChange: number;
  onPress: () => void;
}

const COIN_SIZE = 320;
const AURA_SIZE = Math.round(COIN_SIZE * 1.24);

export function BloomCoin({ totalValue, dailyChange, onPress }: BloomCoinProps) {
  const coinRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const rafRef = useRef<number>(0);
  const inertiaRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const isInertiaRef = useRef(false);
  const dragDistanceRef = useRef(0);
  const suppressClickRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 });
  const spinVelocityRef = useRef({ x: 0, y: 0, z: 0 });
  const spinRotationRef = useRef({ x: 0, y: 0, z: 0 });
  const currentRotation = useRef({ x: 0, y: 0, z: 0 });
  const targetRotation = useRef({ x: 0, y: 0, z: 0 });

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

  // Check for reduced motion preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, []);

  // Smooth animation loop for tilt
  useEffect(() => {
    if (prefersReducedMotion) return;

    const animate = () => {
      const coin = coinRef.current;
      if (!coin) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Lerp towards target
      currentRotation.current.x += (targetRotation.current.x - currentRotation.current.x) * 0.1;
      currentRotation.current.y += (targetRotation.current.y - currentRotation.current.y) * 0.1;
      currentRotation.current.z += (targetRotation.current.z - currentRotation.current.z) * 0.1;

      // Apply transform
      coin.style.transform = `
        rotateX(${currentRotation.current.x}deg)
        rotateY(${currentRotation.current.y}deg)
        rotateZ(${currentRotation.current.z}deg)
      `;

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [prefersReducedMotion]);

  const startInertia = useCallback(() => {
    if (prefersReducedMotion) return;

    let velocityX = spinVelocityRef.current.x;
    let velocityY = spinVelocityRef.current.y;
    let velocityZ = spinVelocityRef.current.z;

    if (
      Math.abs(velocityX) < 0.01 &&
      Math.abs(velocityY) < 0.01 &&
      Math.abs(velocityZ) < 0.01
    ) return;

    isInertiaRef.current = true;

    const step = () => {
      velocityX *= 0.94;
      velocityY *= 0.94;
      velocityZ *= 0.94;

      spinRotationRef.current.x += velocityX;
      spinRotationRef.current.y += velocityY;
      spinRotationRef.current.z += velocityZ;
      targetRotation.current = {
        x: spinRotationRef.current.x,
        y: spinRotationRef.current.y,
        z: spinRotationRef.current.z,
      };

      if (
        Math.abs(velocityX) < 0.02 &&
        Math.abs(velocityY) < 0.02 &&
        Math.abs(velocityZ) < 0.02
      ) {
        isInertiaRef.current = false;
        return;
      }

      inertiaRef.current = requestAnimationFrame(step);
    };

    inertiaRef.current = requestAnimationFrame(step);
  }, [prefersReducedMotion]);

  // Handle pointer move for tilt effect
  const handlePointerMove = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (prefersReducedMotion || isDraggingRef.current || isInertiaRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate normalized position (-1 to 1)
    const normalizedX = (e.clientX - centerX) / (rect.width / 2);
    const normalizedY = (e.clientY - centerY) / (rect.height / 2);

    // Set target rotation (inverted for natural feel)
    const maxTilt = 12;
    targetRotation.current.x = spinRotationRef.current.x - normalizedY * maxTilt;
    targetRotation.current.y = spinRotationRef.current.y + normalizedX * maxTilt;
    targetRotation.current.z = spinRotationRef.current.z;
  }, [prefersReducedMotion]);

  // Handle pointer leave - return to neutral
  const handlePointerLeave = useCallback(() => {
    if (isDraggingRef.current) return;
    targetRotation.current.x = spinRotationRef.current.x;
    targetRotation.current.y = spinRotationRef.current.y;
    targetRotation.current.z = spinRotationRef.current.z;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    suppressClickRef.current = false;
    dragDistanceRef.current = 0;
    spinVelocityRef.current = { x: 0, y: 0, z: 0 };

    if (inertiaRef.current) {
      cancelAnimationFrame(inertiaRef.current);
    }

    if (e.currentTarget && e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    lastPointerRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
    };
  }, []);

  const handlePointerUp = useCallback((e?: React.PointerEvent) => {
    isDraggingRef.current = false;
    suppressClickRef.current = dragDistanceRef.current > 6;
    startInertia();
    if (e?.currentTarget && e.currentTarget.releasePointerCapture) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, [startInertia]);

  const handlePointerDrag = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const now = performance.now();
    const last = lastPointerRef.current;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const dt = Math.max(now - last.time, 16);

    dragDistanceRef.current += Math.abs(dx) + Math.abs(dy);

    spinRotationRef.current.z += dx * 0.75;
    spinRotationRef.current.x -= dy * 0.25;
    targetRotation.current = {
      x: spinRotationRef.current.x,
      y: spinRotationRef.current.y,
      z: spinRotationRef.current.z,
    };

    spinVelocityRef.current = {
      x: (-dy / dt) * 10,
      y: 0,
      z: (dx / dt) * 18,
    };

    lastPointerRef.current = { x: e.clientX, y: e.clientY, time: now };
  }, []);

  // Handle click - spin animation
  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    onPress();
  }, [onPress]);

  // Inject CSS for animations and page vignette
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const styleId = 'bloom-coin-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes subtleFloat {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-4px); }
      }

      @keyframes auraGold {
        0%, 100% { opacity: 0.65; transform: scale(1); }
        50% { opacity: 0.18; transform: scale(1.05); }
      }

      @keyframes auraSilver {
        0%, 100% { opacity: 0.18; transform: scale(1.05); }
        50% { opacity: 0.65; transform: scale(1); }
      }

      @keyframes holoShift {
        0% { transform: rotate(0deg); opacity: 0.55; }
        50% { transform: rotate(180deg); opacity: 0.8; }
        100% { transform: rotate(360deg); opacity: 0.55; }
      }

      @keyframes holoSweep {
        0% { transform: translateX(-25%) translateY(20%) rotate(15deg); opacity: 0; }
        45% { opacity: 0.7; }
        100% { transform: translateX(25%) translateY(-20%) rotate(15deg); opacity: 0; }
      }

      .coin-container:not(.reduced-motion) .coin-float {
        animation: subtleFloat 4s ease-in-out infinite;
      }

      .coin-container:not(.reduced-motion) .aura-gold {
        animation: auraGold 10s ease-in-out infinite;
      }

      .coin-container:not(.reduced-motion) .aura-silver {
        animation: auraSilver 10s ease-in-out infinite;
      }

      .coin-container:not(.reduced-motion) .holo-overlay {
        animation: holoShift 9s linear infinite;
      }

      .coin-container:not(.reduced-motion) .holo-sweep {
        animation: holoSweep 6s ease-in-out infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .coin-container .coin-float {
          animation: none !important;
        }
        .coin-container .aura-gold,
        .coin-container .aura-silver {
          animation: none !important;
        }
        .coin-container .holo-overlay,
        .coin-container .holo-sweep {
          animation: none !important;
        }
      }

      /* Page vignette effect */
      body::before {
        content: '';
        position: fixed;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(
          ellipse at center,
          transparent 50%,
          rgba(0, 0, 0, 0.03) 100%
        );
        z-index: 9999;
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <View style={styles.wrapper}>
      {/* Inject web-specific container */}
      <div
        ref={containerRef}
        className={`coin-container ${prefersReducedMotion ? 'reduced-motion' : ''}`}
        onPointerMove={(e) => {
          handlePointerMove(e as any);
          handlePointerDrag(e);
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        style={{
          perspective: '1000px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Aura glow */}
        <div
          className="aura-gold"
          style={{
            position: 'absolute',
            width: AURA_SIZE,
            height: AURA_SIZE,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%, rgba(255, 224, 160, 0.75) 0%, rgba(255, 224, 160, 0) 70%)',
            mixBlendMode: 'screen',
            filter: 'blur(6px)',
            zIndex: 1,
          }}
        />
        <div
          className="aura-silver"
          style={{
            position: 'absolute',
            width: AURA_SIZE,
            height: AURA_SIZE,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 60% 55%, rgba(220, 230, 255, 0.75) 0%, rgba(220, 230, 255, 0) 70%)',
            mixBlendMode: 'screen',
            filter: 'blur(7px)',
            zIndex: 1,
          }}
        />

        {/* Shadow */}
        <div
          style={{
            position: 'absolute',
            bottom: -24,
            width: COIN_SIZE * 0.7,
            height: 40,
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.2) 0%, transparent 70%)',
            borderRadius: '50%',
            filter: 'blur(8px)',
            transform: 'scaleY(0.3)',
            zIndex: 0,
          }}
        />

        {/* Float container */}
        <div className="coin-float" style={{ position: 'relative', zIndex: 2 }}>
          {/* The 3D Coin */}
          <div
            ref={coinRef}
            style={{
              width: COIN_SIZE,
              height: COIN_SIZE,
              borderRadius: '50%',
              position: 'relative',
              transformStyle: 'preserve-3d',
              transition: 'transform 0.1s ease-out',
            }}
          >
            {/* Outer metallic rim */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: `
                  linear-gradient(145deg,
                    #E8D5A3 0%,
                    #C9A227 15%,
                    #F5E6A3 30%,
                    #D4AF37 50%,
                    #B8942A 70%,
                    #D4AF37 85%,
                    #E8D5A3 100%
                  )
                `,
                boxShadow: `
                  inset 0 2px 4px rgba(255,255,255,0.5),
                  inset 0 -2px 4px rgba(0,0,0,0.15),
                  0 4px 12px rgba(0,0,0,0.15)
                `,
              }}
            />

            {/* Inner coin face */}
            <div
              style={{
                position: 'absolute',
                inset: 8,
                borderRadius: '50%',
                overflow: 'hidden',
                background: `
                  radial-gradient(ellipse at 30% 30%,
                    #F7EBB5 0%,
                    #E5D48E 30%,
                    #D4AF37 60%,
                    #C9A227 100%
                  )
                `,
                boxShadow: `
                  inset 0 0 20px rgba(0,0,0,0.1),
                  inset 0 2px 8px rgba(255,255,255,0.4)
                `,
              }}
            >
              {/* Iridescent overlay */}
              <div
                className="holo-overlay"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `
                    conic-gradient(
                      from 0deg at 50% 50%,
                      rgba(255, 200, 200, 0.15) 0deg,
                      rgba(200, 255, 200, 0.15) 60deg,
                      rgba(200, 200, 255, 0.15) 120deg,
                      rgba(255, 255, 200, 0.15) 180deg,
                      rgba(255, 200, 255, 0.15) 240deg,
                      rgba(200, 255, 255, 0.15) 300deg,
                      rgba(255, 200, 200, 0.15) 360deg
                    )
                  `,
                  mixBlendMode: 'screen',
                  opacity: 0.85,
                }}
              />

              {/* Animated holographic sweep */}
              <div
                className="holo-sweep"
                style={{
                  position: 'absolute',
                  inset: '-20%',
                  background: `
                    linear-gradient(120deg,
                      rgba(255, 255, 255, 0) 0%,
                      rgba(255, 220, 160, 0.35) 30%,
                      rgba(170, 235, 255, 0.5) 50%,
                      rgba(255, 210, 235, 0.45) 70%,
                      rgba(255, 255, 255, 0) 100%
                    )
                  `,
                  mixBlendMode: 'screen',
                  filter: 'blur(2px)',
                }}
              />

              {/* Specular highlight */}
              <div
                style={{
                  position: 'absolute',
                  top: '5%',
                  left: '10%',
                  width: '50%',
                  height: '30%',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 100%)',
                  borderRadius: '50%',
                  filter: 'blur(8px)',
                  transform: 'rotate(-20deg)',
                }}
              />

              {/* Inner ring detail */}
              <div
                style={{
                  position: 'absolute',
                  inset: 16,
                  borderRadius: '50%',
                  border: '2px solid rgba(197, 160, 40, 0.3)',
                  boxShadow: `
                    inset 0 1px 2px rgba(255,255,255,0.3),
                    inset 0 -1px 2px rgba(0,0,0,0.1)
                  `,
                }}
              />

              {/* Subtle texture overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                  opacity: 0.03,
                  mixBlendMode: 'overlay',
                }}
              />

              {/* Text container */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                }}
              >
                {/* Value */}
                <span
                  style={{
                    fontSize: 48,
                    fontWeight: 700,
                    color: '#3D3218',
                    letterSpacing: '-0.02em',
                    textShadow: `
                      0 1px 0 rgba(255,255,255,0.4),
                      0 -1px 0 rgba(0,0,0,0.1)
                    `,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {formatValue(totalValue)}
                </span>

                {/* Daily change */}
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: dailyChange >= 0 ? '#2D5016' : '#8B1E1E',
                    marginTop: 4,
                    textShadow: `
                      0 1px 0 rgba(255,255,255,0.3)
                    `,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {formatChange(dailyChange)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BloomCoin;
