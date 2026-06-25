# Topic Draw

Topic Draw is a host-led discussion activity for meetings, classrooms, dinners, and family nights. A host creates a live session, participants scan a QR code with their phones, and everyone anonymously submits questions or topics. The host then closes submissions and randomly draws one topic at a time for group discussion.

## Features

- Host session creation with a shareable participant link.
- QR code for anonymous mobile browser submissions.
- Participant-only submission mode at `?session=<SESSION_ID>&mode=submit`.
- Shared in-memory backend API for sessions and topics.
- Host moderation controls to approve, remove, skip, or mark topics discussed.
- Random topic drawing from approved or skipped topics.
- Responsive UI for both host screens and participant phones.

## Run locally

```bash
npm start
```

Then open <http://localhost:5173> as the host.

## Build/check

```bash
npm run build
```

The build script validates that the static files and server entrypoint are present.

## Phone testing

To test with phones on the same network, start the server and open it using your machine's LAN IP address, for example `http://192.168.1.25:5173`. The generated QR code points participants to the session submission URL.

## Production note

The included server stores sessions in memory, so sessions reset when the process restarts. For production, replace the in-memory `Map` in `server.js` with durable storage such as Supabase, Firebase, Postgres, Redis, or another hosted database.
