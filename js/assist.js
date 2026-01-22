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
/*
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
*/

document.addEventListener('keydown', (event) => {
    const sliderRate = document.getElementById('slider-velocidade');
    const sliderPitch = document.getElementById('slider-tom');

    const isControlKey = event.altKey || event.metaKey;

    if (isControlKey) {
        const step = 0.1;

        // --- Ajuste de VELOCIDADE ---
        if (sliderRate && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
            let currentValue = parseFloat(sliderRate.value);
            let newValue = currentValue;

            if (event.key === 'ArrowRight') {
                newValue = Math.min(2.0, currentValue + step);
            } else if (event.key === 'ArrowLeft') {
                newValue = Math.max(0.5, currentValue - step);
            }

            // Arredonda para 1 casa decimal
            newValue = parseFloat(newValue.toFixed(1));

            if (newValue !== currentValue) {
                sliderRate.value = newValue;
                event.preventDefault();

                // Chama sua função existente convertendo para %
                feedbackAudio(`Nova velocidade de voz definida para ${Math.round(newValue * 100)}%`);
            }
        }

        // --- Ajuste de TOM ---
        if (sliderPitch && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            let currentPitch = parseFloat(sliderPitch.value);
            let newPitch = currentPitch;

            if (event.key === 'ArrowUp') {
                newPitch = Math.min(2.0, currentPitch + step);
            } else if (event.key === 'ArrowDown') {
                newPitch = Math.max(0.0, currentPitch - step);
            }

            // Arredonda para 1 casa decimal
            newPitch = parseFloat(newPitch.toFixed(1));

            if (newPitch !== currentPitch) {
                sliderPitch.value = newPitch;
                event.preventDefault();

                // Chama sua função existente convertendo para %
                feedbackAudio(`Novo tom de voz definido para ${Math.round(newPitch * 100)}%`);
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
        Memorize agora, em um primeiro momento, esses cinco atalhos a seguir:
        CONTROL mais letra H: Acessar lista de atalhos do editor do código, para leitura de linhas, palavras, caracteres, e das configurações do assistente.
        Tecla F1: Lista de atalhos dos assistentes disponíveis para criação de código.
        ESC: interromper fala do assistente.
        Control mais ESC: abortar operação do assistente.
        Tecla Shift mais TAB: retomar a navegação no assitente através da tecla TAB.
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

// ================================
// Ajuda falada
// ================================

// Função que lista todos os atalhos disponíveis
function ajudaFalada() {
    const atalhos = `
    Aqui está a lista de atalhos do editor de código:
        Shift mais seta para esquerda ou para direita: ler caracter anterior ou o próximo.
        Shift mais seta para cima ou para baixo: ler linha anterior ou a próxima.
        Control mais seta para esquerda ou para direita: ler palavra anterior ou a próxima.
        Control L: ler todo o código atual.
        F7: ir para a linha (por voz).
        Control G: ir para a linha (via teclado).
        F8 ou Shift R: ler saída do console.
        F10 ou Control R: limpar toda área de código.
        F11 ou Control S: exportar código para um arquivo.
        F12 ou Alt C: focar o teclado de volta no editor de código.
        ALT mais seta para esquerda ou para direita: ajuste da velocidade da voz.
        ALT mais seta para cima ou para baixo: ajuste do tom da voz (mais grave ou mais agudo).
        Tecla Shift mais TAB: retomar a navegação no assitente através da tecla TAB.
        Control H: ouvir novamente esta lista de ajuda.
      `;
    feedbackAudio(atalhos); // fala os atalhos
}

function ajudaFalada2() {
    const atalhos = `
    Aqui está a lista de atalhos dos assistentes de criação de código:
        Control mais espaço: abrir o menu principal de opções do assistente (por voz).
        Tecla F9 ou Control mais letra K: habilitar ou desabilitar microfone para entrada de comandos personalizados para criação de código.
        Control mais espaço: abrir o menu principal de opções de assistente (por voz).
        F2: Iniciar assistente para criar uma variável (por voz).
        F3: Iniciar assistente para realizar operações matemáticas ou lógicas (por voz).
        F4: Iniciar assistente para criar estruturas condicionais SE ENTÃO (por voz).
        F5: Iniciar assistente para imprimir valores na tela de variáveis ou mensagem de texto (por voz).
        F6 ou Shift E: executar código.
        ESC: interromper fala do assistente.
        Control mais ESC: abortar operação do assistente.
        F1: ouvir novamente esta lista de ajuda.
      `;
    feedbackAudio(atalhos); // fala os atalhos
}

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

    if (event.key === 'F1') {
        event.preventDefault();
        ajudaFalada2();
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        ajudaFalada();
    }
});

// ================================
// Listen Demo
// ================================

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
    feedbackAudio(currentText);
});

// Leitura em voz alta ao trocar de demo
demoSelector.addEventListener("change", function () {
    // Atualiza o editor com o demo escolhido
    loadDemo(demoSelector.value);

    // Pega o texto do option selecionado
    const selectedText = demoSelector.options[demoSelector.selectedIndex].text;

    feedbackAudio("Exemplo selecionado: " + selectedText);
});

// LER O SELETOR DE VOZ

seletorVoz.addEventListener("focus", function () {
    const currentText = seletorVoz.options[seletorVoz.selectedIndex].text;
    feedbackAudio(currentText);
});

// Leitura em voz alta ao trocar de demo
seletorVoz.addEventListener("change", function () {

    // Pega o texto do option selecionado
    const selectedText = seletorVoz.options[seletorVoz.selectedIndex].text;

    feedbackAudio("Voz selecionada: " + selectedText);
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

document.addEventListener('keydown', (event) => {
    // Verifica se apertou Ctrl + TAB (pode mudar 'j' para outra letra)
    if (event.shiftKey && event.key === 'Tab') {
        
        const botaoAlvo = document.getElementById('var');

        if (botaoAlvo) {
            event.preventDefault(); // Evita que o navegador faça outra coisa com o atalho
            
            // 1. Aplica o foco visual (o navegador seleciona o botão)
            botaoAlvo.focus(); 

            // 2. Avisa por áudio (opcional, já que leitores de tela leem o foco automaticamente)
            feedbackAudio("Você voltou à navegação via teclado através da tecla TAB. Agora, o botão selecionado é 'Criar Variável (por voz)'");
        }
    }
});