"use strict";

/* Retro Rides Parking - attendant dashboard.

   How it works:
   1. The IoT camera (scripts/camera.*) sends a POST with the plate to the API.
   2. The API (Flask) stores the car in Redis. Redis writes it to a Docker Volume.
   3. This script asks the API "who is in the lot?" (GET /api/cars) every few seconds
      with fetch(), and builds / updates / removes the cards. No page refresh needed.
   Nginx forwards /api/... to the API container, so the browser only talks to one address. */

const CONFIG = {
  apiUrl: "/api/cars",     // Nginx forwards this to the API container
  photosUrl: "/cars/",     // sample car photos, served by Nginx
  capacity: 6,             // how many spots the lot has
  pricePerHour: 12,        // NIS per started hour
  graceMinutes: 10,        // free if the car leaves within this time
  pollMs: 3000,            // how often we ask the API for changes
  newBadgeMinutes: 2,      // show the "NEW" badge for this long
};

/* ---------- Small helpers ---------- */

const $ = (id) => document.getElementById(id);

// localStorage can be blocked by the browser, so never let it crash the page
function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) { /* ignore */ }
  return null;
}

const pad = (n) => String(n).padStart(2, "0");

function formatDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
}

// Parking price: free during the grace period, then NIS per started hour.
function calcFee(ms) {
  const minutes = ms / 60000;
  if (minutes <= CONFIG.graceMinutes) return 0;
  return Math.ceil(minutes / 60) * CONFIG.pricePerHour;
}

/* ---------- Funny messages (picked by the plate, so a car always gets the same one) ---------- */

const JOKES = [
  "Nice ride! Does it come with a crank handle?",
  "That paint job is older than the Wi-Fi.",
  "Welcome back to the fifties. Leave your phone in the glovebox.",
  "Please do not pet the chrome. It bites.",
  "Is that a V8, or are you just happy to see us?",
  "Parked like a true gentleman. Fins and all.",
  "We checked: no, this lot does not accept horses.",
  "Smells like leather and good decisions.",
  "Rear-view mirror says: you look fantastic.",
  "Whitewalls so clean we could eat off them.",
];

function jokeFor(plate) {
  let h = 0;
  for (const ch of plate) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return JOKES[h % JOKES.length];
}

/* ---------- Reading the API answer ---------- */

// The API returns {capacity, parked, total_entered, cars:[{plate, arrived_at}]}.
function parseCars(data) {
  return data.cars
    .filter((c) => /^[A-Z0-9-]{2,12}$/.test(c.plate))   // never trust data blindly
    .map((c) => ({ plate: c.plate, arrivedAt: c.arrived_at * 1000 }))
    .sort((a, b) => b.arrivedAt - a.arrivedAt);          // newest first
}

// A plate we have no photo for gets a drawn plate instead (data: image, allowed by the CSP).
function fallbackPlate(plate) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150"><rect width="300" height="150" fill="#d9d2c0"/><rect x="30" y="40" width="240" height="70" rx="8" fill="#fff" stroke="#222" stroke-width="4"/><text x="150" y="88" font-family="monospace" font-size="30" font-weight="bold" text-anchor="middle" fill="#222">${plate}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

/* ---------- State ---------- */

const elements = new Map();      // plate -> card element
const known = new Set();         // plates we already saw (to detect new arrivals)
let firstLoad = true;
let visibleCars = [];            // cars currently in the lot
let totalEntered = 0;            // how many cars entered, ever (from Redis)

/* ---------- Building a card ---------- */

function buildCard(car) {
  const el = document.createElement("article");
  el.className = "car";
  el.dataset.plate = car.plate;

  const arrived = new Date(car.arrivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `
    <span class="badge-new" hidden>NEW</span>
    <img alt="Classic car ${car.plate}" loading="lazy">
    <div class="car-body">
      <div class="plate-chip"></div>
      <div class="times"><span>Arrived <b>${arrived}</b></span><span>Parked <b class="dur"></b></span></div>
      <div class="fee"><span class="amount"></span><small>so far</small></div>
      <p class="joke"></p>
      <button class="btn-release" type="button">Release car</button>
    </div>`;
  const img = el.querySelector("img");
  img.addEventListener("error", () => { img.src = fallbackPlate(car.plate); }, { once: true });
  img.src = `${CONFIG.photosUrl}${encodeURIComponent(car.plate)}.png`;
  // textContent (not innerHTML) for text that comes from outside: no HTML injection
  el.querySelector(".plate-chip").textContent = car.plate;
  el.querySelector(".joke").textContent = jokeFor(car.plate);
  el.querySelector(".btn-release").addEventListener("click", () => releaseCar(car.plate));
  return el;
}

/* ---------- Updating the screen ---------- */

function syncCars(allCars) {
  visibleCars = allCars;
  const wanted = new Set(visibleCars.map((c) => c.plate));
  const lot = $("lot");

  // remove cards that disappeared (released)
  for (const [plate, el] of elements) {
    if (!wanted.has(plate)) { el.remove(); elements.delete(plate); }
  }

  // add new cards and welcome them
  for (const car of visibleCars) {
    if (!elements.has(car.plate)) elements.set(car.plate, buildCard(car));
    if (!firstLoad && !known.has(car.plate)) announceArrival(car);
  }
  allCars.forEach((c) => known.add(c.plate));
  firstLoad = false;

  // keep newest-first order (only moves a card if it is in the wrong place)
  visibleCars.forEach((car, i) => {
    const el = elements.get(car.plate);
    if (lot.children[i] !== el) lot.insertBefore(el, lot.children[i] || null);
  });

  $("empty").hidden = visibleCars.length > 0;
  tick();
}

// Runs every second: live parking time, live price, stats, alert
function tick() {
  const now = Date.now();
  let money = 0;

  for (const car of visibleCars) {
    const el = elements.get(car.plate);
    if (!el) continue;
    const age = now - car.arrivedAt;
    const fee = calcFee(age);
    money += fee;
    el.querySelector(".dur").textContent = formatDuration(age);
    el.querySelector(".amount").textContent = fee === 0 ? "FREE" : `₪${fee}`;
    el.querySelector(".badge-new").hidden = age > CONFIG.newBadgeMinutes * 60000;
  }

  const inside = visibleCars.length;
  const free = Math.max(0, CONFIG.capacity - inside);
  $("statInside").textContent = inside;
  $("statCap").textContent = `of ${CONFIG.capacity} spots`;
  $("statFree").textContent = free;
  $("statMoney").textContent = `₪${money}`;
  $("statReleased").textContent = totalEntered;

  renderSlots(inside);
  updateFullAlert(inside);
  $("clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderSlots(inside) {
  const box = $("slots");
  const taken = Math.min(inside, CONFIG.capacity);
  const key = `${taken}/${CONFIG.capacity}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.innerHTML = "";
  for (let i = 0; i < CONFIG.capacity; i++) {
    const s = document.createElement("div");
    s.className = "slot" + (i < taken ? " taken" : "");
    s.textContent = i < taken ? "TAKEN" : "FREE";
    box.appendChild(s);
  }
}

// Unique feature: Full Capacity Alert
function updateFullAlert(inside) {
  const banner = $("fullAlert");
  const full = inside >= CONFIG.capacity;
  banner.hidden = !full;
  if (full) {
    $("fullAlertText").textContent = inside > CONFIG.capacity
      ? `${inside - CONFIG.capacity} car(s) over capacity! Release someone or send them away.`
      : "No free spots left. Politely send new cars away.";
  }
}

/* ---------- Actions ---------- */

// Unique feature: Release car button.
// Sends DELETE to the API, which removes the car from Redis (so it is gone for everyone).
async function releaseCar(plate) {
  try {
    const res = await fetch(`${CONFIG.apiUrl}/${encodeURIComponent(plate)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error("HTTP " + res.status);
    visibleCars = visibleCars.filter((c) => c.plate !== plate);
    syncCars(visibleCars);
    toast(`<b>${plate}</b> released. Safe travels!`);
  } catch (err) {
    console.warn("Could not release the car:", err);
    toast("Could not reach the API. Try again.");
  }
}

function announceArrival(car) {
  toast(`<b>${car.plate}</b> just arrived!<br>${jokeFor(car.plate)}`);
  honk();
}

function toast(html) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = html;
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

/* ---------- Connection status + polling ---------- */

function setStatus(ok) {
  const pill = $("status");
  pill.className = "pill " + (ok ? "pill-ok" : "pill-bad");
  pill.textContent = ok ? "API: online" : "API: OFFLINE";
}

async function poll() {
  try {
    const res = await fetch(CONFIG.apiUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    totalEntered = data.total_entered;
    syncCars(parseCars(data));
    setStatus(true);
  } catch (err) {
    console.warn("Could not read the API:", err);
    setStatus(false);
  }
}

/* ---------- Dark mode ---------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("themeBtn").textContent = theme === "dark" ? "Light mode" : "Dark mode";
  store("rr-theme", theme);
}

$("themeBtn").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

applyTheme(
  store("rr-theme") ||
  (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
);

/* ---------- Honk (sound is off until the attendant turns it on) ---------- */

let soundOn = store("rr-sound") === "on";
let audio = null;

function renderSoundBtn() {
  $("soundBtn").textContent = soundOn ? "Sound: on" : "Sound: off";
  $("soundBtn").setAttribute("aria-pressed", String(soundOn));
}

function honk() {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.28].forEach((delay) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "square";
      osc.frequency.value = 392;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + 0.22);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + delay);
      osc.stop(audio.currentTime + delay + 0.25);
    });
  } catch (e) { /* sound is optional */ }
}

$("soundBtn").addEventListener("click", () => {
  soundOn = !soundOn;
  store("rr-sound", soundOn ? "on" : "off");
  renderSoundBtn();
  honk(); // the click is the user gesture browsers require for audio
});
renderSoundBtn();

/* ---------- Easter egg: type "vroom" or enter the Konami code ---------- */

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let keyBuffer = [];

document.addEventListener("keydown", (e) => {
  keyBuffer.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  keyBuffer = keyBuffer.slice(-KONAMI.length);
  const typed = keyBuffer.join("");
  if (keyBuffer.join() === KONAMI.join() || typed.endsWith("vroom")) {
    keyBuffer = [];
    driveAcross();
  }
});

function driveAcross() {
  const car = document.createElement("div");
  car.className = "easter-car";
  const svg = document.querySelector(".brand-car").cloneNode(true);
  svg.removeAttribute("class");
  car.appendChild(svg);
  const msg = document.createElement("span");
  msg.textContent = "BEEP BEEP! You found the secret garage!";
  car.appendChild(msg);
  document.body.appendChild(car);
  honk();
  setTimeout(() => car.remove(), 5000);
}

/* ---------- Start ---------- */

$("statPrice").textContent = `₪${CONFIG.pricePerHour} / started hour`;
$("footPrice").textContent =
  `₪${CONFIG.pricePerHour} per started hour, first ${CONFIG.graceMinutes} minutes free, ${CONFIG.capacity} spots`;

poll();
setInterval(poll, CONFIG.pollMs);
setInterval(tick, 1000);
