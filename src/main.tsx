
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initMonitorBridge } from './integration/bridge/MonitorBridge';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <App />
);

initMonitorBridge();
