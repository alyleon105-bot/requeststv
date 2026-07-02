const STAFF_EMAIL = "jacqueline@smpha.org";
const DEFAULT_FROM_EMAIL = "Springtown Resident Services <onboarding@resend.dev>";
const UNIT_PATTERN = /^(10[1-9]|11[0-9]|20[1-9]|21[0-9]|220|30[1-9]|31[0-9]|32[0-1])$/;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { ok: false, message: "Use POST to submit a resident request." });
  }

  const payload = parseBody(request.body);
  const unit = clean(payload.unit);
  const requestText = clean(payload.requestText);
  const submittedAt = clean(payload.submittedAt);
  const suggestedRoute = clean(payload.suggestedRoute);
  const urgency = clean(payload.urgency);
  const suggestedAction = clean(payload.suggestedAction);
  const website = clean(payload.website);
  const formStartedAt = Number(payload.formStartedAt || 0);

  const validationError = validatePayload({ unit, requestText, website, formStartedAt });
  if (validationError) {
    return json(response, 400, { ok: false, message: validationError });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("send-request email failure: missing RESEND_API_KEY");
    return json(response, 500, {
      ok: false,
      message: "Email is not configured in Vercel yet. Add RESEND_API_KEY in Vercel Environment Variables, then redeploy."
    });
  }

  const emailBody = buildEmailBody({
    unit,
    requestText,
    submittedAt,
    suggestedRoute,
    urgency,
    suggestedAction
  });

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL,
        to: [STAFF_EMAIL],
        subject: "New Resident Request Submitted",
        text: emailBody,
        html: htmlEmail(emailBody)
      })
    });

    const resultText = await resendResponse.text();
    const result = parseJson(resultText);

    if (!resendResponse.ok) {
      const resendMessage = result.error?.message || result.message || "Resend request failed";
      console.error("send-request email failure:", {
        status: resendResponse.status,
        error: resendMessage
      });
      return json(response, 502, {
        ok: false,
        message: resendSetupMessage(resendMessage)
      });
    }

    return json(response, 200, {
      ok: true,
      message: "Resident request notification sent.",
      emailId: result.id || null
    });
  } catch (error) {
    console.error("send-request email failure:", {
      message: error instanceof Error ? error.message : "Unknown email error"
    });
    return json(response, 502, {
      ok: false,
      message: "The notification email could not be sent."
    });
  }
}

function resendSetupMessage(message) {
  const value = String(message || "").toLowerCase();
  if (value.includes("api key") || value.includes("invalid")) {
    return "Resend rejected the API key. Check RESEND_API_KEY in Vercel Environment Variables, then redeploy.";
  }
  if (value.includes("domain") || value.includes("sender") || value.includes("from") || value.includes("verify")) {
    return "Resend could not send from this sender. Verify a sending domain in Resend and set RESEND_FROM_EMAIL in Vercel.";
  }
  if (value.includes("testing emails") || value.includes("own email")) {
    return "Resend is still in test mode. Verify a domain in Resend or send only to the verified Resend account email.";
  }
  return "The notification email could not be sent. Check the Vercel function logs for the Resend error.";
}

function validatePayload({ unit, requestText, website, formStartedAt }) {
  if (website) return "Submission rejected.";
  if (!UNIT_PATTERN.test(unit)) return "Please choose a valid unit.";
  if (!requestText) return "Request text is required.";
  if (requestText.length < 5) return "Please add a little more detail.";
  if (requestText.length > 2000) return "Please shorten your request.";
  if ((requestText.match(/https?:\/\//gi) || []).length > 2) return "Please remove extra links.";
  if (formStartedAt && Date.now() - formStartedAt < 1500) return "Please wait a moment and try again.";
  return "";
}

function clean(value) {
  return String(value || "").trim();
}

function buildEmailBody(details) {
  return [
    "New Resident Request Submitted",
    "",
    `Unit: ${details.unit}`,
    `Submitted: ${details.submittedAt || "Not provided"}`,
    "",
    "Resident request:",
    details.requestText,
    "",
    `Suggested route: ${details.suggestedRoute || "Not provided"}`,
    `Urgency: ${details.urgency || "Not provided"}`,
    `Suggested action: ${details.suggestedAction || "Not provided"}`
  ].join("\n");
}

function htmlEmail(text) {
  return `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(text)}</pre>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") return parseJson(body);
  return body;
}

function json(response, statusCode, body) {
  response.status(statusCode).json(body);
}
