// VARIÁVEL GLOBAL DE CONTROLE
let interromperOuvir = false;

// Função para setar o flag de interrupção
function setarInterrupcao(status) {
    interromperOuvir = status;
    if (status) {
        //console.log("Interrupção via teclado solicitada.");
        feedbackAudio("Comando de interrupção do assistente recebido.");
        // Opcional: Aqui você cancelaria a API de reconhecimento de voz se estivesse ativa.
        // window.speechRecognition.stop(); 
    }
}

document.addEventListener('keydown', (event) => {
    // Verifica se Ctrl (ou Cmd no Mac) está pressionado E se a tecla é 'Escape'
    if ((event.ctrlKey || event.metaKey) && event.key === 'Escape') {
        // Impede o comportamento padrão do navegador/OS para essa combinação
        event.preventDefault(); 
        
        // Define o flag de interrupção como true
        setarInterrupcao(true);
    }
});

// =============================
// Função principal de envio de dados
// =============================
const constructorURLs = {
  "gemini-latest": "http://localhost:7000/gerar-codigo",
  "gpt-4o": "http://localhost:7100/gerar-codigo",
  "phi-2": "http://localhost:7200/gerar-codigo",
  "llama-3": "http://localhost:7300/gerar-codigo",
  "qwen2": "http://localhost:7400/gerar-codigo",
};

// A biblioteca se anexa ao 'window' como 'window.wordsToNumbers'.
// O objeto que ela cria tem uma função dentro dele, também chamada 'wordsToNumbers'.
// Para facilitar, podemos "desestruturar" essa função:
const { wordsToNumbers } = window.wordsToNumbers;

async function textoParaNumero(textoExtenso) {
  const urlAPI = 'http://localhost:5050/converter-extenso';

  try {
    const response = await fetch(urlAPI, {
      method: 'POST',
      headers: {
        // É crucial para o Flask entender o JSON
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        texto: textoExtenso
      })
    });

    if (!response.ok) {
      // Lança erro se o status for 4xx ou 5xx
      throw new Error(`Erro HTTP! Status: ${response.status}`);
    }

    const data = await response.json();

    // O resultado final virá do campo 'translated_en'
    return wordsToNumbers(data.translated_en, { fuzzy: true });

  } catch (error) {
    console.error("Falha na comunicação com o servidor Python:", error);
    return null;
  }
}

// =============================
// Recupera construtor selecionado
// =============================
function getSelectedConstructor() {
  const select = document.getElementById("constructorModel");
  return select.value;
}

// Calcula a distância de Levenshtein entre duas strings
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;

  // Criar matriz (m+1) x (n+1)
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  // Inicializar a primeira linha e coluna
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Preencher a matriz
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // remoção
        dp[i][j - 1] + 1,      // inserção
        dp[i - 1][j - 1] + custo // substituição
      );
    }
  }

  return dp[m][n];
}

// Vocabulário esperado
const vocab = ["variável", "simples", "texto", "ambos", "vetor",
  "numérica", "booleana", "números",
  "sim", "ok", "não", "string", "um", "uma", "dois", "duas",
  "três", "quatro", "cinco"];

const mapaOperadores = {
  // Operadores Matemáticos
  "mais": "+",
  "soma": "+",
  "adição": "+",
  "menos": "-",
  "subtração": "-",
  "vezes": "*",
  "multiplicado por": "*",
  "multiplicação": "*",
  "dividido por": "/",
  "divisão": "/",

  // Operadores Lógicos e de Comparação
  "maior que": ">",
  "menor que": "<",
  "igual a": "==",
  "igual": "==",
  "e": "e",
  "ou": "ou",
  "diferente de": "!=",
  "diferente": "!="
};

/**
 * Encontra o operador correspondente mais próximo para uma palavra falada.
 * @param {string} palavraFalada A palavra ou frase dita pelo usuário.
 * @returns {string|null} O símbolo do operador (ex: "+", "&&") ou null se nenhuma correspondência próxima for encontrada.
 */
function mapearOperador(palavraFalada) {
  // Distância máxima permitida. Se a melhor correspondência for maior que isso, consideramos que não houve match.
  const distanciaMaxima = 2;

  const chaves = Object.keys(mapaOperadores);
  let melhorChave = null;
  let menorDist = Infinity;

  // 1. Encontra a chave mais próxima no mapa
  for (const chave of chaves) {
    const dist = levenshtein(palavraFalada.toLowerCase(), chave.toLowerCase());

    if (dist < menorDist) {
      menorDist = dist;
      melhorChave = chave;
    }
  }

  // 2. Verifica se a melhor correspondência encontrada é "boa o suficiente"
  if (melhorChave && menorDist <= distanciaMaxima) {
    // Se for, retorna o símbolo do operador (o valor do mapa)
    return mapaOperadores[melhorChave];
  } else {
    // Se não for, retorna null
    return null;
  }
}

/**
 * Grava áudio do microfone por uma duração específica.
 * @param {number} duration - Duração da gravação em milissegundos.
 * @returns {Promise<Blob|null>} Uma Promise que resolve com o Blob de áudio ou null em caso de erro.
 */

async function gravarAudio(duration = 5000) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const audioChunks = [];

    mediaRecorder.ondataavailable = event => {
      audioChunks.push(event.data);
    };

    const stopped = new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        resolve(audioBlob);
      };
      mediaRecorder.onerror = event => reject(event.name);
    });

    mediaRecorder.start();
    setTimeout(() => {
      mediaRecorder.stop();
      // Para de usar o microfone para que o ícone de gravação suma
      stream.getTracks().forEach(track => track.stop());
    }, duration);

    return stopped;
  } catch (err) {
    console.error("Erro ao gravar áudio:", err);
    return null; // Retorna null se o usuário negar permissão ou ocorrer outro erro.
  }
}


/**
 * Envia o blob de áudio para o servidor para transcrição.
 * @param {Blob} audioBlob - O blob de áudio a ser transcrito.
 * @param {string} model - O nome do modelo a ser usado (ex: 'whisper-api').
 * @returns {Promise<string>} O texto transcrito.
 */

async function transcreverAudioExterno(audioBlob, model) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');
  formData.append('model', model);

  try {
    // IMPORTANTE: Substitua '/api/transcribe' pelo endpoint real do seu servidor
    const response = await fetch(transcribeURLS[model], {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Falha na resposta do servidor.');
    }

    // const data = await response.json();
    // return data.transcription || ""; // Assume que a API retorna { transcription: "texto" }

    const textoTranscrito = await response.text(); // Lê a resposta como texto puro
    return textoTranscrito; // Retorna diretamente a string

  } catch (err) {
    console.error("Erro ao transcrever áudio externamente:", err);
    return ""; // Retorna vazio em caso de erro
  }
}


async function perguntarComVoz(pergunta) {
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(pergunta);
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

  const somInicioGravacao = '../audio/start_record.wav';
  const somFimGravacao = '../audio/end_record.wav';

  try {
    // A Promise que pausa a execução
    await new Promise(resolve => {
      // a) Atribui a função resolve à nossa variável global
      resolveActiveSpeechPromise = resolve;

      utterance.onend = () => {
        //console.log("EVENTO ONEND DISPARADO (fala terminou naturalmente)!");
        if (resolveActiveSpeechPromise) {
          resolveActiveSpeechPromise();
        }
      };

      synth.speak(utterance);
    });

    // b) Limpeza: Garante que a referência seja removida para não ser chamada acidentalmente
    resolveActiveSpeechPromise = null; 
    //console.log("PROMISE RESOLVIDA! AVANÇANDO PARA O MICROFONE...");

    //console.log("Iniciando captura de áudio...");
    await tocarSom(somInicioGravacao);

    const model = getTranscriptionModel();

    if (model === 'web-speech-api') {
      //console.log("Usando Web Speech API...");
      return new Promise(resolve => {
        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = "pt-BR";
        let timeout = setTimeout(() => { recognition.stop(); resolve(""); }, 8000);
        recognition.onend = () => tocarSom(somFimGravacao);
        recognition.onresult = (event) => {
          clearTimeout(timeout);
          resolve(event.results[0][0].transcript.trim());
        };
        recognition.onerror = () => { clearTimeout(timeout); resolve(""); };
        recognition.start();
      });
    } else {
      //console.log(`Usando modelo externo: ${model}...`);
      const audioBlob = await gravarAudio(5000);
      await tocarSom(somFimGravacao);
      if (!audioBlob) return "";
      //console.log("Enviando áudio para transcrição...");
      return await transcreverAudioExterno(audioBlob, model);
    }

  } catch (error) {
    // Garante a limpeza mesmo em caso de erro
    resolveActiveSpeechPromise = null; 
    console.error("Ocorreu um erro em perguntarComVoz:", error);
    return "";
  }
}


// Função segura para ouvir voz com tentativas
/*
async function ouvirComTentativas(pergunta, maxTentativas = 3) {
  let tentativas = 0;
  while (tentativas < maxTentativas) {
    tentativas++;
    try {
      const resposta = await perguntarComVoz(pergunta);
      if (resposta && resposta.trim() !== "") return resposta.toLowerCase();
      //console.log("Não entendi. Vamos tentar de novo...");
      feedbackAudio("Não entendi. Vamos tentar de novo...");
    } catch (err) {
      console.error("Erro ao ouvir:", err);
    }
  }
  //console.log("Número máximo de tentativas atingido. Cancelando...");
  feedbackAudio("Número máximo de tentativas atingido. Cancelando...");
  return null;
}
*/

async function ouvirComTentativas(pergunta, maxTentativas = 3) {
  // Limpa o flag antes de começar, caso tenha sido acionado antes
  setarInterrupcao(false); 
    
  let tentativas = 0;
  
  while (tentativas < maxTentativas) {
    
    // VERIFICAÇÃO CHAVE: Sai do loop se o flag for true
    if (interromperOuvir) {
        // Se a interrupção foi solicitada, não emitimos uma mensagem de erro
        return null; 
    }
    
    tentativas++;
    try {
      const resposta = await perguntarComVoz(pergunta);
      
      // Verifica novamente após a espera assíncrona
      if (interromperOuvir) return null; 
      
      if (resposta && resposta.trim() !== "") return resposta.toLowerCase();
      
      feedbackAudio("Não entendi. Vamos tentar de novo...");
    } catch (err) {
      console.error("Erro ao ouvir:", err);
    }
  }

  // Se saiu do loop por tentativas, mas não por interrupção:
  if (!interromperOuvir) {
      feedbackAudio("Número máximo de tentativas atingido. Cancelando...");
  }
  
  return null;
}

function corrigir(palavra) {
  let melhor = vocab[0];
  let menorDist = Infinity;

  for (const v of vocab) {
    const dist = levenshtein(palavra.toLowerCase(), v.toLowerCase());
    if (dist < menorDist) {
      menorDist = dist;
      melhor = v;
    }
  }

  // só aceita se a distância for "razoável"
  return menorDist <= 2 ? melhor : palavra;
}

// -----------------------------------------
//       FUNÇÃO PARA CRIAR VARIÁVEL (CORRIGIDA)
// -----------------------------------------

async function criarVariavel() {
  const tipoVarRaw = await ouvirComTentativas("O que você deseja criar? Diga variável simples ou vetor.");
  if (!tipoVarRaw) return null; // Sai se o usuário não responder

  const tipoVar = corrigir(tipoVarRaw);

  // 1. Estrutura trocada para if / else if / else
  if (tipoVar.includes("simples") || tipoVar.includes("variável")) {
    const subtipoRaw = await ouvirComTentativas("Qual o tipo da variável? Diga numérica, texto ou booleana.");
    if (!subtipoRaw) return null;
    const subtipo = corrigir(subtipoRaw);

    const nome = await ouvirComTentativas("Qual o nome da variável?");
    if (!nome) return null;

    const valor = await ouvirComTentativas("Qual o valor que será armazenado na variável?");
    if (!valor) return null;

    return enviarParaServidor({
      acao: "criarVariavel",
      tipo: subtipo,
      nome: nome,
      valor: valor
    });

  } else if (tipoVar.includes("vetor")) {
    const subtipoRaw = await ouvirComTentativas("Qual o tipo do vetor? Diga numérico ou texto.");
    if (!subtipoRaw) return null;
    const subtipo = corrigir(subtipoRaw);

    const quantidadeRaw = await ouvirComTentativas("Quantas posições terá o vetor? Diga um número entre um e cinco:");
    if (!quantidadeRaw) return null;

    // 2. Variável 'quantidade' é definida e convertida para número
    const quantidade = await textoParaNumero(quantidadeRaw);

    const nome = await ouvirComTentativas("Qual o nome do vetor?");
    if (!nome) return null;

    let valores = [];
    for (let i = 0; i < quantidade; i++) {
      let v = await ouvirComTentativas(`Qual o valor da posição ${i + 1}?`);
      if (!v) continue; // Pula se não houver resposta para esta posição

      // 3. Verifica o tipo do vetor antes de adicionar o valor
      if (subtipo.includes("numéric")) { // Usamos "numéric" para pegar "numérica" e "numérico"
        let k = await textoParaNumero(v);
        valores.push(k);
      } else {
        valores.push(v); // Adiciona como texto
      }
    }
    return enviarParaServidor({
      acao: "criarVariavel",
      tipo: "vetor de " + subtipo,
      nome,
      quantidade,
      valores
    });

  } else {
    // 5. Evita recursão. Apenas informa o usuário.
    //console.log("Opção não reconhecida. Por favor, tente novamente dizendo 'variável simples' ou 'vetor'.");
    feedbackAudio("Opção não reconhecida. Por favor, tente novamente dizendo 'variável simples' ou 'vetor'.");
    // Opcional: você poderia chamar a função novamente aqui, mas é bom ter um limite.
    // return criarVariavel(); 
    return null;
  }
}

// =====================================================
// 1) Escrever (Adaptado com as melhores práticas)
// =====================================================
async function escrever() {
  // Passo 1: Pergunta inicial usando a função segura.
  const tipoRaw = await ouvirComTentativas("Você deseja escrever o valor de uma variável ou um texto livre?");

  // Passo 2: Verificação de segurança. Se o usuário não responder, a função é encerrada.
  if (!tipoRaw) {
    feedbackAudio("Nenhuma resposta detectada. Ação 'escrever' cancelada.");
    //console.log("Nenhuma resposta detectada. Ação 'escrever' cancelada.");
    return null;
  }

  // Passo 3: Normaliza a resposta do usuário usando a função 'corrigir'.
  // O vocabulário já deve conter "variável" e "texto".
  const tipo = corrigir(tipoRaw);

  // Passo 4: Estrutura lógica explícita, igual à de 'criarVariavel'.
  if (tipo.includes("variável")) {
    const nome = await ouvirComTentativas("Qual o nome da variável que você quer escrever?");

    // Verificação de segurança para o nome da variável.
    if (!nome) {
      //console.log("Nome da variável não informado. Ação cancelada.");
      feedbackAudio("Nome da variável não informado. Ação cancelada.");
      return null;
    }
    // Retorna o objeto estruturado para a ação.
    return enviarParaServidor({ acao: "escrever", tipo: "variavel", conteudo: nome });

  } else if (tipo.includes("texto")) {
    const texto = await ouvirComTentativas("Qual texto você deseja escrever?");

    // Verificação de segurança para o conteúdo do texto.
    if (!texto) {
      feedbackAudio("Texto não informado. Ação cancelada.");
      //console.log("Texto não informado. Ação cancelada.");
      return null;
    }
    // Retorna o objeto estruturado para a ação.
    return enviarParaServidor({ acao: "escrever", tipo: "texto", conteudo: texto });

  } else {
    // Passo 5: Resposta para opções não reconhecidas.
    //console.log(`Não entendi a opção "${tipoRaw}". Por favor, tente novamente dizendo "variável" ou "texto".`);
    feedbackAudio(`Não entendi a opção "${tipoRaw}". Por favor, tente novamente dizendo "variável" ou "texto".`);
    return null;
  }
}

// Assumindo que estas funções já existem:
// - ouvirComTentativas(pergunta)
// - corrigir(texto)
// - mapearOperador(texto) -> importante: esta função deve retornar null se o operador não for reconhecido.

// =====================================================
// 3) Operação (Versão Aprimorada)
// =====================================================
async function operacao() {
  const json = { acao: "operacao" };

  // 1. Pergunta sobre o tipo de operação com segurança
  const tipoRaw = await ouvirComTentativas("A operação será matemática ou lógica?");
  if (!tipoRaw) {
    //console.log("Tipo de operação não informado. Ação cancelada.");
    feedbackAudio("Tipo de operação não informado. Ação cancelada.");
    return null;
  }
  const tipo = corrigir(tipoRaw);

  // Validação do tipo de operação
  if (!tipo.includes("matemática") && !tipo.includes("lógica")) {
    //console.log(`Tipo "${tipoRaw}" não reconhecido. Tente "matemática" ou "lógica".`);
    feedbackAudio(`Tipo "${tipoRaw}" não reconhecido. Tente "matemática" ou "lógica".`);
    return null;
  }
  json.tipo = tipo;

  // 2. Coleta dos operandos e operador iniciais
  const op1 = await ouvirComTentativas("Qual é o primeiro operando?");
  if (!op1) {
    //console.log("Primeiro operando não informado. Ação cancelada.");
    feedbackAudio("Primeiro operando não informado. Ação cancelada.");
    return null;
  }

  const operadorFalado = await ouvirComTentativas("Qual é o operador?");
  if (!operadorFalado) {
    //console.log("Operador não informado. Ação cancelada.");
    feedbackAudio("Operador não informado. Ação cancelada.");
    return null;
  }
  const operador = mapearOperador(operadorFalado);
  if (!operador) {
    //console.log(`Operador "${operadorFalado}" não reconhecido.`);
    feedbackAudio(`Operador "${operadorFalado}" não reconhecido.`);
    return null;
  }

  const op2 = await ouvirComTentativas("Qual é o segundo operando?");
  if (!op2) {
    //console.log("Segundo operando não informado. Ação cancelada.");
    feedbackAudio("Segundo operando não informado. Ação cancelada.");
    return null;
  }

  let expressao = `${op1} ${operador} ${op2}`;

  // 3. Loop seguro para operações adicionais
  while (true) {
    const continuarRaw = await ouvirComTentativas("Deseja adicionar mais alguma operação? Diga sim/ok ou não.");
    if (!continuarRaw) break; // Se não houver resposta, encerra o loop

    const continuar = corrigir(continuarRaw);
    if (continuar.includes("não")) {
      break; // Se a resposta for "não", encerra o loop
    }

    if (continuar.includes("sim") || continuar.includes("ok")) {
      const proximoOperadorFalado = await ouvirComTentativas("Qual é o próximo operador?");
      if (!proximoOperadorFalado) break;
      const proximoOperador = mapearOperador(proximoOperadorFalado);
      if (!proximoOperador) {
        //console.log(`Operador "${proximoOperadorFalado}" não reconhecido.`);
        feedbackAudio(`Operador "${proximoOperadorFalado}" não reconhecido.`);
        break;
      }

      const proximoOp = await ouvirComTentativas("Qual é o próximo operando?");
      if (!proximoOp) break;

      expressao += ` ${proximoOperador} ${proximoOp}`;
    } else {
      //console.log("Resposta não entendida, continuando sem adicionar operação.");
      feedbackAudio("Resposta não entendida, continuando sem adicionar operação.");
      break;
    }
  }

  // 4. Pergunta sobre armazenamento do resultado de forma segura
  const guardarRaw = await ouvirComTentativas("Deseja guardar o resultado em uma variável? Diga sim/ok ou não.");
  if (guardarRaw) {
    const guardar = corrigir(guardarRaw);
    if (guardar.includes("sim") || guardar.includes("ok")) {
      const nomeVar = await ouvirComTentativas("Qual o nome da variável?");
      if (nomeVar) {
        json.guardarEm = nomeVar;
      } else {
        //console.log("Nome da variável não informado, resultado não será guardado.");
        feedbackAudio("Nome da variável não informado, resultado não será guardado.");
      }
    }
  }

  json.expressao = expressao;
  return enviarParaServidor(json);
}

/**
 * Coleta uma lista de ações para um bloco de código (Se ou Senão).
 * @param {string} nomeDoBloco - O nome do bloco, ex: "Se" ou "Senão".
 * @returns {Promise<string[]>} Uma lista com as ações descritas pelo usuário.
 */
async function coletarAcoes(nomeDoBloco) {
  const acoes = [];

  // Pergunta pela primeira ação obrigatória do bloco.
  const primeiraAcao = await ouvirComTentativas(`Qual a primeira operação a ser feita no bloco '${nomeDoBloco}'?`);
  if (!primeiraAcao) {
    feedbackAudio(`Nenhuma operação inicial informada para o bloco '${nomeDoBloco}'.`);
    //console.log(`Nenhuma operação inicial informada para o bloco '${nomeDoBloco}'.`);
    return acoes; // Retorna a lista vazia
  }
  acoes.push(primeiraAcao);

  // Loop para coletar ações adicionais.
  while (true) {
    const continuarRaw = await ouvirComTentativas("Deseja adicionar mais alguma operação neste bloco? Diga sim/ok ou não.");
    if (!continuarRaw) break; // Se não houver resposta, encerra a adição.

    const continuar = corrigir(continuarRaw);
    if (continuar.includes("sim") || continuar.includes("ok")) {
      const proximaAcao = await ouvirComTentativas("Qual a próxima operação?");
      if (proximaAcao) {
        acoes.push(proximaAcao);
      } else {
        feedbackAudio("Nenhuma operação adicional informada.");
        //console.log("Nenhuma operação adicional informada.");
      }
    } else {
      break; // Se a resposta for "não" ou algo diferente, encerra.
    }
  }

  return acoes;
}

/**
 * Constrói uma estrutura condicional (Se/Senão) através de perguntas ao usuário.
 * @returns {Promise<object|null>} Um objeto JSON representando a estrutura, ou null se a ação for cancelada.
 */
async function condicional() {
  // 1. Pergunta pela condição do "Se".
  const condicao = await ouvirComTentativas("Qual condição será verificada pelo 'Se'?");
  if (!condicao) {
    feedbackAudio("Condição não informada. Ação cancelada.");
    //console.log("Condição não informada. Ação cancelada.");
    return null;
  }

  // 2. Coleta as ações para o bloco "Se".
  //console.log("Agora, vamos adicionar as ações para o bloco 'Se'.");
  const acoesSe = await coletarAcoes("Se");

  // Monta a estrutura JSON inicial.
  const json = {
    acao: "condicional",
    se: {
      condicao: condicao,
      acoes: acoesSe
    }
  };

  // 3. Pergunta se o usuário deseja adicionar um bloco "Senão".
  const querSenaoRaw = await ouvirComTentativas("Deseja adicionar um bloco 'Senão'? Diga sim, ok ou não.");
  if (querSenaoRaw) {
    const querSenao = corrigir(querSenaoRaw);

    if (querSenao.includes("sim") || querSenao.includes("ok")) {
      // 4. Se sim, coleta as ações para o bloco "Senão".
      //console.log("Ok, agora vamos adicionar as ações para o bloco 'Senão'.");
      const acoesSenao = await coletarAcoes("Senão");
      json.senao = {
        acoes: acoesSenao
      };
    }
  }

  // 5. Retorna o objeto JSON completo.
  //console.log("Estrutura condicional criada com sucesso!");
  feedbackAudio("Estrutura condicional criada com sucesso!");
  return enviarParaServidor(json);
}

// Exemplo no seu JavaScript
async function enviarParaServidor(json_data) {
  if (!json_data) {
    //console.log("Data is empty.");
    return;
  }

  const selected_model = getSelectedConstructor();

  const response = await fetch(constructorURLs[selected_model], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(json_data)
  });
  const codigoEgua = await response.text();
  //console.log("Código Égua recebido:", codigoEgua);
  addCodeToBox(codigoEgua);
}