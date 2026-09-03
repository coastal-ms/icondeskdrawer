const scale = document.querySelector("#scale");
const value = document.querySelector("#scale-value");

function display(percent) {
  const normalized = String(percent);
  scale.value = normalized;
  value.textContent = `${normalized}%`;
}

scale.addEventListener("input", () => {
  display(scale.value);
  window.scaleApi.set(Number(scale.value)).catch(console.error);
});

scale.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.scaleApi.close();
});

window.scaleApi.onChanged(display);
window.scaleApi.get().then(display);
