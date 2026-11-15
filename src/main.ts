import './ui/styles.css';
import { mountApp, type App } from './ui/app';

declare global {
  interface Window {
    /** Lets automated tests drive the app, like window.__novaflow in NovaFlow. */
    __iconMaker?: App;
  }
}

window.__iconMaker = mountApp(document.querySelector<HTMLDivElement>('#app')!);
