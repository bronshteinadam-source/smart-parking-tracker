"use strict";

/* Retro Rides Parking - attendant dashboard.

   How it works (no backend code needed):
   1. The IoT camera saves each photo on the Apache storage server as
          YYYYMMDD-HHMMSS_PLATE.png      (time in UTC)
   2. Apache shows the folder as a web page ("directory listing").
   3. This script downloads that page every few seconds through Nginx (/plates/),
      finds the photo names, and turns each one into a card on the dashboard.
   So: a new photo in the volume = a new car on the screen, with no page refresh. */

const CONFIG = {
  platesUrl: "/plates/",   // Nginx forwards this to the Apache container
  capacity: 6,             // how many spots the lot has
  pricePerHour: 12,        // NIS per started hour
  graceMinutes: 10,        // free if the car leaves within this time
  pollMs: 3000,            // how often we ask Apache for new photos
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

/* ---------- Reading the Apache listing ---------- */

// File name pattern: 20261109-203015_BELAIR-55.png
const FILE_RE = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})_([A-Za-z0-9-]+)\.(?:png|jpe?g|webp|gif)$/i;

function parseListing(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cars = [];
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    const file = decodeURIComponent(href.split("?")[0].split("/").pop());
    const m = FILE_RE.exec(file);
    if (!m) continue; // skips "Parent Directory", sort links, other files
    const [, Y, Mo, D, h, mi, s, plate] = m;
    cars.push({
      file,
      plate: plate.toUpperCase(),
      arrivedAt: Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +s),
    });
  }
  return cars.sort((a, b) => b.arrivedAt - a.arrivedAt); // newest first
}

/* ---------- State ---------- */

const elements = new Map();      // file name -> card element
const known = new Set();         // files we already saw (to detect new arrivals)
let firstLoad = true;
let lastListing = [];            // everything Apache listed on the last poll
let visibleCars = [];            // cars currently shown (not released)
let released = new Set(JSON.parse(store("rr-released") || "[]"));

/* ---------- Building a card ---------- */

function buildCard(car) {
  const el = document.createElement("article");
  el.className = "car";
  el.dataset.file = car.file;

  const arrived = new Date(car.arrivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `
    <span class="badge-new" hidden>NEW</span>
    <img alt="License plate ${car.plate}" loading="lazy" src="${CONFIG.platesUrl}${encodeURIComponent(car.file)}">
    <div class="car-body">
      <div class="plate-chip"></div>
      <div class="times"><span>Arrived <b>${arrived}</b></span><span>Parked <b class="dur"></b></span></div>
      <div class="fee"><span class="amount"></span><small>so far</small></div>
      <p class="joke"></p>
      <button class="btn-release" type="button">Release car</button>
    </div>`;
  // textContent (not innerHTML) for text that comes from file names: no HTML injection
  el.querySelector(".plate-chip").textContent = car.plate;
  el.querySelector(".joke").textContent = jokeFor(car.plate);
  el.querySelector(".btn-release").addEventListener("click", () => releaseCar(car.file));
  return el;
}

/* ---------- Updating the screen ---------- */

function syncCars(allCars) {
  lastListing = allCars;

  // forget "released" entries whose photo no longer exists (e.g. after `down -v`)
  const present = new Set(allCars.map((c) => c.file));
  const before = released.size;
  released = new Set([...released].filter((f) => present.has(f)));
  if (released.size !== before) store("rr-released", JSON.stringify([...released]));

  visibleCars = allCars.filter((c) => !released.has(c.file));
  const wanted = new Set(visibleCars.map((c) => c.file));
  const lot = $("lot");

  // remove cards that disappeared
  for (const [file, el] of elements) {
    if (!wanted.has(file)) { el.remove(); elements.delete(file); }
  }

  // add new cards and welcome them
  for (const car of visibleCars) {
    if (!elements.has(car.file)) elements.set(car.file, buildCard(car));
    if (!firstLoad && !known.has(car.file)) announceArrival(car);
  }
  allCars.forEach((c) => known.add(c.file));
  firstLoad = false;

  // keep newest-first order (only moves a card if it is in the wrong place)
  visibleCars.forEach((car, i) => {
    const el = elements.get(car.file);
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
    const el = elements.get(car.file);
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
  $("statReleased").textContent = released.size;

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
// The storage server is read-only for the dashboard, so "released" is remembered in this
// browser (localStorage). The photo stays in the volume as the camera's record.
function releaseCar(file) {
  released.add(file);
  store("rr-released", JSON.stringify([...released]));
  const car = lastListing.find((c) => c.file === file);
  syncCars(lastListing);
  if (car) toast(`<b>${car.plate}</b> released. Safe travels!`);
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
  pill.textContent = ok ? "Camera storage: online" : "Camera storage: OFFLINE";
}

async function poll() {
  try {
    const res = await fetch(CONFIG.platesUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    syncCars(parseListing(await res.text()));
    setStatus(true);
  } catch (err) {
    console.warn("Could not read the storage server:", err);
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
