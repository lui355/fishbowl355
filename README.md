# fishbowl355

A browser-based Fishbowl party game with a lightweight Node backend for shared phone submissions.

## Run locally

```bash
npm start
```

Open <http://localhost:5173> as the host.

## Phone topic submissions

The host can create a shared submission session from the setup screen. The app stores sessions by `sessionId` on the Node server and creates anonymous topic records with:

- `id`
- `sessionId`
- `text`
- `createdAt`
- `status` (`new`, `discussed`, or `skipped`)

Players open the generated `?join=<sessionId>` link on their phones to submit topics anonymously. The host can refresh/list topics, import new topics into the bowl, mark topics discussed or skipped, and close or reopen submissions.

This avoids relying on the host browser's `localStorage` for multi-device submissions; `localStorage` is still used only for the host's game state and remembered host session metadata.
