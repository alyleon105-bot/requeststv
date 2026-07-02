# Springtown Resident Services PWA

A mobile-first resident request portal. Residents choose their floor, choose their unit, speak or type a request, and submit.

The staff dashboard has been removed. The `/admin/` page redirects back to the resident portal.

Included units:

- 1st floor: 101-119
- 2nd floor: 201-220
- 3rd floor: 301-321

## Data Storage

This app does not use Supabase, Vercel storage, or any database.

Resident request details are not saved in the browser. Older local test request caches are cleared automatically when the app loads.

On submit, the browser sends the request details one time to a Google Apps Script Web App URL. The Apps Script emails the request to Aly using Google's built-in `MailApp`.

## What Happens On Submit

Residents do not need an email account or email app.

Residents can tap the microphone button to speak. The app asks the browser for microphone permission on the first tap, remembers that permission during the page session, then stops listening when speech ends and places the transcript in the request box so the resident can review or edit it before submitting. If the browser does not support speech input or microphone permission is blocked, the app shows a visible message and the resident can type the request.

After the request is sent to the Apps Script URL, the resident sees:

```text
Your request has been received.
Resident Services will review it as soon as possible.
```

If the request cannot be sent, the form does not crash. It shows a simple setup or retry message.

## Configure The Email Endpoint

Open `config.js` and paste your Google Apps Script Web App URL here:

```js
window.REQUEST_PORTAL_CONFIG = {
  notificationEndpoint: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
};
```

Leave it blank until the Apps Script web app is created:

```js
window.REQUEST_PORTAL_CONFIG = {
  notificationEndpoint: ""
};
```

The Apps Script URL is not an email password or API key. Do not put Gmail passwords, API keys, or other secrets in frontend files.

## Create The Google Apps Script Web App

1. Go to [Google Apps Script](https://script.google.com/).
2. Click **New project**.
3. Replace the starter code with this:

```js
const RECIPIENT_EMAIL = "jacqueline@smpha.org";

function doPost(e) {
  try {
    const data = JSON.parse((e.postData && e.postData.contents) || "{}");

    if (data.website) {
      return jsonResponse({ ok: true, message: "Ignored." });
    }

    const unit = String(data.unit || "").trim();
    const requestText = String(data.requestText || "").trim();

    if (!unit || !requestText) {
      return jsonResponse({ ok: false, message: "Missing unit or request text." });
    }

    const body = [
      "New Resident Request Submitted",
      "",
      `Unit: ${unit}`,
      `Submitted: ${data.submittedAt || "Not provided"}`,
      "",
      "Resident request:",
      requestText,
      "",
      `Suggested route: ${data.suggestedRoute || "Not provided"}`,
      `Urgency: ${data.urgency || "Not provided"}`,
      `Suggested action: ${data.suggestedAction || "Not provided"}`
    ].join("\n");

    MailApp.sendEmail(RECIPIENT_EMAIL, "New Resident Request Submitted", body);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, message: "Request could not be emailed." });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. Click **Save** and name the project something like `Springtown Resident Requests`.
5. Click **Deploy** -> **New deployment**.
6. Click the gear icon beside **Select type** and choose **Web app**.
7. Set **Execute as** to **Me**.
8. Set **Who has access** to **Anyone**.
9. Click **Deploy**.
10. Google will ask you to authorize the script. Approve it so the script can send email from your Google account.
11. Copy the **Web app URL**. It should end in `/exec`.
12. Paste that URL into `config.js` as `notificationEndpoint`.
13. Commit and push the project so your host redeploys the updated static files.

If you edit the Apps Script later, open **Deploy** -> **Manage deployments**, edit the web app deployment, choose a new version, and deploy again.

## Deploy

Use this workflow:

```text
local/Codex changes -> GitHub repo -> automatic deploy
```

The site can still be hosted on Vercel as a static site. Vercel is not used to store requests or send email.

## Test

1. Make sure `config.js` has the Apps Script Web App URL.
2. Open the deployed resident portal.
3. Submit a test request.
4. Check `jacqueline@smpha.org` for the email.
5. If it does not arrive, open the Apps Script project and check **Executions** for errors.

You can also test the Apps Script directly from your computer by sending a POST request to the Web App URL:

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: text/plain;charset=utf-8" \
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

## Spam Protection And Validation

The resident form includes basic protection:

- Hidden honeypot field named `website`
- Valid unit check
- Request text required
- Minimum and maximum request length
- Extra-link rejection
- Very-fast-submit rejection

The Apps Script also rejects submissions missing a unit or request text and ignores honeypot submissions. These checks are intentionally lightweight and do not require a database.

## Suggested Routing

The helper uses local rule-based matching in `app.js` to suggest one of these routes:

- Aly / Resident Services
- Norma / Property Manager
- Maintenance
- Emergency Review

Basic household items and everyday Resident Services supplies route to Aly / Resident Services. Outside assistance needs, like help paying rent, utilities, large purchases, food assistance, benefits, or referrals, also route to Aly / Resident Services with a suggested action to review outside resources.

No AI service is required. If AI is added later, keep this rule-based fallback so the form can still send email even if AI is unavailable.
