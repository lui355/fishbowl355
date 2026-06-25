# fishbowl355

A browser-based Fishbowl party game with a host screen and optional mobile participant word entry.

## Run locally

1. Install Node.js 18+ and Python 3.
2. Copy the environment template and fill in Firebase values if you want to test mobile participants:

   ```bash
   cp .env.example .env
   ```

3. Export the variables from `.env`, generate the browser config, and validate the static files:

   ```bash
   set -a
   source .env
   set +a
   npm run build
   ```

4. Start the local static server:

   ```bash
   npm start
   ```

5. Open <http://localhost:5173> in a browser.

The core host-only game works without Firebase credentials. Creating hosted sessions and accepting mobile participant submissions requires the backend credentials below.

## Backend credentials

Mobile participant support uses Firebase Firestore as the shared session backend. Create a Firebase project, add a Web app, enable Firestore, and set these environment variables before running `npm run build`:

| Variable | Description |
| --- | --- |
| `FISHBOWL_FIREBASE_API_KEY` | Firebase Web API key. |
| `FISHBOWL_FIREBASE_AUTH_DOMAIN` | Firebase auth domain, usually `<project>.firebaseapp.com`. |
| `FISHBOWL_FIREBASE_PROJECT_ID` | Firebase project ID. |
| `FISHBOWL_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket from the Web app config. |
| `FISHBOWL_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID. |
| `FISHBOWL_FIREBASE_APP_ID` | Firebase Web app ID. |
| `FISHBOWL_PUBLIC_URL` | Public deployed URL used in QR-code join links. |

`npm run build` reads those variables and writes `src/env.js`, which is intentionally ignored by Git because it contains deployment-specific public configuration.

A simple Firestore rule for casual game sessions is:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId} {
      allow read, write: if true;
    }
  }
}
```

For a public production site, tighten these rules with App Check, session ownership, or time-based cleanup before sharing the app widely.

## Deploy the frontend

This project is a static frontend. Any static host can serve `index.html`, `src/styles.css`, `src/app.js`, and the generated `src/env.js`.

1. Configure the environment variables listed above in your hosting provider.
2. Run the build command:

   ```bash
   npm run build
   ```

3. Deploy the repository root as the static site output directory.
4. Ensure `FISHBOWL_PUBLIC_URL` exactly matches the deployed HTTPS origin/path, for example `https://fishbowl.example.com`.

Examples:

- **Netlify:** set the build command to `npm run build` and the publish directory to `.`.
- **Vercel:** set the build command to `npm run build` and the output directory to `.`.
- **Firebase Hosting:** run `npm run build`, then deploy the repository root with Firebase Hosting.

## Create a host session

1. Open the deployed app on the host device.
2. In the **Mobile participants** card, select **Create host session**.
3. The app creates a Firestore session, updates the host URL with `?session=<code>`, and displays a QR code plus session code.
4. Leave the host screen open while participants submit words.
5. Add teams, adjust turn length, review the bowl words, then select **Start game**.

## Participants join by QR code

1. Participants scan the QR code shown on the host screen.
2. The QR code opens a link like:

   ```text
   https://your-site.example.com?session=ABC123&role=participant
   ```

3. Each participant enters a person, place, or thing and taps **Send word**.
4. Submitted words sync into the host bowl in real time through Firestore.
5. Participants can keep submitting words until the host starts the game.
