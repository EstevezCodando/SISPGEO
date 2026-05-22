/**
 * Inicialização do Firebase — SISGEO
 *
 * Usado para:
 *   - Analytics: rastreamento de eventos de cadastro, login, pedidos.
 *   - Email: notificação de cadastro via Firebase (extensão Trigger Email
 *     ou Cloud Function configurada no console Firebase).
 */
import { initializeApp } from 'firebase/app'
import { getAnalytics, logEvent, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyB0XqmVEdNvrU5givQI-FBuQc51PXgBTFo',
  authDomain: 'sisgeo-b3f2a.firebaseapp.com',
  projectId: 'sisgeo-b3f2a',
  storageBucket: 'sisgeo-b3f2a.firebasestorage.app',
  messagingSenderId: '298387671391',
  appId: '1:298387671391:web:9fcb9d0154a3481b40ceea',
  measurementId: 'G-X4KG3KTQZX',
}

const app = initializeApp(firebaseConfig)

let analytics: Analytics | null = null
try {
  analytics = getAnalytics(app)
} catch {
  // Analytics não disponível em ambientes sem window (SSR/testes)
}

/**
 * Registra um evento no Firebase Analytics.
 * Silencioso se Analytics não estiver disponível.
 */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (!analytics) return
  try {
    logEvent(analytics, name, params)
  } catch {
    // ignora falhas de analytics
  }
}

export { app, analytics }
