import React, { useRef, useEffect } from 'react';

/**
 * Antigravity — Canvas particle animation
 * Matches: count=300, color=#00c896, capsule particles, wave motion, magnetic cursor
 */
export default function Antigravity({
  count = 300,
  color = '#00c896',
  particleSize = 2,
  waveSpeed = 0.4,
  waveAmplitude = 1,
  magnetRadius = 120,
  lerpSpeed = 0.1,
}) {
  const canvasRef = useRef(null);
  const mouse = useRef({ x: -9999, y: -9999 });
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles;

    const resize = () => {
      W = canvas.width = canvas.parentElement.clientWidth;
      H = canvas.height = canvas.parentElement.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Parse color to rgba
    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return { r, g, b };
    };
    const rgb = hexToRgb(color);

    // Init particles
    particles = [];
    for (let i = 0; i < count; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      particles.push({
        x, y,
        baseX: x, baseY: y,
        targetX: x, targetY: y,
        vx: 0, vy: 0,
        size: particleSize * (0.5 + Math.random()),
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.7,
        alpha: 0.15 + Math.random() * 0.55,
        depth: 0.3 + Math.random() * 0.7,
      });
    }

    let t = 0;

    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      t += 0.016;

      const mx = mouse.current.x;
      const my = mouse.current.y;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Wave motion
        const wave = Math.sin(t * waveSpeed * p.speed + p.phase) * waveAmplitude * 20 * p.depth;
        const waveY = Math.cos(t * waveSpeed * 0.7 * p.speed + p.phase * 1.3) * waveAmplitude * 15 * p.depth;

        p.targetX = p.baseX + wave;
        p.targetY = p.baseY + waveY;

        // Magnetic repulsion from cursor
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < magnetRadius && dist > 0) {
          const force = (magnetRadius - dist) / magnetRadius;
          const angle = Math.atan2(dy, dx);
          p.targetX += Math.cos(angle) * force * 60;
          p.targetY += Math.sin(angle) * force * 60;
        }

        // Lerp to target
        p.x += (p.targetX - p.x) * lerpSpeed;
        p.y += (p.targetY - p.y) * lerpSpeed;

        // Draw capsule (rounded rect)
        const w = p.size * 2.5;
        const h = p.size;
        const r = h / 2;
        ctx.beginPath();
        ctx.moveTo(p.x - w / 2 + r, p.y - h / 2);
        ctx.lineTo(p.x + w / 2 - r, p.y - h / 2);
        ctx.arc(p.x + w / 2 - r, p.y, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(p.x - w / 2 + r, p.y + h / 2);
        ctx.arc(p.x - w / 2 + r, p.y, r, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${p.alpha * p.depth})`;
        ctx.fill();
      }

      // Draw subtle connections between close particles
      ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = dx * dx + dy * dy;
          if (d < 4000) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = e.clientX - rect.left;
      mouse.current.y = e.clientY - rect.top;
    };
    const handleLeave = () => { mouse.current.x = -9999; mouse.current.y = -9999; };
    const handleTouch = (e) => {
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        mouse.current.x = e.touches[0].clientX - rect.left;
        mouse.current.y = e.touches[0].clientY - rect.top;
      }
    };

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);
    canvas.addEventListener('touchmove', handleTouch);
    canvas.addEventListener('touchend', handleLeave);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
      canvas.removeEventListener('touchmove', handleTouch);
      canvas.removeEventListener('touchend', handleLeave);
    };
  }, [count, color, particleSize, waveSpeed, waveAmplitude, magnetRadius, lerpSpeed]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
    />
  );
}
