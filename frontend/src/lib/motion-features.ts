// Loaded as its own chunk by MotionProvider. Re-exported from a module of our
// own because LazyMotion needs a dynamic import to split on, and importing
// domAnimation statically anywhere else would pull it back into the main bundle.
export { domAnimation as default } from 'motion/react'
