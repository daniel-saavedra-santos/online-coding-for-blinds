const outputDiv = document.getElementById("output");
const demoSelector = document.getElementById("demoSelector");

window.onload = function() {
    // Função para verificar e configurar cada campo
    function checkAndSet(key, element) {
        // Verifica se NÃO tem nada salvo no localStorage
        if (!localStorage.getItem(key)) {
            // Se estiver vazio, salva o valor padrão que veio do HTML
            localStorage.setItem(key, element.value);
        } else {
            // (Opcional, mas recomendado) Se já tiver algo salvo, atualiza o select visualmente
            element.value = localStorage.getItem(key);
        }
    }

    checkAndSet("transcriptionModel", transcriptionSelect);
    checkAndSet("translationModel", translationSelect);
    checkAndSet("assistantModel", assistantSelect);
    checkAndSet("constructorModel", constructorSelect);
};

document.addEventListener('keydown', function(event) {
    let tecla = event.key;

    // Dicionário completo ABNT2
    const dicionarioABNT2 = {
        // --- Pontuação e Gramática ---
        ".": "Ponto",
        ",": "Vírgula",
        ";": "Ponto e vírgula",
        ":": "Dois pontos",
        "!": "Exclamação",
        "?": "Interrogação",
        "'": "Aspas simples",
        "\"": "Aspas duplas",
        "`": "Crase",
        "´": "Acento agudo",
        "~": "Til",
        "^": "Circunflexo",
        "¨": "Trema",
        "ç": "Cê-dilha",
        "Ç": "Cê-dilha",
        "ª": "A o sobrescrito", // Indicador ordinal feminino
        "º": "Grau",             // Ou indicador ordinal masculino
        "°": "Grau",

        // --- Símbolos Matemáticos e Lógicos ---
        "+": "Mais",
        "-": "Hífen", // Ou Menos
        "*": "Asterisco",
        "/": "Barra",
        "=": "Igual",
        "%": "Porcentagem",
        "$": "Cifrão",
        "<": "Menor que",
        ">": "Maior que",
        "|": "Barra vertical",
        "\\": "Barra invertida",
        "_": "Underline", // Ou Sublinhado
        "&": "E comercial",
        "@": "Arroba",
        "#": "Cerquilha", // Ou Hashtag

        // --- Agrupadores ---
        "(": "Abre parênteses",
        ")": "Fecha parênteses",
        "[": "Abre colchetes",
        "]": "Fecha colchetes",
        "{": "Abre chaves",
        "}": "Fecha chaves",

        // --- Teclas de Controle e Navegação ---
        " ": "Espaço",
        "Enter": "Entér",
        "Backspace": "Apagar",
        "Tab": "Tabulação",
        "CapsLock": "Maiúsculas",
        "Shift": "Xífti",
        "Control": "Control",
        "Alt": "Alt",
        "AltGraph": "Alt Gr",
        "Escape": "Esc",
        "Delete": "Deletar",
        "Insert": "Inserir",
        "Home": "Início",
        "End": "Fim",
        "PageUp": "Página acima",
        "PageDown": "Página abaixo",
        "ArrowUp": "Seta para cima",
        "ArrowDown": "Seta para baixo",
        "ArrowLeft": "Seta para esquerda",
        "ArrowRight": "Seta para direita",
        "NumLock": "Num Lock",
        "PrintScreen": "Print Screen",
        "ScrollLock": "Scroll Lock",
        "Pause": "Pause",
        "Meta": "Tecla Windows", // Ou Command no Mac
        "ContextMenu": "Menu de contexto",

        // --- Tratamento de Teclas "Mortas" (Acentos soltos) ---
        "Dead": "Acento",
        "Process": "Acento"
    };

    // 1. Verifica no dicionário
    if (dicionarioABNT2[tecla]) {
        tecla = dicionarioABNT2[tecla];
    } else {
        // Se for uma letra maiúscula solta (ex: "A"), leia normal.
        // Se for um caractere estranho não mapeado, ele tenta ler.
        if (tecla.length === 1) {
             // Opcional: Transforma "a" em "Letra a" se quiser ser muito específico
             // tecla = tecla; 
        }
    }

    // 2. Configura a voz
    const fala = new SpeechSynthesisUtterance(tecla);
    fala.lang = 'pt-BR'; 
    fala.rate = 1.1; // Velocidade um pouco mais ágil

    // 3. Executa
    window.speechSynthesis.cancel(); // Para o som anterior imediatamente
    window.speechSynthesis.speak(fala);
});

String.prototype.capitalize = function() {
  return this.charAt(0).toUpperCase() + this.slice(1);
};

function getQueryVariable(variable) {
  const query = window.location.search.substring(1);
  const vars = query.split("&");
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split("=");
    if (decodeURIComponent(pair[0]) === variable) {
      return decodeURIComponent(pair[1]);
    }
  }
}

console.log = console.error = function(msg) {
  const p = document.createElement("p");
  p.textContent = msg;
  p.classList = " output";
  outputDiv.appendChild(p);
};

const clearOutput = function() {
  outputDiv.innerHTML = "";
};

const editor = new CodeFlask("#editor", {
  language: 'js',
  lineNumbers: true,
  defaultTheme: false
});

clearOutput();

// Não está funcionando
const demoKeys = Object.keys(demos);
function loadDemo(name) {
  addCodeToBox(demos[name]);
  //editor.updateCode(demos[name]);
}

demoKeys.forEach((demo, index) => {
  const option = document.createElement("option");
  if (index === 0) {
    option.disabled = true;
    option.selected = true;
    option.hidden = true;
  }

  option.textContent = demo.capitalize();
  option.value = demo;
  demoSelector.appendChild(option);
});

let queryCode = getQueryVariable("code");
if (queryCode !== undefined) {
  editor.updateCode(decodeURI(queryCode));
  demoSelector.value = "custom";
} else {
  loadDemo(demoKeys[0]);
}

demoSelector.addEventListener("change", function() {
  loadDemo(demoSelector.value);
});