import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/unbounded/index.css';
import '@fontsource-variable/onest/index.css';
import '@fontsource-variable/noto-sans-armenian/index.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
