let vozesPtBr = [];
const seletorVoz = document.getElementById('seletor-voz');

function carregarVozes() {
    vozesPtBr = window.speechSynthesis.getVoices().filter(voice => voice.lang.includes('pt') || voice.lang.includes('PT'));
    seletorVoz.innerHTML = '';

    if (vozesPtBr.length === 0) {
        seletorVoz.innerHTML = '<option>Nenhuma voz PT-BR</option>';
        return;
    }

    vozesPtBr.forEach((voice, index) => {
        const option = document.createElement('option');
        option.textContent = `${voice.name}`;
        option.setAttribute('data-index', index);
        // Pré-seleciona a primeira voz alternativa ou a segunda da lista
        if (voice.default === false || index === 1) {
            option.selected = true;
        }
        seletorVoz.appendChild(option);
    });
}

function feedbackAudio(texto) {
    if (!texto) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(texto);

    utterance.lang = "pt-BR";

    // 1. Lê os valores dos Sliders no Toolbar
    const sliderRate = document.getElementById('slider-velocidade');
    const sliderPitch = document.getElementById('slider-tom');

    utterance.rate = parseFloat(sliderRate.value) || 1.1;
    utterance.pitch = parseFloat(sliderPitch.value) || 1.0;

    // 2. Seleciona a voz baseada no menu suspenso
    const selectedIndex = seletorVoz.options[seletorVoz.selectedIndex].getAttribute('data-index');
    if (selectedIndex !== null && vozesPtBr[selectedIndex]) {
        utterance.voice = vozesPtBr[selectedIndex];
    }

    // 3. Adiciona evento onend (opcional, mas bom para limpeza)
    utterance.onend = () => {
        // Lógica de finalização aqui, se necessário
    };

    window.speechSynthesis.speak(utterance);
}

document.addEventListener('keydown', (event) => {
    const sliderRate = document.getElementById('slider-velocidade');
    const sliderPitch = document.getElementById('slider-tom');

    const isControlKey = event.altKey || event.metaKey;

    if (isControlKey && sliderRate) {
        let currentValue = parseFloat(sliderRate.value);
        let newValue = currentValue;
        const step = 0.1;

        // Ajuste de VELOCIDADE (Ctrl/Cmd + Seta Direita/Esquerda)
        if (event.key === 'ArrowRight') {
            newValue = Math.min(2.0, currentValue + step).toFixed(1);
            event.preventDefault();
        } else if (event.key === 'ArrowLeft') {
            newValue = Math.max(0.5, currentValue - step).toFixed(1);
            event.preventDefault();
        }

        if (newValue !== currentValue.toFixed(1)) {
            sliderRate.value = newValue;
        }

        // Ajuste de TOM (Opcional: Ctrl/Cmd + Seta Acima/Abaixo)
        if (sliderPitch) {
            let currentPitch = parseFloat(sliderPitch.value);
            let newPitch = currentPitch;

            if (event.key === 'ArrowUp') {
                newPitch = Math.min(2.0, currentPitch + step).toFixed(1);
                event.preventDefault();
            } else if (event.key === 'ArrowDown') {
                newPitch = Math.max(0.0, currentPitch - step).toFixed(1);
                event.preventDefault();
            }

            if (newPitch !== currentPitch.toFixed(1)) {
                sliderPitch.value = newPitch;
            }
        }
    }
});

// Garante que as vozes sejam carregadas (pode ser necessário recarregar em alguns navegadores)
carregarVozes();
window.speechSynthesis.onvoiceschanged = carregarVozes;

// Esta variável irá guardar a função 'resolve' da Promise de fala ativa
let resolveActiveSpeechPromise = null;

// Seleciona os elementos do DOM
const modalOverlay = document.getElementById('modal-overlay');
const iniciarBtn = document.getElementById('iniciar-assistente');

const synth = window.speechSynthesis;
let vozes = [];

// Função para carregar as vozes disponíveis no navegador
/*
function carregarVozes() {
    vozes = synth.getVoices();
}
carregarVozes();
if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = carregarVozes;
}
*/

// A função principal que é chamada após a interação do usuário
function iniciarIntroducao() {
    // 1. Prepara a mensagem de boas-vindas para ser falada
    const mensagem = `
        Bem-vindo ao assistente de código Égua. Para pular esta introdução, pressione a tecla Escape.
        Aqui está a lista de principais atalhos que você pode utilizar:
        F1 ou Control H: ouvir novamente esta lista de ajuda.
        ESC: interromper fala do assistente.
        Control mais ESC: abortar assistente.
        ALT mais seta para esquerda ou para direita: ajuste da velocidade da voz.
        ALT mais seta para cima ou para baixo: ajuste do tom da voz (mais grave ou mais agudo).
        Shift mais seta para esquerda ou para direita: ler caracter anterior ou o próximo.
        Shift mais seta para cima ou para baixo: ler linha anterior ou a próxima.
        Control mais seta para esquerda ou para direita: ler palavra anterior ou a próxima.
        Control mais espaço: abrir o menu principal de opções (por voz).
    `;
    const utterance = new SpeechSynthesisUtterance(mensagem);

    // Tenta encontrar e usar uma voz em português do Brasil
    const vozBrasileira = vozes.find(voz => voz.lang === 'pt-BR');
    if (vozBrasileira) {
        utterance.voice = vozBrasileira;
    }
    utterance.rate = 0.9; // Um pouco mais devagar para ser mais claro

    // 2. Manda o navegador falar
    synth.speak(utterance);

    // 3. Esconde o modal e o overlay
    modalOverlay.classList.add('hidden');
}

// Evento de clique no botão
iniciarBtn.addEventListener('click', iniciarIntroducao);

// Evento de teclado para a tecla "Enter"
document.addEventListener('keydown', function (event) {
    // Verifica se o modal está visível e se a tecla pressionada foi "Enter"
    if (!modalOverlay.classList.contains('hidden') && event.key === 'Enter') {
        iniciarIntroducao();
    }
});

// ================================
// Funções auxiliares
// ================================

/**
 * Toca um arquivo de som.
 * @param {string} url - O caminho para o arquivo de áudio.
 */
function tocarSom(url) {
    return new Promise((resolve, reject) => {
        const audio = new Audio(url);
        audio.onended = resolve; // Resolve a promise quando o som terminar
        audio.onerror = reject; // Rejeita em caso de erro ao carregar/tocar
        audio.play();
    });
}

// Fala um texto em voz alta usando Web Speech API
/*
function feedbackAudio(texto) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = "pt-BR"; // define idioma português Brasil
    speechSynthesis.speak(utterance);
}
*/

// ================================
// Ajuda falada
// ================================

// Função que lista todos os atalhos disponíveis
function ajudaFalada() {
    const atalhos = `
        Lista de atalhos disponíveis:
        ESC: interromper fala do assistente.
        Control mais ESC: abortar assistente.
        ALT mais seta para esquerda ou para direita: ajuste da velocidade da voz.
        ALT mais seta para cima ou para baixo: ajuste do tom da voz (mais grave ou mais agudo).
        Shift mais seta para esquerda ou para direita: ler caracter anterior ou o próximo.
        Shift mais seta para cima ou para baixo: ler linha anterior ou a próxima.
        Control mais seta para esquerda ou para direita: ler palavra anterior ou a próxima.
        Control mais espaço: abrir o menu principal de opções (por voz).
        Control L: ler todo o código atual.
        F1 ou Control H: ouvir novamente esta lista de ajuda.
        F2: assistente para escrever uma variável ou texto no console (por voz).
        F3: assistente para criar uma variável (por voz).
        F4: assistente para realizar operações matemáticas ou lógicas (por voz).
        F5: assistente para criar estruturas condicionais SE ENTÃO (por voz).
        F6 ou Shift E: executar código.
        F7: ir para a linha (por voz).
        Control G: ir para a linha (via teclado).
        F8 ou Shift R: ler saída do console.
        F9 ou Control K: habilitar ou desabilitar microfone para entrada de comandos de código.
        F10 ou Control R: limpar toda área de código.
        F11 ou Control S: exportar código para um arquivo.
        F12 ou Alt C: focar no editor de código.
      `;
    feedbackAudio(atalhos); // fala os atalhos
    // console.log(atalhos);   // também mostra no console
}

// 3. Função para parar a fala
/*
function pararFala() {
    if (speechSynthesis.speaking) {
        //console.log("Interrompendo a fala...");
        speechSynthesis.cancel();

    }
}
*/

function pararFala() {
    if (speechSynthesis.speaking) {
        //console.log("Interrompendo a fala...");
        speechSynthesis.cancel();
    }

    // A MÁGICA ACONTECE AQUI:
    // Se existe uma promise de fala esperando para ser resolvida, chame seu resolvedor.
    if (resolveActiveSpeechPromise) {
        //console.log("Resolvendo a Promise de fala manualmente...");
        resolveActiveSpeechPromise();
    }
}

// ================================
// Atalhos de teclado
// ================================

document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        feedbackAudio(sessionStorage.getItem('codigoEditorEgua') || "Não há código para ler.");
    }

    if (event.key === 'F1' || (event.ctrlKey && event.key.toLowerCase() === 'h')) {
        event.preventDefault();
        ajudaFalada();
    }
});

// ================================
// Listen Demo
// ================================

/*
// Seleciona todos os botões da página
const buttons = document.querySelectorAll("button");

// Para cada botão, adiciona um "escutador de evento" de foco
buttons.forEach(button => {
    button.addEventListener("focus", () => {
        // Quando o botão recebe foco pelo teclado, fala o conteúdo dele
        feedbackAudio(button.innerText);
    });
});
*/

// Seleciona todos os botões da página
const buttons = document.querySelectorAll("button");

// Para cada botão, adiciona um "escutador de evento" de foco
buttons.forEach(button => {
    button.addEventListener("focus", () => {
        // 1. Tenta pegar o texto do aria-label
        // 2. O operador "||" (OU) serve como um fallback: 
        //    se o primeiro for vazio/nulo, ele usa o segundo (innerText)
        const textoParaLer = button.getAttribute("aria-label") || button.innerText;

        feedbackAudio(textoParaLer);
    });
});

// Falar quando usuário NAVEGAR entre opções
demoSelector.addEventListener("focus", function () {
    const currentText = demoSelector.options[demoSelector.selectedIndex].text;

    //const utterance = new SpeechSynthesisUtterance("Opção: " + currentText);
    //utterance.lang = "pt-BR";
    //speechSynthesis.speak(utterance);
    feedbackAudio("Opção: " + currentText);
});

// Leitura em voz alta ao trocar de demo
demoSelector.addEventListener("change", function () {
    // Atualiza o editor com o demo escolhido
    loadDemo(demoSelector.value);

    // Pega o texto do option selecionado
    const selectedText = demoSelector.options[demoSelector.selectedIndex].text;

    // Fala em voz alta
    //const utterance = new SpeechSynthesisUtterance("Exemplo selecionado: " + selectedText);
    //utterance.lang = "pt-BR";
    //speechSynthesis.cancel();
    //speechSynthesis.speak(utterance);
    feedbackAudio("Exemplo selecionado: " + selectedText);
});

// ================================
// Listeners de Eventos
// ================================

// Gatilho 1: Pressionar a tecla ESC
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        pararFala();
    }
});