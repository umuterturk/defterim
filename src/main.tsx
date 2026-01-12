import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Make right-click behave like left-click throughout the app
// This helps users who sometimes mix up right and left clicks
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  
  const target = event.target as HTMLElement;
  
  // Create and dispatch a click event with the same properties
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: 0, // Left mouse button
  });
  
  target.dispatchEvent(clickEvent);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
