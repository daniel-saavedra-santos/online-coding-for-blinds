// Elementos
const modal = document.getElementById("configModal");
const openBtn = document.getElementById("openConfig");
const closeBtn = document.querySelector(".close");
const saveBtn = document.getElementById("saveConfig");
const toast = document.getElementById("toast");

const transcriptionSelect = document.getElementById("transcriptionModel");
const translationSelect = document.getElementById("translationModel");
const assistantSelect = document.getElementById("assistantModel");
const constructorSelect = document.getElementById("constructorModel");

const previewTranscription = document.getElementById("previewTranscription");
const previewTranslation = document.getElementById("previewTranslation");
const previewAssistant = document.getElementById("previewAssistant");
const previewConstructor = document.getElementById("previewConstructor");

// Função para atualizar previews de forma segura
function updatePreviews() {
  if (transcriptionSelect.selectedIndex >= 0) {
    previewTranscription.textContent = `Atualmente: ${transcriptionSelect.options[transcriptionSelect.selectedIndex].text}`;
  }
  if (translationSelect.selectedIndex >= 0) {
    previewTranslation.textContent = `Atualmente: ${translationSelect.options[translationSelect.selectedIndex].text}`;
  }
  if (assistantSelect.selectedIndex >= 0) {
    previewAssistant.textContent = `Atualmente: ${assistantSelect.options[assistantSelect.selectedIndex].text}`;
  }
  if (constructorSelect.selectedIndex >= 0) {
    previewConstructor.textContent = `Atualmente: ${constructorSelect.options[constructorSelect.selectedIndex].text}`;
  }
}

// Abrir modal com valores salvos e garantir selects válidos
openBtn.addEventListener("click", () => {
  transcriptionSelect.value = localStorage.getItem("transcriptionModel") || "whisper-local";
  if (transcriptionSelect.selectedIndex === -1) transcriptionSelect.selectedIndex = 0;

  translationSelect.value = localStorage.getItem("translationModel") || "gemini-latest";
  if (translationSelect.selectedIndex === -1) translationSelect.selectedIndex = 0;

  assistantSelect.value = localStorage.getItem("assistantModel") || "gemini-latest";
  if (assistantSelect.selectedIndex === -1) assistantSelect.selectedIndex = 0;

  constructorSelect.value = localStorage.getItem("constructorModel") || "gemini-latest";
  if (constructorSelect.selectedIndex === -1) constructorSelect.selectedIndex = 0;

  updatePreviews();
  modal.classList.add("show");
});

// Atualizar preview ao mudar selects
transcriptionSelect.addEventListener("change", updatePreviews);
translationSelect.addEventListener("change", updatePreviews);
assistantSelect.addEventListener("change", updatePreviews);
constructorSelect.addEventListener("change", updatePreviews);

// Fechar modal
closeBtn.addEventListener("click", () => modal.classList.remove("show"));
window.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("show"); });

// Salvar configurações e mostrar toast
saveBtn.addEventListener("click", () => {
  localStorage.setItem("transcriptionModel", transcriptionSelect.value);
  localStorage.setItem("translationModel", translationSelect.value);
  localStorage.setItem("assistantModel", assistantSelect.value);
  localStorage.setItem("constructorModel", constructorSelect.value);

  modal.classList.remove("show");

  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
});
