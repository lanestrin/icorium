import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { claimDemoLock, currentDemoId } from './lib/demo';
import './index.css';

// Every page holds this tab's demo lock, so another tab's cleanup can't delete the demo while a page without
// useAccount (such as /activate) is open.
const demoId = currentDemoId();
if (demoId) void claimDemoLock(demoId);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
