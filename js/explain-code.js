const runButton = document.getElementById("runBtn");

function processarRespostaCompleta(textoBruto) {
  const fragmento = document.createDocumentFragment();
  
  // Essa variável vai acumular o texto perfeito para o robô ler
  let textoParaAudio = ""; 

  const regex = /```(?:[a-z]*\n)?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  // Função para limpar o código visualmente
  const pentearCodigo = (cod) => {
    return cod
      .replace(/;/g, ";\n")
      .replace(/{/g, "{\n  ")
      .replace(/}/g, "\n}\n")
      .replace(/\s*\/\//g, "\n//")
      .trim();
  };

  while ((match = regex.exec(textoBruto)) !== null) {
    // --- 1. TEXTO ---
    const textoAntes = textoBruto.slice(lastIndex, match.index).replace(/(\*\*|`)/g, "").trim();
    if (textoAntes) {
      // Visual
      const p = document.createElement("p");
      p.className = "resposta-texto";
      p.innerText = textoAntes;
      fragmento.appendChild(p);

      // Audio (adicionamos um ponto para forçar pausa)
      textoParaAudio += textoAntes + ". ";
    }

    // --- 2. CÓDIGO ---
    const codigoLimpo = pentearCodigo(match[1]);
    
    // Visual (Mantemos igual ao anterior)
    const pre = document.createElement("pre");
    pre.className = "resposta-codigo";
    
    // Note: Não precisamos mais dos spans .sr-only aqui no visual, 
    // pois vamos mandar o texto direto pro audio.
    const code = document.createElement("code");
    code.innerText = codigoLimpo;
    pre.appendChild(code);
    fragmento.appendChild(pre);

    // Audio (Aqui está o segredo!)
    // Adicionamos avisos verbais explícitos na string de áudio
    // E trocamos símbolos que o robô ignora por pausas
    let codigoParaLer = codigoLimpo
        .replace(/{/g, " abre chaves ")
        .replace(/}/g, " fecha chaves ");

    textoParaAudio += " Início do código sugerido. " + codigoParaLer + ". Fim do código sugerido. ";

    lastIndex = regex.lastIndex;
  }

  // --- 3. TEXTO FINAL ---
  if (lastIndex < textoBruto.length) {
    const textoFinal = textoBruto.slice(lastIndex).replace(/(\*\*|`)/g, "").trim();
    if (textoFinal) {
      const p = document.createElement("p");
      p.className = "resposta-texto";
      p.innerText = textoFinal;
      fragmento.appendChild(p);
      
      textoParaAudio += textoFinal;
    }
  }

  // Retornamos um objeto com as duas coisas
  return { 
    dom: fragmento, 
    audio: textoParaAudio 
  };
}

const runCode = async function () {
  const egua = new Egua.Egua();
  let code = sessionStorage.getItem('codigoEditorEgua');

  // Acessar diretamente o Lexer
  const lexer = new Egua.Lexer(code, egua);
  const tokens = lexer.scan();

  // Acessar diretamente o Parser
  const parser = new Egua.Parser(tokens, egua);
  const ast = parser.parse();

  let errorMessage = null;
  try {
    egua.runBlock(code);
  } catch (err) {
    errorMessage = err.message || String(err);
  }

  // Seleciona a div (por id, classe etc.)
  const div = document.querySelector('#output');

  // Pega todos os <p> dentro da div
  const paragrafos = div.querySelectorAll('p');

  // Extrai o texto de todos e junta
  const textoCompleto = Array.from(paragrafos)
    .map(p => p.textContent.trim())
    .join(' ');

  sendDataToExplain(code, tokens, ast, textoCompleto);
};

// =============================
// XHR Helper
// =============================
function getXmlHttpRequestObjectExplain() {
  return new XMLHttpRequest();
}

function sendDataCallbackExplain(xhr) {
  if (xhr.readyState === 4) {
    if (xhr.status === 201 || xhr.status === 200) {
      
      clearOutput(); 

      const containerResposta = document.createElement("div");
      containerResposta.classList.add("output", "assistente");
      
      // Chamamos a nova função
      const resultado = processarRespostaCompleta(xhr.responseText);
      
      // 1. Adiciona o Visual na tela
      containerResposta.appendChild(resultado.dom);
      outputDiv.appendChild(containerResposta);

      // 2. Manda o SpeechSynthesis ler a STRING limpa
      feedbackAudio(resultado.audio);

    } else {
      console.error("Erro na requisição:", xhr.status, xhr.responseText);
    }
  }
}

// =============================
// Recupera modelo selecionado
// =============================
function getSelectedAssitantModel() {
  const select = document.getElementById("assistantModel");
  return select.value;
}

// =============================
// Função principal de envio de dados
// =============================
const assistantURLS = {
  "gemini-latest": "http://localhost:5000/",
  "gpt-4o": "http://localhost:5100/",
  "phi-2": "http://localhost:5200/",
  "llama-3": "http://localhost:5300/",
  "qwen2": "http://localhost:5400/"
};

async function sendDataToExplain(code, tokens, ast, output) { // <-- 1. Adicionados 'tokens' e 'ast'

  const selected_assistantModel = getSelectedAssitantModel();

  // Monta o JSON com código, tokens, ast e saída
  const payload = {
    codigo: code,
    tokens: tokens, // <-- 2. Chave 'tokens' adicionada
    ast: ast,       // <-- 3. Chave 'ast' adicionada
    output: output
  };

  // O restante da função permanece exatamente o mesmo
  const xhr = getXmlHttpRequestObjectExplain();
  xhr.onreadystatechange = () => sendDataCallbackExplain(xhr);
  xhr.open("POST", assistantURLS[selected_assistantModel], true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.send(JSON.stringify(payload));
}

runButton.addEventListener("click", function () {
  clearOutput();
  runCode();
});