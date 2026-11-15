"use strict";

const hero = document.querySelector("[data-hero]");
const mascot = document.querySelector("[data-mascot]");

if (hero && mascot) {
  const greeting = document.querySelector("[data-greeting]");
  const canTrack = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
  const messages = ["Привет! Я Домовёнок.", "Есть минутка для сказки?", "Как здорово, что ты заглянул!"];
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
    gallery.setAttribute("aria-label", view === "front" ? "Булочка, вид спереди" : "Булочка, вид сбоку");
    choices.forEach((button) => button.setAttribute("aria-pressed", String(button === choice)));
  }));
}
