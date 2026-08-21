# Nuestro Atlas — PWA

Esta carpeta contiene una versión PWA del proyecto generado por Claude.

## 1. Requisitos
- Node.js 18+ (recomendado 20+)
- npm

## 2. Instalar
```bash
npm install
```

## 3. Probar en local
```bash
npm run dev
```

## 4. Crear la versión de producción
```bash
npm run build
```

La carpeta `dist/` es la que debes publicar en un hosting HTTPS para poder instalarla como PWA.

## 5. Importante sobre los datos
La app original utilizaba `window.storage`, que no es una API estándar del navegador.
`src/main.jsx` incluye una compatibilidad que guarda los datos en `localStorage`.

Esto significa que, en esta primera PWA, **los datos se guardan en cada dispositivo por separado**.
Si quieres que Miguel y Alba compartan exactamente los mismos destinos, ahorros y viajes entre sus dos móviles, el siguiente paso debería ser conectar la app a una base de datos (por ejemplo Supabase/Firebase).

## 6. Mapa
El mapa usa Leaflet + OpenStreetMap. Las baldosas del mapa requieren conexión a Internet.
