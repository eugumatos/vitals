import { AnimatePresence, motion } from 'framer-motion';
import { useVitalsStore } from '../store/useVitalsStore';
import { useGeometryStore } from '../store/useGeometryStore';
import { stateDimensions } from '../lib/design-tokens';
import { ZoneCIndicator } from './ZoneCIndicator';
import { NotchHeader } from './NotchHeader';
import { Hover } from './states/Hover';
import { Anomaly } from './states/Anomaly';
import { Incident } from './states/Incident';
import { DeployVerified } from './states/DeployVerified';
import { Onboarding } from './states/Onboarding';
import { Settings } from './states/Settings';

interface NotchProps {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const stateComponents: Record<string, React.FC | undefined> = {
  resting: undefined,
  hover: Hover,
  anomaly: Anomaly,
  incident: Incident,
  deploy_verified: DeployVerified,
  onboarding: Onboarding,
  settings: Settings,
};

const contentFade = {
  initial: { opacity: 0, y: 6, filter: 'blur(2px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -4, filter: 'blur(2px)' },
  transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] },
};

const HEADER_HEIGHT = 28;
const TRANSITION = 'width 380ms cubic-bezier(0.32, 0.72, 0.3, 1), height 380ms cubic-bezier(0.32, 0.72, 0.3, 1), border-radius 200ms ease';

export function Notch({ onMouseEnter, onMouseLeave }: NotchProps) {
  const state = useVitalsStore((s) => s.state);
  const setHover = useVitalsStore((s) => s.setHover);
  const setResting = useVitalsStore((s) => s.setResting);
  const { notchWidth, menuBarHeight } = useGeometryStore();

  const isResting = state === 'resting';
  const showHeader = !isResting;
  const dims = stateDimensions[state];

  const restingWidth = notchWidth + 200;
  const shellWidth = isResting ? restingWidth : dims.width;
  const shellHeight = isResting
    ? menuBarHeight
    : menuBarHeight + HEADER_HEIGHT + dims.height;

  const borderRadius = isResting ? '0 0 14px 14px' : '0 0 20px 20px';

  const StateComponent = stateComponents[state];

  const handleMouseEnter = () => {
    onMouseEnter();
    setHover();
  };

  const handleMouseLeave = () => {
    onMouseLeave();
    setResting();
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#000',
        borderRadius,
        overflow: 'hidden',
        width: shellWidth,
        height: shellHeight,
        transition: TRANSITION,
        cursor: 'default',
      }}
    >
      {/* Zone C indicator — always visible at top-right, in the menubar row */}
      <ZoneCIndicator />

      {/* Zone B spacer — push header + content below the notch */}
      {showHeader && (
        <div style={{ height: menuBarHeight, flexShrink: 0 }} />
      )}

      {/* Header — zone D, below notch */}
      {showHeader && <NotchHeader />}

      {/* Content — zone D */}
      {StateComponent && (
        <AnimatePresence mode="wait">
          <motion.div
            key={state}
            {...contentFade}
            style={{
              width: '100%',
              height: dims.height,
            }}
          >
            <StateComponent />
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
