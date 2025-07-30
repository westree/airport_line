# Flight Delay Worker

This Cloudflare Worker checks for delayed flights from Haneda Airport (HND) and sends notifications via LINE. It also provides a LINE webhook to get the latest arrival information.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Secrets

You need to set the following secrets using the `wrangler` CLI.

```bash
wrangler secret put ODPT_TOKEN
# Paste your ODPT API token when prompted

wrangler secret put LINE_TOKEN
# Paste your LINE Messaging API channel access token when prompted

wrangler secret put LINE_USER_ID
# Paste your LINE user ID to receive push notifications
```

### 3. Configure LINE Webhook

1.  Deploy your worker for the first time to get the URL:
    ```bash
    npm run deploy
    ```
2.  The output will contain the URL of your worker (e.g., `https://flight-delay-worker.<your-workers-subdomain>.workers.dev`).
3.  Go to your LINE Developers Console, select your provider and channel, and go to the "Messaging API" tab.
4.  In the "Webhook settings", paste the URL of your worker followed by `/webhook` (e.g., `https://flight-delay-worker.<your-workers-subdomain>.workers.dev/webhook`).
5.  Enable the webhook.

## Local Development

To test your worker locally, you can use `wrangler dev`.

```bash
npm run dev
```

This will start a local server where you can test your worker. You can use tools like `ngrok` to expose your local server to the internet and test the LINE webhook.

## Deployment

To deploy your worker to Cloudflare, run:

```bash
npm run deploy
```
