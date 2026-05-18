export const colors = {
  healthy: '#34d399',
  anomaly: '#f5b942',
  incident: '#ef4444',
  info: '#60a5fa',
  action: '#ffffff',
  bg: '#000000',
  divider: 'rgba(255, 255, 255, 0.08)',
  subtle: 'rgba(255, 255, 255, 0.06)',
  textPrimary: 'rgba(255, 255, 255, 0.95)',
  textSecondary: 'rgba(255, 255, 255, 0.50)',
  textTertiary: 'rgba(255, 255, 255, 0.35)',
} as const;

export const fonts = {
  system: '-apple-system, "SF Pro Text", system-ui, sans-serif',
  mono: '"SF Mono", ui-monospace, monospace',
} as const;

export const fontSize = {
  labelSecondary: 13,
  body: 14,
  bodyLarge: 14.5,
  title: 16,
} as const;

export const spacing = {
  panelPaddingX: 20,
  panelPaddingY: 14,
  lineGap: 6,
  sectionGap: 12,
} as const;

// The physical notch on MacBook Pro 14" is ~204px wide, ~32px tall (logical).
// Resting state extends the notch seamlessly — same height, wider.
// Expanded states grow downward from the notch.
export const stateDimensions = {
  resting: { width: 300, height: 32 },
  hover: { width: 580, height: 200 },
  anomaly: { width: 580, height: 200 },
  incident: { width: 580, height: 220 },
  deploy_verified: { width: 580, height: 140 },
  onboarding: { width: 580, height: 200 },
  settings: { width: 580, height: 240 },
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const springTransition = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 32,
  mass: 0.8,
};
