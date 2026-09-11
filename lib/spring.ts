/**
 * A spring settle, seeded with the velocity the gesture ended at.
 *
 * The fold is a layout change rather than a transform, so it cannot be handed to a
 * library that animates compositor properties. This is the smallest thing that still
 * gives the two properties a release needs: it leaves the finger at the speed the finger
 * was moving, and it can be caught mid-flight and retargeted without a jump.
 */
export interface SpringHandle {
  /** Stop where it is. The next gesture starts from here. */
  stop: () => void;
}

interface SpringOptions {
  from: number;
  to: number;
  /** Units per second, signed, as the pointer was moving when it lifted. */
  velocity: number;
  stiffness?: number;
  damping?: number;
  onFrame: (value: number) => void;
  onDone?: () => void;
}

const STEP = 1 / 240;

export function springTo({
  from,
  to,
  velocity,
  stiffness = 260,
  damping = 34,
  onFrame,
  onDone,
}: SpringOptions): SpringHandle {
  let value = from;
  let speed = velocity;
  let raf = 0;
  let last = performance.now();
  let running = true;

  function tick(now: number) {
    if (!running) return;
    // Fixed sub-steps, so the settle is identical at 60Hz and 120Hz and a dropped frame
    // cannot make the spring explode.
    let elapsed = Math.min((now - last) / 1000, 0.064);
    last = now;
    while (elapsed > 0) {
      const dt = Math.min(STEP, elapsed);
      elapsed -= dt;
      const accel = -stiffness * (value - to) - damping * speed;
      speed += accel * dt;
      value += speed * dt;
    }

    if (Math.abs(value - to) < 0.1 && Math.abs(speed) < 0.5) {
      onFrame(to);
      running = false;
      onDone?.();
      return;
    }
    onFrame(value);
    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}

/**
 * Resistance past a boundary.
 *
 * A hard stop reads as a broken control. Moving a fraction of the distance says "there is
 * nothing further" with the hand rather than with a message.
 */
export function rubberBand(overshoot: number, limit = 18, resistance = 0.4): number {
  const sign = Math.sign(overshoot);
  const magnitude = Math.abs(overshoot);
  return sign * limit * (1 - 1 / (magnitude * resistance * (1 / limit) + 1));
}
