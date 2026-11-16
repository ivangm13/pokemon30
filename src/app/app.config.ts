import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { environment } from '../environments/environment';
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Inicializa la app principal con tus credenciales
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    // Habilita el servicio de Autenticación
    provideAuth(() => getAuth()),
    // Habilita la base de datos Firestore
    provideFirestore(() => getFirestore())
  ]
};


