import { bootstrapApplication } from '@angular/platform-browser';
import { Root } from './app/root';
import { appConfig } from './app/app.config';

// Las rutas hash mantienen la navegación directa y las recargas en GitHub Pages.
bootstrapApplication(Root, appConfig).catch((err) => console.error(err));
