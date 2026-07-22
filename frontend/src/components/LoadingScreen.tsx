import { useEffect, useRef } from "react";

/**
 * LoadingScreen — full-screen post-login preloader.
 * Signal mark, glow-breathe + signal ripple every ~2.6s while loading.
 *
 * Usage (typical auth-gate / dashboard-load spot):
 *
 *   if (!authReady || !meLoaded) {
 *     return <LoadingScreen status="Loading your workspace…" />;
 *   }
 *
 * Drop this in wherever the current spinner/skeleton renders during:
 *   - useAuth() session restore on app load (idToken decode + expiry check)
 *   - the window between AuthCallbackPage redirect and the dashboard route
 *     actually mounting (GET /api/clients/me resolving)
 */

const X = [10.5, 21.25, 32, 42.75, 53.5] as const;
const VY1 = [9.5, 17.5, 27.5, 17.5, 9.5] as const;
const VY2 = [22.5, 36.5, 52.5, 36.5, 22.5] as const;

export interface LoadingScreenProps {
  /** Optional status line under the wordmark, e.g. "Syncing your bots…" */
  status?: string;
  /** Render without the fixed full-screen overlay (for embedding inside a panel/card) */
  inline?: boolean;
}

export function LoadingScreen({
  status = "Loading your workspace…",
  inline = false,
}: LoadingScreenProps): JSX.Element {
  const lineRefs = useRef<(SVGLineElement | null)[]>([null, null, null, null, null]);

  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

    reset();
    if (!rm) {
      timeoutId = window.setTimeout(rippleOnce, 500);
      intervalId = window.setInterval(rippleOnce, 2600);
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  const content = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <svg
        viewBox="0 0 64 64"
        width={104}
        height={104}
        role="img"
        aria-label="Vyostra AI is loading"
        style={{
          animation: "vyostra-preloader-glow 3.2s ease-in-out infinite",
        }}
      >
        <defs>
          <linearGradient id="vyostraPreloaderGrad" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
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
            stroke="url(#vyostraPreloaderGrad)"
            strokeWidth={7}
            strokeLinecap="round"
          />
        ))}
      </svg>

      <div
        style={{
          fontFamily: "'Plus Jakarta Sans', Inter, sans-serif",
          fontWeight: 800,
          fontSize: 19,
          letterSpacing: "-0.015em",
          color: "#0f172a",
        }}
      >
        Vyostra{" "}
        <span
          style={{
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          AI
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: "#8b93a3", letterSpacing: "0.01em" }}>
        {status}
      </div>

      <style>{`
        @keyframes vyostra-preloader-glow {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(124,58,237,.28)); }
          50%      { filter: drop-shadow(0 0 20px rgba(168,85,247,.55)); }
        }
        @media (prefers-reduced-motion: reduce) {
          svg[aria-label="Vyostra AI is loading"] {
            animation: none !important;
            filter: drop-shadow(0 0 9px rgba(124,58,237,.35));
          }
        }
      `}</style>
    </div>
  );

  if (inline) return content;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(560px 320px at 50% 38%, rgba(168,85,247,.07), transparent 65%), #ffffff",
      }}
    >
      {content}
    </div>
  );
}

export default LoadingScreen;
