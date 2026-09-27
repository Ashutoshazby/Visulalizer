# Saanjh Music

A sunset-beach music player for Indian and English music, with animated waves, mood and language recommendations, search, and native Android/iOS support.

## Music Provider

Version 1 uses an isolated JioSaavn-compatible provider through the public `saavn.dev` style API. The backend proxy calls:

- `GET /api/search/songs?query=...&page=0&limit=...`
- `GET /api/songs/{id}`
- song `downloadUrl[]` entries for browser playback

The proxy exists because public music APIs and CDN stream URLs may have CORS, expiry, or response-shape changes. Audio files are streamed directly to the browser and are never stored by this app.

## Run Locally

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal, usually `http://localhost:5173`.

For production:

```bash
npm run build
npm run server
```

## Environment

Copy `.env.example` to `.env` if you want to override defaults.

```bash
PORT=4177
SAAVN_API_BASE=https://saavan-api-psi.vercel.app
```

No database is required. Listening preferences and lightweight history stay in `localStorage`.

## Native App

The `mobile/` folder contains a login-free Expo React Native player for Android and iOS. It opens directly to recommendations and search, and uses the same Render API and streaming proxy as the web app. Make sure that API service is active before distributing the app.

```bash
cd mobile
npm install
npm start
```

For an installable Android test APK, configure Expo EAS once and run `npx eas build --profile preview --platform android`.
