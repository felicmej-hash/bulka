"use strict";

const hero = document.querySelector("[data-hero]");
const mascot = document.querySelector("[data-mascot]");

if (hero && mascot) {
  const greeting = document.querySelector("[data-greeting]");
  const canTrack = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
  const messages = ["Привет! Я Кузя.", "Есть минутка для сказки?", "Как здорово, что ты заглянул!"];
  let messageIndex = 0;
  let frame = 0;
  let hideGreeting;
  let resetNod;

  hero.addEventListener("pointermove", (event) => {
    if (!canTrack.matches || event.pointerType === "touch") return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = mascot.getBoundingClientRect();
      const clamp = (value) => Math.max(-1, Math.min(1, value));
      const x = clamp((event.clientX - rect.left - rect.width * 0.5) / (rect.width * 0.82));
      const y = clamp((event.clientY - rect.top - rect.height * 0.36) / (rect.height * 0.65));
      mascot.style.setProperty("--x", `${x * 9}px`);
      mascot.style.setProperty("--y", `${y * 4}px`);
      mascot.style.setProperty("--yaw", `${x * 11}deg`);
      mascot.style.setProperty("--pitch", `${y * -6}deg`);
      mascot.style.setProperty("--tilt", `${x * 5}deg`);
    });
  });

  function resetLook() {
    cancelAnimationFrame(frame);
    for (const property of ["--x", "--y", "--yaw", "--pitch", "--tilt"]) {
      mascot.style.removeProperty(property);
    }
  }

  hero.addEventListener("pointerleave", resetLook);
  canTrack.addEventListener("change", resetLook);

  mascot.addEventListener("click", () => {
    greeting.textContent = messages[messageIndex];
    messageIndex = (messageIndex + 1) % messages.length;
    mascot.classList.remove("is-greeting");
    void mascot.offsetWidth;
    mascot.classList.add("is-greeting");
    clearTimeout(resetNod);
    clearTimeout(hideGreeting);
    resetNod = setTimeout(() => mascot.classList.remove("is-greeting"), 650);
    hideGreeting = setTimeout(() => { greeting.textContent = ""; }, 3300);
  });
}

const gallery = document.querySelector("[data-gallery]");
if (gallery) {
  const choices = [...document.querySelectorAll("[data-view-choice]")];
  choices.forEach((choice) => choice.addEventListener("click", () => {
    const view = choice.dataset.viewChoice;
    gallery.dataset.view = view;
    gallery.setAttribute("aria-label", view === "front" ? "Колобок, вид спереди" : "Колобок, вид сбоку");
    choices.forEach((button) => button.setAttribute("aria-pressed", String(button === choice)));
  }));
}

const requestForm = document.querySelector("[data-request-form]");
if (requestForm) {
  const field = requestForm.elements.namedItem("toy");
  const status = requestForm.querySelector("[data-request-status]");
  const contactMethod = requestForm.elements.namedItem("contactMethod");
  const email = requestForm.elements.namedItem("email");
  const phone = requestForm.elements.namedItem("phone");

  function updateContactFields() {
    const usePhone = contactMethod.value === "phone";
    email.closest("label").style.display = usePhone ? "none" : "";
    email.disabled = usePhone;
    email.required = !usePhone;
    phone.closest("label").style.display = usePhone ? "" : "none";
    phone.disabled = !usePhone;
    phone.required = usePhone;
    phone.setCustomValidity("");
  }

  contactMethod.addEventListener("change", updateContactFields);
  phone.addEventListener("input", () => phone.setCustomValidity(""));
  updateContactFields();
  const names = { bulochka: "Колобок", domovenok: "Домовёнок Кузя" };
  const requestedToy = new URLSearchParams(window.location.search).get("toy");
  if (Object.hasOwn(names, requestedToy)) field.value = requestedToy;
  document.querySelectorAll("[data-select-toy]").forEach((link) => {
    link.addEventListener("click", () => {
      field.value = link.dataset.selectToy;
      if (!busy) requestId = undefined;
      status.textContent = "";
    });
  });

  const button = requestForm.querySelector('button[type="submit"]');
  button.disabled = false;
  let requestId;
  let busy = false;

  requestForm.addEventListener("input", () => {
    if (!busy) requestId = undefined;
  });
  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!window.isSecureContext) {
      status.textContent = "Откройте страницу по HTTPS, чтобы отправить заявку.";
      return;
    }
    const data = new FormData(requestForm);
    if (!Object.hasOwn(names, data.get("toy"))) return;
    requestId ??= crypto.randomUUID();
    data.set("requestId", requestId);
    busy = true;
    button.disabled = true;
    status.textContent = "Отправляем заявку…";
    try {
      const response = await fetch(requestForm.action, {
        method: "POST",
        body: data,
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        status.textContent = result.message || "Заявка пока не сохранена. Попробуйте ещё раз.";
        return;
      }
      requestForm.reset();
      requestId = undefined;
      updateContactFields();
      status.textContent = result.message;
    } catch {
      status.textContent = "Не удалось подтвердить отправку. Попробуйте ещё раз.";
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
}

document.querySelectorAll("[data-toy-footage]").forEach((section) => {
  section.addEventListener("toggle", () => {
    if (!section.open) section.querySelector("video").pause();
  });
});

const scenes = document.querySelector("[data-scenes]");
if (scenes) {
  const track = scenes.querySelector(".scene-list");
  const previous = scenes.querySelector("[data-scenes-prev]");
  const next = scenes.querySelector("[data-scenes-next]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function updateSceneButtons() {
    previous.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
  }

  function moveScene(direction) {
    const step = track.children[1].offsetLeft - track.children[0].offsetLeft;
    track.scrollBy({left: step * direction, behavior: reducedMotion.matches ? "instant" : "smooth"});
  }

  previous.addEventListener("click", () => moveScene(-1));
  next.addEventListener("click", () => moveScene(1));
  track.addEventListener("scroll", updateSceneButtons, {passive: true});
  window.addEventListener("resize", updateSceneButtons);
  updateSceneButtons();
}
