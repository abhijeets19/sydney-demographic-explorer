import '@fontsource-variable/inter';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/app.css';

// No StrictMode: the map, worker and frame loop are imperative singletons.
createRoot(document.getElementById('root')!).render(<App />);
