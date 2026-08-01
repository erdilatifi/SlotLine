import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

/** A short, slightly-overshooting ease. Long or bouncy easings read as
 *  decorative; this reads as responsive. */
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Reduced motion drops the movement, not the animation. Travel is what
 * causes vestibular discomfort; a fade doesn't. Suppressing both leaves
 * anyone with the OS setting enabled — often without knowing it — looking
 * at a page that never does anything.
 */
export function FadeIn({
  children,
  delay = 0,
  y = 16,
  className,
  onMount,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string | undefined;
  /** Play on mount rather than on scroll. Anything above the fold should
   *  use this: scroll-triggered reveals depend on an IntersectionObserver
   *  firing, and content that starts at opacity 0 is invisible until it
   *  does. That's an acceptable bet below the fold and a terrible one for
   *  the first thing a visitor sees. */
  onMount?: boolean;
}) {
  const reduced = useReducedMotion();
  const from = { opacity: 0, y: reduced ? 0 : y };
  const to = { opacity: 1, y: 0 };
  const transition = { duration: 0.55, delay, ease: EASE };

  if (onMount) {
    return (
      <motion.div className={className} initial={from} animate={to} transition={transition}>
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={from}
      whileInView={to}
      viewport={{ once: true, margin: "-60px" }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const child: Variants = {
    hidden: { opacity: 0, y: reduced ? 0 : 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
  };
  return (
    <motion.div className={className} variants={child}>
      {children}
    </motion.div>
  );
}

export { motion, EASE };
