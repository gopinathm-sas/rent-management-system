import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

console.log('Current App Version: DEBUG CHECK STARTUP');
try {
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>,
    )
    console.log('Current App Version: DEBUG CHECK RENDERED');
} catch (e) {
    console.error("CRITICAL RENDER FAILURE:", e);
    document.body.innerHTML = `<div style="color:red; padding: 20px;">CRITICAL RENDER FAILURE: ${e}</div>`;
}
