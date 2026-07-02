const PORTAL_CONFIG = window.REQUEST_PORTAL_CONFIG || {};

const FLOORS = [
  { id: "1", label: "1st Floor", units: ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113", "114", "115", "116", "117", "118", "119"] },
  { id: "2", label: "2nd Floor", units: ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212", "213", "214", "215", "216", "217", "218", "219", "220"] },
  { id: "3", label: "3rd Floor", units: ["301", "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312", "313", "314", "315", "316", "317", "318", "319", "320", "321"] }
];

const app = document.querySelector("#app");
let residentStep = "floor";
let selectedFloor = "";
let selectedUnit = "";
let requestText = "";
let submitError = "";
let submitting = false;
let formStartedAt = Date.now();
let listening = false;
let recognition = null;
let speechBaseText = "";
let speechStatus = "Tap and speak, then review the words below.";
let speechHadResult = false;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

clearLegacyRequestStorage();
render();

function clearLegacyRequestStorage() {
  try {
    localStorage.removeItem("springtown-resident-requests-v2");
    localStorage.removeItem("resident-request-portal-v1");
  } catch {}
}

function chooseFloor(floorId) {
  selectedFloor = floorId;
  selectedUnit = "";
  submitError = "";
  residentStep = "unit";
  render();
}

function chooseUnit(unit) {
  selectedUnit = unit;
  submitError = "";
  speechStatus = "Tap and speak, then review the words below.";
  formStartedAt = Date.now();
  residentStep = "request";
  render();
  setTimeout(() => document.querySelector("#requestText")?.focus(), 50);
}

async function submitRequest(event) {
  event.preventDefault();
  if (submitting) return;

  const form = new FormData(event.currentTarget);
  const text = String(form.get("requestText") || "").trim();
  const website = String(form.get("website") || "").trim();
  const validationMessage = validateRequest(selectedUnit, text);

  if (validationMessage) {
    submitError = validationMessage;
    render();
    return;
  }

  const submittedAt = new Date().toISOString();
  const suggestion = suggestRequestDetails(text);
  const emailNotification = buildEmailNotification(selectedUnit, submittedAt, text, suggestion);
  const request = {
    unit: selectedUnit,
    requestText: text,
    submittedAt,
    suggestedRoute: suggestion.routing,
    urgency: suggestion.urgency,
    suggestedAction: suggestion.nextAction,
    emailNotification,
    website,
    formStartedAt
  };

  submitting = true;
  submitError = "";
  render();

  try {
    await notifyStaff(request);
    requestText = "";
    residentStep = "confirmation";
  } catch (error) {
    submitError = error?.message || "We could not submit your request right now. Please try again.";
  } finally {
    submitting = false;
    render();
  }
}

function validateRequest(unit, text) {
  if (!isValidUnit(unit)) return "Please choose your unit again.";
  if (!text) return "Please type your request.";
  if (text.length < 5) return "Please add a little more detail.";
  if (text.length > 2000) return "Please shorten your request.";
  return "";
}

function isValidUnit(unit) {
  return FLOORS.some(floor => floor.units.includes(String(unit)));
}

function suggestRequestDetails(text) {
  const value = text.toLowerCase();

  if (matches(value, ["fire", "smoke", "gas smell", "gas leak", "flooding", "medical emergency", "unsafe", "break in", "break-in", "violence", "threat"])) {
    return {
      routing: "Emergency Review",
      urgency: "Emergency / Immediate Human Review",
      nextAction: "Call the resident and escalate immediately"
    };
  }

  if (matches(value, ["toilet paper", "paper towel", "cleaning supplies", "cleaning supply", "dish soap", "laundry detergent", "detergent", "trash bags", "trash bag", "mop", "broom", "bleach", "disinfectant", "basic household", "household item"])) {
    return {
      routing: "Aly / Resident Services",
      urgency: "Normal",
      nextAction: "Check Resident Services supplies and follow up with the resident"
    };
  }

  if (matches(value, ["rent assistance", "help paying rent", "eviction", "rent notice", "rental assistance", "utility assistance", "electric bill", "water bill", "gas bill", "shutoff", "shut off", "furniture", "mattress", "bed", "appliance", "large purchase", "food assistance", "benefits", "resources", "referral"])) {
    return {
      routing: "Aly / Resident Services",
      urgency: matches(value, ["eviction", "deadline", "notice", "shutoff", "shut off", "disconnect"]) ? "Urgent" : "Soon",
      nextAction: "Review outside assistance resources and follow up with referral options"
    };
  }

  if (matches(value, ["leak", "toilet", "sink", "drain", "heat", "air conditioner", "ac", "a/c", "light", "outlet", "lock", "door", "window", "pest", "bug", "roach", "mouse", "maintenance", "repair", "broken"])) {
    return {
      routing: "Maintenance",
      urgency: matches(value, ["leak", "heat", "lock", "door", "window", "no water", "no power"]) ? "Urgent" : "Soon",
      nextAction: "Refer to maintenance"
    };
  }

  if (matches(value, ["norma", "property manager", "main office", "lease", "rent balance", "late fee", "notice", "neighbor", "complaint", "rule", "account", "payment"])) {
    return {
      routing: "Norma / Property Manager",
      urgency: matches(value, ["deadline", "notice", "urgent", "court", "eviction"]) ? "Urgent" : "Soon",
      nextAction: "Route to Norma"
    };
  }

  return {
    routing: "Aly / Resident Services",
    urgency: "Normal",
    nextAction: "Review request and follow up with the resident"
  };
}

function matches(value, terms) {
  return terms.some(term => value.includes(term));
}

function buildEmailNotification(unit, submittedAt, text, suggestion) {
  const subjectPrefix = suggestion.urgency.startsWith("Emergency")
    ? "Emergency Review Recommended"
    : suggestion.urgency === "Urgent"
      ? "Urgent Resident Request"
      : "New Resident Request";

  const body = [
    `Unit: ${unit}`,
    `Submitted: ${formatDateTime(submittedAt)}`,
    "",
    "Resident request:",
    text,
    "",
    `Suggested route: ${suggestion.routing}`,
    `Urgency: ${suggestion.urgency}`,
    `Suggested action: ${suggestion.nextAction}`
  ].join("\n");

  return {
    subject: `${subjectPrefix} - Unit ${unit}`,
    body
  };
}

async function notifyStaff(request) {
  if (!PORTAL_CONFIG.notificationEndpoint) {
    throw new Error("Email endpoint is not configured.");
  }

  const response = await fetch(PORTAL_CONFIG.notificationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      unit: request.unit,
      requestText: request.requestText,
      submittedAt: request.submittedAt,
      suggestedRoute: request.suggestedRoute,
      urgency: request.urgency,
      suggestedAction: request.suggestedAction,
      emailSubject: request.emailNotification.subject,
      emailBody: request.emailNotification.body,
      website: request.website,
      formStartedAt: request.formStartedAt
    })
  });

  if (!response.ok) {
    throw new Error(await submissionErrorMessage(response));
  }
}

async function submissionErrorMessage(response) {
  if (response.status === 404 && location.hostname === "127.0.0.1") {
    return "This local preview cannot send email. Please test submissions on the Vercel site.";
  }

  try {
    const data = await response.json();
    if (data?.message) return data.message;
  } catch {}

  return "We could not submit your request right now. Please try again.";
}

function startOver() {
  selectedFloor = "";
  selectedUnit = "";
  requestText = "";
  submitError = "";
  submitting = false;
  speechStatus = "Tap and speak, then review the words below.";
  formStartedAt = Date.now();
  residentStep = "floor";
  render();
}

async function startSpeech() {
  if (!navigator.mediaDevices?.getUserMedia) {
    speechStatus = "This browser cannot ask for microphone access. Please type your request below.";
    render();
    return;
  }

  const permissionStartedAt = Date.now();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
  } catch (error) {
    speechStatus = microphonePermissionMessage(error?.name, Date.now() - permissionStartedAt);
    render();
    return;
  }

  speechStatus = "Microphone access is allowed. Starting speech input...";
  render();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    speechStatus = "Microphone access is allowed, but this browser cannot transcribe speech. Please type your request below.";
    render();
    return;
  }
  const textarea = document.querySelector("#requestText");
  speechBaseText = String(textarea?.value || requestText || "").trim();
  speechHadResult = false;
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    listening = true;
    speechStatus = "Listening now. The words will appear below.";
    render();
  };
  recognition.onresult = event => {
    const transcript = Array.from(event.results)
      .map(result => result[0].transcript)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    requestText = [speechBaseText, transcript].filter(Boolean).join(" ");
    speechHadResult = Boolean(transcript);
    speechStatus = "Text is appearing below. You can edit it before submitting.";
    const requestTextarea = document.querySelector("#requestText");
    if (requestTextarea) requestTextarea.value = requestText;
  };
  recognition.onspeechend = () => {
    speechStatus = "Got it. Review the words below before submitting.";
    if (recognition) recognition.stop();
  };
  recognition.onend = () => {
    listening = false;
    recognition = null;
    if (!speechHadResult && !requestText.trim()) speechStatus = "I did not catch anything. Tap and speak again, or type below.";
    render();
  };
  recognition.onerror = event => {
    listening = false;
    recognition = null;
    speechStatus = speechErrorMessage(event?.error);
    render();
  };
  try {
    recognition.start();
  } catch {
    listening = false;
    recognition = null;
    speechStatus = "Speech input could not start. Please type your request below.";
    render();
  }
}

function stopSpeech() {
  if (recognition) recognition.stop();
  listening = false;
  recognition = null;
  speechStatus = "Stopped. Review the words below before submitting.";
  render();
}

function microphonePermissionMessage(errorName, elapsedMs = 0) {
  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    if (elapsedMs < 800) return "This browser did not show a microphone prompt. Please type below, or open this portal in Chrome or Safari.";
    return "Microphone permission was denied. Please allow the microphone or type below.";
  }
  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") return "No microphone was found. Please type your request below.";
  if (errorName === "NotReadableError" || errorName === "TrackStartError") return "The microphone is already in use or unavailable. Please try again or type below.";
  return "Microphone access did not work in this browser. Please type your request below.";
}

function speechErrorMessage(error) {
  if (error === "not-allowed" || error === "service-not-allowed") return "Speech access was not allowed. Please type below, or open this portal in Chrome or Safari.";
  if (error === "no-speech") return "I did not hear anything. Tap and speak again, or type below.";
  if (error === "audio-capture") return "No microphone was found. Please type your request below.";
  if (error === "network") return "Speech input needs a connection and is not available right now. Please type below.";
  return "Speech input did not work in this browser. Please type your request below.";
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function render() {
  app.innerHTML = `
    ${renderTopbar()}
    ${residentStep === "confirmation" ? renderConfirmation() : renderResidentRoute()}
  `;
  bindEvents();
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <h1>Springtown Resident Services</h1>
          <p>Resident Request Portal</p>
        </div>
      </div>
    </header>
  `;
}

function renderResidentRoute() {
  return `
    <main class="main resident-main">
      <div class="screen">
        ${renderProgress()}
        ${residentStep === "floor" ? renderFloorScreen() : ""}
        ${residentStep === "unit" ? renderUnitScreen() : ""}
        ${residentStep === "request" ? renderRequestScreen() : ""}
      </div>
    </main>
  `;
}

function renderProgress() {
  const steps = ["floor", "unit", "request"];
  const activeIndex = steps.indexOf(residentStep);
  return `
    <div class="progress" aria-label="Request progress">
      ${steps.map((step, index) => `<span class="${index <= activeIndex ? "active" : ""}"></span>`).join("")}
    </div>
  `;
}

function renderFloorScreen() {
  return `
    <section class="panel step-panel">
      <h2 class="step-title">Choose your floor</h2>
      <p class="step-subtitle">Tap one button.</p>
    </section>
    <section class="choice-grid floor-grid" aria-label="Floors">
      ${FLOORS.map(floor => `<button class="choice-button" data-floor="${floor.id}" type="button">${floor.label}</button>`).join("")}
    </section>
  `;
}

function renderUnitScreen() {
  const floor = FLOORS.find(item => item.id === selectedFloor);
  return `
    <section class="panel step-panel">
      <h2 class="step-title">Choose your unit</h2>
      <p class="step-subtitle">${floor?.label || ""}</p>
    </section>
    <section class="choice-grid" aria-label="Units">
      ${(floor?.units || []).map(unit => `<button class="choice-button unit-button" data-unit="${unit}" type="button">${unit}</button>`).join("")}
    </section>
    <div class="back-row">
      <button class="secondary-button" data-action="back-floor" type="button">Back</button>
    </div>
  `;
}

function renderRequestScreen() {
  return `
    <section class="panel step-panel">
      <h2 class="step-title">Tell us your request</h2>
      <p class="step-subtitle">Unit ${escapeHtml(selectedUnit)}</p>
    </section>
    <form class="panel request-box" data-form="request">
      <label class="spam-trap" for="website">
        Leave this field blank
        <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
      </label>
      <button class="choice-button speak-button ${listening ? "listening" : ""}" data-action="speak" type="button">
        <span class="mic-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img">
            <path d="M12 14a4 4 0 0 0 4-4V6a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4Z"></path>
            <path d="M19 10a7 7 0 0 1-14 0"></path>
            <path d="M12 17v4"></path>
            <path d="M8 21h8"></path>
          </svg>
        </span>
        <span class="speak-label">Tap and speak</span>
      </button>
      <p class="speech-status" aria-live="polite">${escapeHtml(speechStatus)}</p>
      <label for="requestText">
        Or type your request here
        <textarea class="request-textarea" id="requestText" name="requestText" maxlength="2000" required>${escapeHtml(requestText)}</textarea>
      </label>
      ${submitError ? `<p class="form-error" role="alert">${escapeHtml(submitError)}</p>` : ""}
      <button class="primary-button large-submit" type="submit" ${submitting ? "disabled" : ""}>${submitting ? "Submitting..." : "Submit"}</button>
    </form>
    <div class="back-row">
      <button class="secondary-button" data-action="back-unit" type="button">Back</button>
      <button class="secondary-button" data-action="start-over" type="button">Start Over</button>
    </div>
  `;
}

function renderConfirmation() {
  return `
    <main class="main confirmation">
      <section class="panel">
        <h2>Your request has been received.</h2>
        <p>Resident Services will review it as soon as possible.</p>
        <button class="primary-button large-submit" data-action="start-over" type="button">Done</button>
      </section>
    </main>
  `;
}

function bindEvents() {
  document.querySelector("[data-form='request']")?.addEventListener("submit", submitRequest);
  document.querySelector("#requestText")?.addEventListener("input", event => {
    requestText = event.target.value;
  });
  document.querySelectorAll("[data-floor]").forEach(button => {
    button.addEventListener("click", () => chooseFloor(button.dataset.floor));
  });
  document.querySelectorAll("[data-unit]").forEach(button => {
    button.addEventListener("click", () => chooseUnit(button.dataset.unit));
  });
  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
}

function handleAction(action) {
  if (action === "back-floor") {
    residentStep = "floor";
    selectedFloor = "";
    selectedUnit = "";
    render();
  }
  if (action === "back-unit") {
    residentStep = "unit";
    selectedUnit = "";
    render();
  }
  if (action === "start-over") startOver();
  if (action === "speak") {
    listening ? stopSpeech() : startSpeech().catch(() => {
      speechStatus = "Speech input could not start. Please type your request below.";
      render();
    });
  }
}
