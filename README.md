# Music Research QR Agent

This project gives your printed Apple Music and Spotify journey map a live conversation layer.
People scan a QR code, open a chat page, and ask about personas, research patterns, assignments,
and what the journey map reveals.

The app has two modes:

- Free mode: works with no API key and answers using your local project data, including persona-style first-person replies
- AI mode: uses the OpenAI Responses API for more flexible natural-language answers

## What is included

- A lightweight Node server with no external dependencies
- A mobile-friendly chat interface for QR visitors
- A persona picker so visitors can chat with Franklin, Brayden, Brandon, Reid, or Sheila
- A local knowledge file for your personas, assignments, and journey-map insights
- A QR generation script that saves an SVG you can place on the print layout

## Project structure

- `data/knowledge-base.json` stores the content the agent should know
- `public/` contains the chat experience
- `server.js` serves the app and sends chat requests to the OpenAI Responses API
- `scripts/generate-qr.js` creates a QR SVG after you know the deployed URL

## Setup

1. Fill in `data/knowledge-base.json` with your real personas, assignment summary, and journey-map notes.
2. Optional: copy `.env.example` to `.env`.
3. Optional: add your OpenAI API key to `.env` if you want AI mode.
4. Start the app:

```bash
npm start
```

5. Open `http://localhost:3000`.

## Environment variables

- `OPENAI_API_KEY` is optional
- `OPENAI_MODEL` defaults to `gpt-5-mini`
- `PORT` defaults to `3000`

## Deploy

You can deploy this to any simple Node host, including Render, Railway, or Vercel.
Once you have the final public URL, generate the QR code:

```bash
npm run qr -- https://your-live-site.example
```

That saves the QR SVG to `assets/journey-map-qr.svg`.

## Recommended deployment: Render

Render is the easiest fit for this project because it runs a normal Node web service without
requiring any serverless rewrites.

1. Put this project in a GitHub repo.
2. In Render, create a new `Web Service` from that repo.
3. Render can also detect `render.yaml`, which is already included in this project.
4. Add this environment variable in the Render dashboard:

```bash
OPENAI_API_KEY=your_real_key_here
```

This step is optional. If you leave it out, the site still works in free mode.

5. Deploy the service.
6. After Render gives you the live URL, generate the QR code:

```bash
npm run qr -- https://your-service-name.onrender.com
```

Official docs:

- Render Web Services: https://render.com/docs/web-services
- Render environment variables: https://render.com/docs/configure-environment-variables

## Best results

- Be specific in the knowledge base, especially around persona goals, pain points, and journey stages.
- Include short assignment summaries so the agent can explain the broader class context.
- Add the strongest insights from your printed map so the agent can answer deeper follow-up questions.

## Suggested next step

If you want, we can now do either of these:

1. Turn your real persona notes into a polished `knowledge-base.json`.
2. Add a stronger branded visual identity so the QR landing page matches your print artifact.
