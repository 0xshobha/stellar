'use client';

import { useEffect, useMemo, useRef } from 'react';

type Point3 = { x: number; y: number; z: number };

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

function randomPointOnSphere(): Point3 {
  // Uniform distribution on a sphere surface.
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.sin(phi) * Math.sin(theta),
    z: Math.cos(phi)
  };
}

export default function AgenticSphereBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const parallaxRef = useRef<HTMLDivElement | null>(null);

  const mouse = useRef({
    targetX: 0,
    targetY: 0,
    x: 0,
    y: 0
  });

  const points = useMemo(() => {
    const count = 680;
    const list: Point3[] = [];
    for (let i = 0; i < count; i++) list.push(randomPointOnSphere());
    return list;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = prefersReducedMotion();

    let rafId = 0;
    let mounted = true;

    const state = {
      w: 1,
      h: 1,
      dpr: 1,
      t: 0
    };

    const onPointerMove = (event: PointerEvent) => {
      const x = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const y = (event.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      mouse.current.targetX = Math.max(-1, Math.min(1, x));
      mouse.current.targetY = Math.max(-1, Math.min(1, y));
    };

    if (!reduced) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    const resize = () => {
      const parent = canvas.parentElement;
      const rect = parent?.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect?.width ?? window.innerWidth));
      const h = Math.max(1, Math.floor(rect?.height ?? window.innerHeight));
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio ?? 1));

      state.w = w;
      state.h = h;
      state.dpr = dpr;

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(() => resize());
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    resize();

    const draw = () => {
      if (!mounted) return;

      const { w, h } = state;
      state.t += 1;

      // Smooth cursor movement, then drive parallax transforms.
      const ease = 0.06;
      mouse.current.x += (mouse.current.targetX - mouse.current.x) * ease;
      mouse.current.y += (mouse.current.targetY - mouse.current.y) * ease;
      const bulkX = mouse.current.x * Math.min(w, h) * 0.028;
      const bulkY = mouse.current.y * Math.min(w, h) * 0.028;

      if (parallaxRef.current) {
        parallaxRef.current.style.transform = `translate3d(${bulkX}px, ${bulkY}px, 0)`;
      }

      ctx.clearRect(0, 0, w, h);

      // Background glow
      const cx = w * 0.5 + bulkX * 0.55;
      const cy = h * 0.48 + bulkY * 0.55;
      const sphereRadius = Math.min(w, h) * 0.29;

      const glow = ctx.createRadialGradient(cx, cy, sphereRadius * 0.1, cx, cy, sphereRadius * 1.6);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.30)');
      glow.addColorStop(0.5, 'rgba(99, 102, 241, 0.18)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Sphere points
      const spinY = state.t * 0.0032 + mouse.current.x * 0.22;
      const spinX = state.t * 0.0024 + mouse.current.y * 0.18;

      const sinY = Math.sin(spinY);
      const cosY = Math.cos(spinY);
      const sinX = Math.sin(spinX);
      const cosX = Math.cos(spinX);

      const projected = points.map((p) => {
        // Rotate around Y
        const x = p.x * cosY + p.z * sinY;
        let z = -p.x * sinY + p.z * cosY;
        let y = p.y;

        // Rotate around X
        const y2 = y * cosX - z * sinX;
        const z2 = y * sinX + z * cosX;
        y = y2;
        z = z2;

        // Perspective
        const depth = (z + 2.4) / 3.4; // keep positive
        const px = cx + x * sphereRadius * (0.62 + depth * 0.55);
        const py = cy + y * sphereRadius * (0.62 + depth * 0.55);

        return {
          x: px,
          y: py,
          z,
          depth
        };
      });

      projected.sort((a, b) => a.depth - b.depth);

      // Connection lines (nearest within threshold)
      const maxDist = sphereRadius * 0.42;
      ctx.lineWidth = 1.25;
      for (let i = 0; i < projected.length; i++) {
        const a = projected[i];
        for (let j = i + 1; j < projected.length; j++) {
          const b = projected[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > maxDist) continue;

          const alpha = (1 - dist / maxDist) * 0.16 * (0.45 + a.depth * 0.55);
          ctx.strokeStyle = `rgba(30, 64, 175, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Points on top
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of projected) {
        const r = 1.2 + p.depth * 1.7;
        const alpha = 0.18 + p.depth * 0.45;
        ctx.fillStyle = `rgba(14, 165, 233, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (!reduced) rafId = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      mounted = false;
      ro.disconnect();
      if (!reduced) {
        window.removeEventListener('pointermove', onPointerMove);
      }
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [points]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/10 to-white/75" aria-hidden="true" />

      <div ref={parallaxRef} className="absolute inset-0" aria-hidden="true">
        <div className="absolute left-[12%] top-[18%] h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-[10%] top-[26%] h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-[8%] left-[32%] h-64 w-64 rounded-full bg-blue-600/10 blur-3xl" />

        <div className="absolute left-[8%] top-[10%] opacity-90">
          <svg
            width="210"
            height="210"
            viewBox="0 0 210 210"
            className="rotate-[-10deg] text-sky-200 drop-shadow"
          >
            <defs>
              <radialGradient id="agentBody" cx="50%" cy="35%" r="70%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="55%" stopColor="rgba(186,230,253,0.85)" />
                <stop offset="100%" stopColor="rgba(99,102,241,0.55)" />
              </radialGradient>
              <linearGradient id="agentArm" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(56,189,248,0.9)" />
                <stop offset="100%" stopColor="rgba(99,102,241,0.85)" />
              </linearGradient>
            </defs>

            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M38 162 C62 142, 88 132, 105 124" stroke="rgba(30,64,175,0.25)" strokeWidth="3" />
              <path d="M173 150 C148 140, 130 128, 114 118" stroke="rgba(30,64,175,0.20)" strokeWidth="3" />

              <path d="M70 62 C60 44, 44 34, 28 34" stroke="url(#agentArm)" strokeWidth="7" />
              <circle cx="28" cy="34" r="10" fill="rgba(56,189,248,0.95)" />
              <path d="M142 58 C156 42, 175 36, 189 40" stroke="url(#agentArm)" strokeWidth="7" />
              <circle cx="189" cy="40" r="10" fill="rgba(99,102,241,0.9)" />

              <circle cx="105" cy="108" r="52" fill="url(#agentBody)" stroke="rgba(30,64,175,0.25)" strokeWidth="3" />

              <circle cx="90" cy="102" r="5.5" fill="rgba(15,23,42,0.65)" />
              <circle cx="121" cy="102" r="5.5" fill="rgba(15,23,42,0.65)" />
              <path d="M94 123 C102 131, 112 131, 120 123" stroke="rgba(15,23,42,0.55)" strokeWidth="4" />

              <path d="M78 146 C68 162, 56 176, 44 184" stroke="url(#agentArm)" strokeWidth="7" />
              <circle cx="44" cy="184" r="10" fill="rgba(56,189,248,0.9)" />
              <path d="M132 146 C148 166, 162 178, 174 186" stroke="url(#agentArm)" strokeWidth="7" />
              <circle cx="174" cy="186" r="10" fill="rgba(99,102,241,0.9)" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
