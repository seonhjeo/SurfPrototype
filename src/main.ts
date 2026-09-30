import { SurfApp } from './ui';
import './style.css';

const app = new SurfApp();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.destroy();
  });
}
