import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

const Canvas = 'canvas' as any;

export function SpaceBackground() {
  const spaceRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = spaceRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    const nebulae: Array<{
      x: number;
      y: number;
      baseX: number;
      baseY: number;
      radius: number;
      color: { r: number; g: number; b: number };
      speed: number;
      phase: number;
      driftX: number;
      driftY: number;
    }> = [];
    const nebulaCount = 5;
    let rafId = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const colors = [
      { r: 24, g: 74, b: 150 },
      { r: 110, g: 52, b: 170 },
      { r: 30, g: 126, b: 150 },
      { r: 140, g: 54, b: 120 },
      { r: 44, g: 90, b: 140 },
    ];

    const seedNebulae = () => {
      nebulae.length = 0;
      const w = window.innerWidth;
      const h = window.innerHeight;

      for (let i = 0; i < nebulaCount; i += 1) {
        nebulae.push({
          x: Math.random() * w,
          y: Math.random() * h * 0.7,
          baseX: Math.random() * w,
          baseY: Math.random() * h * 0.7,
          radius: 200 + Math.random() * 300,
          color: colors[i % colors.length],
          speed: 0.0003 + Math.random() * 0.0004,
          phase: Math.random() * Math.PI * 2,
          driftX: 0.0001 + Math.random() * 0.0002,
          driftY: 0.00005 + Math.random() * 0.0001,
        });
      }
    };

    const draw = () => {
      time += 1;
      const w = window.innerWidth;
      const h = window.innerHeight;

      const baseGradient = ctx.createLinearGradient(0, 0, 0, h);
      baseGradient.addColorStop(0, '#05060f');
      baseGradient.addColorStop(0.45, '#070b18');
      baseGradient.addColorStop(1, '#030307');
      ctx.fillStyle = baseGradient;
      ctx.fillRect(0, 0, w, h);

      const coreGlow = ctx.createRadialGradient(
        w * 0.52, h * 0.18, 0,
        w * 0.52, h * 0.18, h * 0.9
      );
      coreGlow.addColorStop(0, 'rgba(46, 68, 150, 0.35)');
      coreGlow.addColorStop(0.4, 'rgba(22, 30, 70, 0.12)');
      coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreGlow;
      ctx.fillRect(0, 0, w, h);

      nebulae.forEach((neb, i) => {
        neb.x = neb.baseX + Math.sin(time * neb.speed + neb.phase) * 80;
        neb.y = neb.baseY + Math.cos(time * neb.speed * 0.7 + neb.phase) * 50;

        neb.baseX += Math.sin(time * neb.driftX) * 0.3;
        neb.baseY += Math.cos(time * neb.driftY) * 0.2;

        if (neb.baseX < -neb.radius) neb.baseX = w + neb.radius;
        if (neb.baseX > w + neb.radius) neb.baseX = -neb.radius;
        if (neb.baseY < -neb.radius) neb.baseY = h * 0.5;
        if (neb.baseY > h) neb.baseY = 0;

        const pulseRadius = neb.radius + Math.sin(time * 0.001 + i) * 30;

        const gradient = ctx.createRadialGradient(
          neb.x, neb.y, 0,
          neb.x, neb.y, pulseRadius
        );

        const intensity = 0.28 + Math.sin(time * 0.0008 + neb.phase) * 0.12;

        gradient.addColorStop(0, `rgba(${neb.color.r}, ${neb.color.g}, ${neb.color.b}, ${intensity})`);
        gradient.addColorStop(0.4, `rgba(${neb.color.r}, ${neb.color.g}, ${neb.color.b}, ${intensity * 0.5})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      });

      const auroraGradient = ctx.createLinearGradient(0, 0, 0, h * 0.65);
      const auroraIntensity = 0.18 + Math.sin(time * 0.0004) * 0.06;
      const hueShift = Math.sin(time * 0.0002) * 25;

      auroraGradient.addColorStop(0, `hsla(${205 + hueShift}, 70%, 38%, ${auroraIntensity})`);
      auroraGradient.addColorStop(0.2, `hsla(${235 + hueShift}, 65%, 32%, ${auroraIntensity * 0.75})`);
      auroraGradient.addColorStop(0.45, `hsla(${265 + hueShift}, 60%, 28%, ${auroraIntensity * 0.55})`);
      auroraGradient.addColorStop(0.7, `hsla(${290 + hueShift}, 55%, 26%, ${auroraIntensity * 0.35})`);
      auroraGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = auroraGradient;
      ctx.fillRect(0, 0, w, h * 0.6);

      rafId = requestAnimationFrame(draw);
    };

    resize();
    seedNebulae();
    rafId = requestAnimationFrame(draw);

    const handleResize = () => {
      resize();
      seedNebulae();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const canvas = particlesRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dustCount = 60;
    const starCount = 4;
    const particles: Array<{
      x: number;
      y: number;
      baseX: number;
      baseY: number;
      radius: number;
      alpha: number;
      angle: number;
      speed: number;
      range: number;
    }> = [];
    const stars: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      angle: number;
      length: number;
      thickness: number;
      opacity: number;
      opacityBase: number;
      life: number;
      duration: number;
      delay: number;
    }> = [];
    let lastTime = performance.now();
    let rafId = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawnStar = (width: number, height: number, initialDelay = false) => {
      const fromTop = Math.random() > 0.3;
      const direction = Math.random() > 0.5 ? 1 : -1;
      const angle = (Math.PI / 12) + Math.random() * (Math.PI / 4);

      const isLongTraversal = Math.random() > 0.7;
      const speed = isLongTraversal ? 280 + Math.random() * 180 : 140 + Math.random() * 160;
      const length = isLongTraversal ? 100 + Math.random() * 150 : 40 + Math.random() * 60;

      let x: number;
      let y: number;
      if (fromTop) {
        x = Math.random() * width;
        y = -length;
      } else {
        x = direction > 0 ? -length : width + length;
        y = Math.random() * height * 0.6;
      }

      const baseDelay = initialDelay ? Math.random() * 6000 : Math.random() * 8000;
      const extraPause = Math.random() > 0.6 ? Math.random() * 5000 : 0;

      return {
        x,
        y,
        vx: Math.cos(angle) * speed * (fromTop ? direction : 1),
        vy: Math.sin(angle) * speed,
        angle: fromTop ? (direction > 0 ? angle : Math.PI - angle) : (direction > 0 ? angle : Math.PI - angle),
        length,
        thickness: 1.5 + Math.random() * 2,
        opacity: 0,
        opacityBase: 0.5 + Math.random() * 0.4,
        life: 0,
        duration: isLongTraversal ? 2000 + Math.random() * 1500 : 800 + Math.random() * 600,
        delay: baseDelay + extraPause,
      };
    };

    const seedParticles = () => {
      particles.length = 0;
      stars.length = 0;
      const width = window.innerWidth;
      const height = window.innerHeight;

      for (let i = 0; i < dustCount; i += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          baseX: Math.random() * width,
          baseY: Math.random() * height,
          radius: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.5 + 0.2,
          angle: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.008 + 0.003,
          range: Math.random() * 25 + 15,
        });
      }

      for (let i = 0; i < starCount; i += 1) {
        stars.push(spawnStar(width, height, true));
      }
    };

    const draw = (currentTime: number) => {
      const dt = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;

      const width = window.innerWidth;
      const height = window.innerHeight;
      ctx.clearRect(0, 0, width, height);

      particles.forEach((particle) => {
        particle.angle += particle.speed;
        particle.x = particle.baseX + Math.sin(particle.angle) * particle.range;
        particle.y = particle.baseY + Math.cos(particle.angle * 0.7) * particle.range;

        if (particle.x < -10) particle.x += width + 20;
        if (particle.x > width + 10) particle.x -= width + 20;
        if (particle.y < -10) particle.y += height + 20;
        if (particle.y > height + 10) particle.y -= height + 20;

        ctx.fillStyle = `rgba(255, 255, 255, ${particle.alpha})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i];

        if (star.delay > 0) {
          star.delay -= dt;
          continue;
        }

        star.life += dt / star.duration;
        star.x += star.vx * (dt / 1000);
        star.y += star.vy * (dt / 1000);

        const lifeFade = Math.sin(Math.PI * Math.min(Math.max(star.life, 0), 1));
        star.opacity = star.opacityBase * lifeFade;

        if (star.opacity > 0.01) {
          ctx.save();
          ctx.translate(star.x, star.y);
          ctx.rotate(star.angle);

          const gradient = ctx.createLinearGradient(0, 0, star.length, 0);
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
          gradient.addColorStop(0.3, `rgba(255, 210, 245, ${star.opacity * 0.3})`);
          gradient.addColorStop(0.6, `rgba(255, 230, 250, ${star.opacity * 0.6})`);
          gradient.addColorStop(0.85, `rgba(255, 255, 255, ${star.opacity * 0.9})`);
          gradient.addColorStop(1, `rgba(255, 255, 255, ${star.opacity})`);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.ellipse(star.length / 2, 0, star.length / 2, star.thickness / 2, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.shadowColor = 'rgba(255, 230, 250, 0.8)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
          ctx.beginPath();
          ctx.arc(star.length, 0, star.thickness, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }

        const offscreen = star.x > width + star.length || star.y > height + star.length || star.life >= 1;
        if (offscreen) {
          stars[i] = spawnStar(width, height, false);
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    resize();
    seedParticles();
    rafId = requestAnimationFrame(draw);

    const handleResize = () => {
      resize();
      seedParticles();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <>
      <Canvas ref={spaceRef} style={styles.space} />
      <Canvas ref={particlesRef} style={styles.particles} />
    </>
  );
}

const styles = StyleSheet.create({
  space: {
    position: 'fixed' as any,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
    pointerEvents: 'none',
  },
  particles: {
    position: 'fixed' as any,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
    pointerEvents: 'none',
  },
});

export default SpaceBackground;
