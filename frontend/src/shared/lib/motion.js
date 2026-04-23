import { motion, useReducedMotion } from "motion/react";

const easeOut = [0.22, 1, 0.36, 1];

export { motion, useReducedMotion };

export function revealProps(reduceMotion, delay = 0, y = 18) {
  if (reduceMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.34, delay, ease: easeOut },
  };
}

export function scaleInProps(reduceMotion, delay = 0) {
  if (reduceMotion) {
    return {
      initial: { opacity: 1, scale: 1 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 1, scale: 1 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0, scale: 0.98, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: 10 },
    transition: { duration: 0.24, delay, ease: easeOut },
  };
}

export function listItemProps(reduceMotion, index = 0) {
  return revealProps(reduceMotion, reduceMotion ? 0 : Math.min(index * 0.04, 0.18), 12);
}
