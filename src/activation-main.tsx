import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ActivationApp } from './ActivationApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ActivationApp />
  </StrictMode>,
);
