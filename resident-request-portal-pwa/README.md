# Springtown Resident Services PWA

A mobile-first resident request portal. Residents choose their floor, choose their unit, speak or type a request, and submit.

The staff dashboard has been removed. The `/admin/` page redirects back to the resident portal.

Included units:

- 1st floor: 101-119
- 2nd floor: 201-220
- 3rd floor: 301-321

## Data Storage

This app does not use Supabase or any database.

The resident request is not saved in the browser or written to a database. On submit, the browser sends the request details once to a Vercel serverless API route, which sends an email notification to Aly.

Older local test request caches are cleared automatically when the app loads.

## What Happens On Submit

Residents can tap the microphone button to speak. The app asks the browser for microphone permission immediately on tap, then stops listening when speech ends and places the transcript in the request box so the resident can review or edit it before submitting. If the browser does not support speech input or microphone permission is blocked, the app shows a visible message and the resident can type the request.

The resident sees a simple confirmation after the email API accepts the submission:

```text
Your request has been received.
Resident Services will review it as soon as possible.
```

If the email API is unavailable, the form does not crash. It shows a simple retry message instead.

## Automatic Email

Residents do not need an email account or email app.

The resident form posts to the Vercel API route at:

```text
/api/send-request
```

`config.js` should stay set to:

```js
window.REQUEST_PORTAL_CONFIG = {
  notificationEndpoint: "/api/send-request"
};
```

The API route sends email to:

```text
jacqueline@smpha.org
```

The email subject is:

```text
New Resident Request Submitted
```

The email body includes:

- Unit number
- Date and time submitted
- Resident request text
- Suggested route
- Urgency
- Suggested action

## Vercel Setup

1. Push this project to a GitHub repo.
2. In Vercel, create a new project from that GitHub repo.
3. Keep the project as a static app with the included `/api/send-request.js` serverless route.
4. In Vercel, open the project.
5. Go to **Settings** -> **Environment Variables**.
6. Add this environment variable:

```text
RESEND_API_KEY
```

7. Paste your Resend API key as the value.
8. Apply it to Production, Preview, and Development if you want testing in every environment.
9. Redeploy the Vercel project after adding or changing environment variables.
10. Strongly recommended for production: add a verified sending domain in Resend, then add this Vercel environment variable:

```text
RESEND_FROM_EMAIL
```

Example value:

```text
Springtown Resident Services <requests@your-verified-domain.org>
```

If `RESEND_FROM_EMAIL` is not set, the API route uses Resend's default test sender:

```text
Springtown Resident Services <onboarding@resend.dev>
```

Do not put `RESEND_API_KEY` in frontend files. It belongs only in Vercel environment variables.

If the form shows an email setup error on the Vercel site, check:

- `RESEND_API_KEY` exists in Vercel Project Settings -> Environment Variables
- the project was redeployed after adding the variable
- `RESEND_FROM_EMAIL` uses a sender/domain verified in Resend
- Vercel Function Logs for `/api/send-request`

## Deploy

Use this workflow:

```text
local/Codex changes -> GitHub repo -> Vercel automatic deploy
```

Vercel will publish the static resident portal and deploy the serverless API route from:

```text
api/send-request.js
```

## Test The API Route

After deployment, open the resident portal on the Vercel site and submit a test request.

The simple local preview server can display the form, but it cannot run `/api/send-request`. Use the Vercel deployment, or `vercel dev`, when testing the email submission.

You can also test the API route directly with:

```bash
curl -X POST "https://YOUR-SITE.vercel.app/api/send-request" \
  -H "Content-Type: application/json" \
  -d '{
    "unit": "203",
    "requestText": "I need help paying utilities before a shutoff notice deadline.",
    "submittedAt": "2026-07-01T12:00:00.000Z",
    "suggestedRoute": "Aly / Resident Services",
    "urgency": "Urgent",
    "suggestedAction": "Review outside assistance resources and follow up with referral options",
    "website": "",
    "formStartedAt": 1782921600000
  }'
```

If email fails, the API route logs a safe error in Vercel function logs and returns a helpful JSON response.

## Spam Protection And Validation

The resident form and API route include basic protection:

- Hidden honeypot field named `website`
- Valid unit check
- Request text required
- Minimum and maximum request length
- Extra-link rejection
- Very-fast-submit rejection

These checks are intentionally lightweight and do not require a database.

## Suggested Routing

The helper uses local rule-based matching in `app.js` to suggest one of these routes:

- Aly / Resident Services
- Norma / Property Manager
- Maintenance
- Emergency Review

Basic household items and everyday Resident Services supplies route to Aly / Resident Services. Outside assistance needs, like help paying rent, utilities, large purchases, food assistance, benefits, or referrals, also route to Aly / Resident Services with a suggested action to review outside resources.

No AI service is required. If AI is added later, keep this rule-based fallback so the form can still send email even if AI is unavailable.
