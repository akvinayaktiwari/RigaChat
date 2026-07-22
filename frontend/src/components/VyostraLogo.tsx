import { useEffect, useRef } from "react";

const X = [10.5, 21.25, 32, 42.75, 53.5] as const;
const VY1 = [9.5, 17.5, 27.5, 17.5, 9.5] as const;
const VY2 = [22.5, 36.5, 52.5, 36.5, 22.5] as const;

export interface VyostraLogoProps {
  size?: number;
  animate?: boolean;
  className?: string;
}

export function VyostraLogo({
  size = 36,
  animate = true,
  className,
}: VyostraLogoProps): JSX.Element {
  const lineRefs = useRef<(SVGLineElement | null)[]>([null, null, null, null, null]);

  useEffect(() => {
    if (!animate) return;
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (rm) return;
    const bars = lineRefs.current;
    let raf = 0;
    let intervalId = 0;
    let timeoutId = 0;
    let stopped = false;

    const set = (i: number, y1: number, y2: number): void => {
      const ln = bars[i];
      if (!ln) return;
      ln.setAttribute("y1", String(y1));
      ln.setAttribute("y2", String(y2));
    };
    const reset = (): void => {
      for (let i = 0; i < 5; i++) set(i, VY1[i], VY2[i]);
    };

    const rippleOnce = (): void => {
      const t0 = performance.now();
      const dur = 900;
      const frame = (now: number): void => {
        if (stopped) return;
        const p = (now - t0) / dur;
        if (p >= 1) {
          reset();
          return;
        }
        for (let i = 0; i < 5; i++) {
          const local = Math.min(1, Math.max(0, p * 1.7 - i * 0.14));
          const bump = Math.sin(local * Math.PI) * 3.2;
          set(i, VY1[i] - bump, VY2[i] + bump);
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    timeoutId = window.setTimeout(rippleOnce, 900);
    intervalId = window.setInterval(rippleOnce, 4200);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [animate]);

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Vyostra AI"
      className={className}
      style={
        animate
          ? { animation: "vyostra-logo-glow 3.2s ease-in-out infinite" }
          : undefined
      }
    >
      <defs>
        <linearGradient id="vyostraLogoGrad" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {X.map((x, i) => (
        <line
          key={x}
          ref={(el: SVGLineElement | null) => { lineRefs.current[i] = el; }}
          x1={x}
          x2={x}
          y1={VY1[i]}
          y2={VY2[i]}
          stroke="url(#vyostraLogoGrad)"
          strokeWidth={7}
          strokeLinecap="round"
        />
      ))}
      <style>{`
        @keyframes vyostra-logo-glow {
          0%, 100% { filter: drop-shadow(0 0 5px rgba(124,58,237,.28)); }
          50%      { filter: drop-shadow(0 0 18px rgba(168,85,247,.55)); }
        }
        @media (prefers-reduced-motion: reduce) {
          svg[aria-label="Vyostra AI"] {
            animation: none !important;
            filter: drop-shadow(0 0 8px rgba(124,58,237,.35));
          }
        }
      `}</style>
    </svg>
  );
}

export default VyostraLogo;
