# FIND UI

Mobile-first React UI for sharing and finding nearby water locations.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

The API defaults to `http://localhost:8000/api`. Set `REACT_APP_API_URL` when running against another API URL. Find and report flows ask the browser for location access. Voting is stored per report and browser-tab session.
