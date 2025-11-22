/**
 * Analisa uma string de código e retorna um array de tokens com suas posições.
 * @param {string} codigo O código-fonte a ser analisado.
 * @returns {{token: string, inicio: number, fim: number}[]} Um array de objetos de token.
 */
function tokenizeComPosicoes(codigo) {
  const regex = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"[^"]*"|'[^']*'|\w+|[^\s\w]/g;
  const tokens = [];
  let match;

  while ((match = regex.exec(codigo)) !== null) {
    tokens.push({
      token: match[0],
      inicio: match.index,
      fim: match.index + match[0].length
    });
  }

  return tokens;
}

// =============================
// XHR Helper
// =============================
function getXmlHttpRequestObject() {
  return new XMLHttpRequest();
}

// =============================
// Função de formatação de texto
// =============================
function formatText(text) {
  const segments = text.split(/(?<=[.!?])\s+/);
  let formattedText = '';
  let currentLine = '';

  segments.forEach(segment => {
    if (currentLine.length + segment.length > 100) {
      formattedText += currentLine.trim() + '\n';
      currentLine = '';
    }
    currentLine += segment + ' ';
    if (/[.!?]$/.test(segment)) {
      formattedText += currentLine.trim() + '\n';
      currentLine = '';
    }
  });

  if (currentLine) formattedText += currentLine.trim();
  return formattedText.trim();
}

const transcribeURLS = {
  "whisper-local": "http://localhost:3000/transcrever",
  "whisper-api": "transcribe.php",
  "gemini-speech": "http://localhost:2000/transcribe"
};

// ==========================================
// Recupera modelo de transcrição selecionado
// ==========================================
function getTranscriptionModel() {
  const select = document.getElementById("transcriptionModel");
  return select.value;
}

// =============================
// Função para enviar áudio para o servidor
// =============================
function sendAudioToServer(audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');

  const selected_model = getTranscriptionModel();

  if (transcribeURLS[selected_model]) {
    fetch(transcribeURLS[selected_model], {
      method: 'POST',
      body: formData
    })
      .then(response => response.text())
      .then(text => {
        const formattedText = formatText(text);
        sendData(formattedText);   // envia o texto processado
        //console.log(selected_model + ': ' + formattedText);
      })
      .catch(error => console.error('Erro na transcrição:', error));
  }
}

// =============================
// Callback genérico XHR
// =============================
function sendDataCallback(xhr) {
  if (xhr.readyState === 4) {
    if (xhr.status === 201 || xhr.status === 200) {
      //console.log("Resposta recebida:", xhr.responseText);
      addCodeToBox(xhr.responseText);
    } else {
      console.error("Erro na requisição:", xhr.status, xhr.responseText);
    }
  }
}

// =============================
// Recupera modelo selecionado
// =============================
function getSelectedModel() {
  const select = document.getElementById("translationModel");
  return select.value;
}

// =============================
// SessionStorage helpers
// =============================

document.addEventListener('DOMContentLoaded', () => {

  // ESTRUTURA DE DADOS QUE DEFINE O MENU AUDÍVEL
  const menuAudivelOpcoes = [
    {
      numero: 1,
      nome: "Escrever no console",
      descricao: "Inicia um assistente para inserir um comando de escrita no console, como 'escreva()', na posição atual do cursor.",
      acao: () => escrever() // Supondo que a função 'escrever' existe
    },
    {
      numero: 2,
      nome: "Criar Variável",
      descricao: "Guia você por voz para criar uma nova variável simples ou um vetor, definindo o nome e o valor inicial.",
      acao: () => criarVariavel() // Supondo que a função 'criarVariavel' existe
    },
    {
      numero: 3,
      nome: "Operações",
      descricao: "Abre o sub-menu de operações matemáticas, como soma, subtração, multiplicação e divisão.",
      acao: () => operacao() // Supondo que a função 'operacao' existe
    },
    {
      numero: 4,
      nome: "Condicional",
      descricao: "Inicia um assistente para criar uma estrutura condicional 'se', definindo a condição e os blocos de código.",
      acao: () => condicional() // Supondo que a função 'condicional' existe
    },
    {
      numero: 5,
      nome: "Executar",
      descricao: "Limpa a saída anterior e executa o código que está atualmente no editor.",
      acao: () => {
        clearOutput();
        runCode();
      }
    },
    {
      numero: 6,
      nome: "Ir para a linha",
      descricao: "Inicia o assistente de voz para que você possa dizer o número da linha para a qual deseja navegar.",
      acao: () => irParaLinhaPorVoz(flask, meuEditorTextArea)
    },
    {
      numero: 7,
      nome: "Limpar código",
      descricao: "Apaga todo o conteúdo do editor. Uma confirmação será solicitada para evitar a perda acidental de trabalho.",
      acao: () => limparEditorComConfirmacao(flask, meuEditorTextArea)
    },
    {
      numero: 8,
      nome: "Ler o console",
      descricao: "Lê em voz alta as mensagens que estão na área de saída do console.",
      acao: () => lerConsole()
    }
  ];

  // --- INICIALIZAÇÃO DO EDITOR ---
  const editorContainer = document.querySelector('#editor');
  const flask = new CodeFlask(editorContainer, {
    language: 'js',
    lineNumbers: true
  });

  // --- FUNÇÃO PARA CARREGAR O CÓDIGO DO STORAGE NA INICIALIZAÇÃO ---
  function carregarCodigoDoStorage() {
    const codigoSalvo = sessionStorage.getItem('codigoEditorEgua');
    if (codigoSalvo) {
      flask.updateCode(codigoSalvo);
    }
  }

  // --- SEMPRE LIMPA O STORAGE AO INICIAR ---
  sessionStorage.removeItem('codigoEditorEgua');

  // --- INICIA O EDITOR VAZIO ---
  flask.updateCode('');

  // --- SOLUÇÃO PARA O PROBLEMA (A): SINCRONIZAÇÃO EM TEMPO REAL ---
  flask.onUpdate((code) => {
    sessionStorage.setItem('codigoEditorEgua', code);
  });

  // --- SOLUÇÃO PARA O PROBLEMA (B): INSERIR CÓDIGO NO CURSOR ---
  function addCodeToBox(newCode) {
    if (!newCode || newCode.trim() === "") return;

    // Encontra a textarea interna que você mencionou
    const textarea = editorContainer.querySelector('.codeflask__textarea');
    const cursorPos = textarea.selectionStart;
    const currentCode = flask.getCode();

    const codeBefore = currentCode.substring(0, cursorPos);
    const codeAfter = currentCode.substring(cursorPos);

    const fullNewCode = `${codeBefore}${newCode}\n${codeAfter}`;
    flask.updateCode(fullNewCode);

    // Restaura a posição do cursor para o final do texto inserido
    const newCursorPos = cursorPos + newCode.length + 1;
    textarea.selectionStart = newCursorPos;
    textarea.selectionEnd = newCursorPos;
    textarea.focus();
  }

  // --- EXECUÇÃO INICIAL ---
  carregarCodigoDoStorage();

  sessionStorage.setItem('codigoEditorEgua', "");

  // Expondo a função globalmente para ser chamada por outros scripts
  window.addCodeToBox = addCodeToBox;

  // --- PASSO 2: PEGAR REFERÊNCIA AO TEXTAREA INTERNO ---
  // Como 'flask' já existe, podemos usá-lo para encontrar o textarea.
  const meuEditorTextArea = document.querySelector('.codeflask__textarea');

  // --- PASSO 3: DEFINIR A FUNÇÃO DE LEITURA ---
  // A função que vai usar 'flask' e 'meuEditorTextArea'.
  function lerCaracterSincronizado(flaskInstance, editorTextArea, direcao) {
    const codigo = flaskInstance.getCode();

    if (!codigo || codigo.length === 0) {
      feedbackAudio("O código está vazio.");
      return;
    }

    let posicaoAtual = editorTextArea.selectionStart;
    let novaPosicao = posicaoAtual;

    if (direcao === 'proximo') {
      if (posicaoAtual < codigo.length) {
        novaPosicao++;
      } else {
        feedbackAudio("Fim do código.");
        return;
      }
    } else { // direcao === 'anterior'
      if (posicaoAtual > 0) {
        novaPosicao--;
      } else {
        feedbackAudio("Início do código.");
        return;
      }
    }

    editorTextArea.focus();
    editorTextArea.selectionStart = novaPosicao;
    editorTextArea.selectionEnd = novaPosicao;

    const char = codigo[novaPosicao - 1];

    if (char === ' ') feedbackAudio("espaço");
    else if (char === '\n') feedbackAudio("nova linha");
    else if (char === '\t') feedbackAudio("tabulação");
    else if (char === 'ç') feedbackAudio("cedilha");
    else if (char) feedbackAudio(char);
  }

  /**
  * Lê e seleciona a palavra/token anterior ou seguinte à posição atual do cursor.
  * @param {object} flaskInstance A instância do CodeFlask.
  * @param {HTMLTextAreaElement} editorTextArea O textarea interno do editor.
  * @param {'proximo' | 'anterior'} direcao A direção da navegação.
  */
  function lerPalavraSincronizado(flaskInstance, editorTextArea, direcao) {
    const codigo = flaskInstance.getCode();
    const tokens = tokenizeComPosicoes(codigo);

    if (tokens.length === 0) {
      feedbackAudio("Nenhuma palavra encontrada.");
      return;
    }

    const posicaoCursor = editorTextArea.selectionStart;
    let tokenAlvo = null;

    if (direcao === 'proximo') {
      // Encontra o primeiro token que começa na posição do cursor ou depois dela.
      tokenAlvo = tokens.find(token => token.inicio > posicaoCursor);
      if (!tokenAlvo) {
        feedbackAudio("Fim do código.");
        return;
      }
    } else { // direcao === 'anterior'
      // Encontra todos os tokens que terminam antes do cursor...
      const tokensAnteriores = tokens.filter(token => token.fim <= posicaoCursor);
      // ...e pega o último deles.
      tokenAlvo = tokensAnteriores.pop();
      if (!tokenAlvo) {
        feedbackAudio("Início do código.");
        return;
      }
    }

    // Move o foco e a seleção para o token encontrado
    editorTextArea.focus();
    editorTextArea.selectionStart = tokenAlvo.inicio;
    editorTextArea.selectionEnd = tokenAlvo.fim;

    // Fornece o feedback de áudio
    //feedbackAudio(tokenAlvo.token);

    // Dentro de lerPalavraSincronizado...
    let textoParaFalar = tokenAlvo.token;

    if (textoParaFalar.startsWith('"') || textoParaFalar.startsWith("'")) {
      // Remove as aspas e adiciona um contexto
      textoParaFalar = "string " + textoParaFalar.slice(1, -1);
    } else if (textoParaFalar.startsWith('//') || textoParaFalar.startsWith('/*')) {
      textoParaFalar = "comentário " + textoParaFalar.slice(2);
    }

    feedbackAudio(textoParaFalar);
  }

  /**
  * Lê e move o cursor para a linha anterior ou seguinte à posição atual.
  * @param {object} flaskInstance A instância do CodeFlask.
  * @param {HTMLTextAreaElement} editorTextArea O textarea interno do editor.
  * @param {'proxima' | 'anterior'} direcao A direção da navegação.
  */
  function lerLinhaSincronizado(flaskInstance, editorTextArea, direcao) {
    const codigo = flaskInstance.getCode();
    const linhas = codigo.split('\n');

    if (linhas.length === 0) {
      feedbackAudio("O código está vazio.");
      return;
    }

    const posicaoCursor = editorTextArea.selectionStart;

    // --- Lógica para descobrir a linha atual ---
    let totalCaracteres = 0;
    let linhaAtualIdx = 0;
    for (let i = 0; i < linhas.length; i++) {
      totalCaracteres += linhas[i].length + 1; // +1 para o '\n'
      if (posicaoCursor < totalCaracteres) {
        linhaAtualIdx = i;
        break;
      }
    }

    // --- Determina a linha alvo ---
    let linhaAlvoIdx = direcao === 'proxima' ? linhaAtualIdx + 1 : linhaAtualIdx - 1;

    // --- Validação de Limites ---
    if (linhaAlvoIdx < 0) {
      feedbackAudio("Início do arquivo.");
      linhaAlvoIdx = 0;
    } else if (linhaAlvoIdx >= linhas.length) {
      feedbackAudio("Fim do arquivo.");
      linhaAlvoIdx = linhas.length - 1;
    }

    const linhaAlvoConteudo = linhas[linhaAlvoIdx];

    // --- Move o cursor (Seleção) ---
    let posicaoInicioLinhaAlvo = 0;
    for (let i = 0; i < linhaAlvoIdx; i++) {
      posicaoInicioLinhaAlvo += linhas[i].length + 1;
    }

    editorTextArea.focus();
    editorTextArea.selectionStart = posicaoInicioLinhaAlvo;
    editorTextArea.selectionEnd = posicaoInicioLinhaAlvo + linhaAlvoConteudo.length;

    // --- LÓGICA DE LEITURA CORRIGIDA ---
    
    // 1. Verifica se a linha está realmente vazia (só espaços ou comprimento 0)
    if (!linhaAlvoConteudo || linhaAlvoConteudo.trim().length === 0) {
        feedbackAudio(`Linha ${linhaAlvoIdx + 1}: Linha vazia`);
        return;
    }

    // 2. Prepara o texto para leitura. 
    // Se a linha for APENAS um símbolo (com ou sem espaços), forçamos a leitura dele.
    let textoParaLer = linhaAlvoConteudo;
    const conteudoLimpo = linhaAlvoConteudo.trim();

    // Dicionário simples para garantir leitura de símbolos isolados comuns
    const mapaSimbolos = {
        '{': 'Abre chaves',
        '}': 'Fecha chaves',
        '(': 'Abre parênteses',
        ')': 'Fecha parênteses',
        '[': 'Abre colchetes',
        ']': 'Fecha colchetes',
        ';': 'Ponto e vírgula',
        '/': 'Barra',
        '//': 'Barra dupla',
        '"': 'Aspas'
    };

    // Se a linha contém APENAS um desses símbolos (ignorando espaços), substitui pelo nome
    if (mapaSimbolos[conteudoLimpo]) {
        textoParaLer = mapaSimbolos[conteudoLimpo];
    } 
    // Se você quiser ler a indentação (espaços), mantenha o 'linhaAlvoConteudo' original (raw).
    // Se quiser pular os espaços iniciais na leitura, use 'conteudoLimpo'.
    // Abaixo uso o original para ler "exatamente tudo" como pedido, 
    // mas o TTS pode ler os espaços como "silêncio" ou "espaço espaço".
    else {
        textoParaLer = linhaAlvoConteudo; 
    }

    feedbackAudio(`Linha ${linhaAlvoIdx + 1}: ${textoParaLer}`);
  }
  /*
  function lerLinhaSincronizado(flaskInstance, editorTextArea, direcao) {
    const codigo = flaskInstance.getCode();
    // Quebramos o código em um array de linhas.
    const linhas = codigo.split('\n');

    if (linhas.length === 0) {
      feedbackAudio("O código está vazio.");
      return;
    }

    const posicaoCursor = editorTextArea.selectionStart;

    // --- Lógica para descobrir a linha atual a partir da posição do cursor ---
    let totalCaracteres = 0;
    let linhaAtualIdx = 0;
    for (let i = 0; i < linhas.length; i++) {
      // Soma o comprimento da linha + 1 (para o caractere de quebra de linha '\n')
      totalCaracteres += linhas[i].length + 1;
      if (posicaoCursor < totalCaracteres) {
        linhaAtualIdx = i;
        break; // Encontramos a linha onde o cursor está
      }
    }

    // --- Determina a linha alvo ---
    let linhaAlvoIdx = direcao === 'proxima' ? linhaAtualIdx + 1 : linhaAtualIdx - 1;

    // --- Validação de Limites ---
    if (linhaAlvoIdx < 0) {
      feedbackAudio("Início do arquivo.");
      // Opcional: move o cursor para o início da primeira linha
      linhaAlvoIdx = 0;
    }

    if (linhaAlvoIdx >= linhas.length) {
      feedbackAudio("Fim do arquivo.");
      // Opcional: mantém o cursor na última linha
      linhaAlvoIdx = linhas.length - 1;
    }

    const linhaAlvoConteudo = linhas[linhaAlvoIdx];

    // --- Lógica para mover o cursor para o início da linha alvo ---
    let posicaoInicioLinhaAlvo = 0;
    for (let i = 0; i < linhaAlvoIdx; i++) {
      posicaoInicioLinhaAlvo += linhas[i].length + 1; // Soma o tamanho das linhas anteriores + '\n'
    }

    editorTextArea.focus();
    editorTextArea.selectionStart = posicaoInicioLinhaAlvo;
    // Move o fim da seleção para o fim da linha para selecioná-la inteira
    editorTextArea.selectionEnd = posicaoInicioLinhaAlvo + linhaAlvoConteudo.length;

    // --- Feedback de Áudio ---
    // Usamos trim() para não ler a indentação em voz alta
    feedbackAudio(`Linha ${linhaAlvoIdx + 1}: ${linhaAlvoConteudo.trim()}`);
  }
  */

  /**
 * Função principal para ir a uma linha, agora usando escuta por voz robusta.
 * @param {object} flaskInstance A instância do CodeFlask.
 * @param {HTMLTextAreaElement} editorTextArea O textarea interno do editor.
 */
  async function irParaLinhaPorVoz(flaskInstance, editorTextArea) {
    try {
      // 1. Usa sua função para perguntar a linha e esperar a resposta por voz.
      const linhaRaw = await ouvirComTentativas("Para qual linha você quer ir?");

      // 2. Se o usuário não responder ou a escuta falhar, encerra a função.
      if (!linhaRaw) {
        feedbackAudio("Nenhuma resposta ouvida. Operação cancelada.");
        return;
      }

      // 3. Usa sua função para converter a resposta em texto (ex: "vinte") para um número.
      const numeroLinha = await textoParaNumero(linhaRaw);

      // console.log(numeroLinha);

      // 4. Valida se a conversão para número foi bem-sucedida.
      if (isNaN(numeroLinha) || numeroLinha <= 0) {
        feedbackAudio(`Não consegui entender "${linhaRaw}" como um número de linha válido.`);
        return;
      }

      // 5. Com o número validado, chama a função de navegação.
      navegarParaLinha(numeroLinha, flaskInstance, editorTextArea);

    } catch (error) {
      console.error("Ocorreu um erro durante o processo de ir para a linha:", error);
      feedbackAudio("Ocorreu um erro. Por favor, tente novamente.");
    }
  }

  function irParaLinhaPorTeclado(flaskInstance, editorTextArea) {
    // 1. Solicita a entrada do usuário via caixa de diálogo padrão
    feedbackAudio("Digite o número da linha para a qual deseja ir:");
    const entrada = prompt("Digite o número da linha para a qual deseja ir:");

    // 2. Se o usuário clicar em "Cancelar" ou deixar vazio, encerra a função.
    if (entrada === null || entrada.trim() === "") {
      feedbackAudio("Operação cancelada.");
      return;
    }

    // 3. Converte a string de entrada para um número inteiro
    const numeroLinha = parseInt(entrada, 10);

    // 4. Valida se a conversão foi bem-sucedida e se é um número positivo
    if (isNaN(numeroLinha) || numeroLinha <= 0) {
      feedbackAudio(`Não entendi "${entrada}" como um número. Tecle Enter para finalizar.`);
      alert(`"${entrada}" não é um número de linha válido.`);
      return;
    }

    // 5. Chama a mesma função de navegação usada pela versão de voz
    navegarParaLinha(numeroLinha, flaskInstance, editorTextArea);
  }

  /**
   * Lógica de navegação isolada. Move o cursor para a linha especificada.
   * @param {number} numeroLinha - O número da linha para a qual navegar (base 1).
   * @param {object} flaskInstance
   * @param {HTMLTextAreaElement} editorTextArea
   */
  function navegarParaLinha(numeroLinha, flaskInstance, editorTextArea) {
    const linhas = flaskInstance.getCode().split('\n');
    const indiceAlvo = numeroLinha - 1; // Ajusta para índice de array (base 0)

    if (indiceAlvo >= 0 && indiceAlvo < linhas.length) {
      let posicaoInicioLinhaAlvo = 0;
      for (let i = 0; i < indiceAlvo; i++) {
        posicaoInicioLinhaAlvo += linhas[i].length + 1;
      }
      const linhaAlvoConteudo = linhas[indiceAlvo];

      editorTextArea.focus();
      editorTextArea.selectionStart = posicaoInicioLinhaAlvo;
      editorTextArea.selectionEnd = posicaoInicioLinhaAlvo + linhaAlvoConteudo.length;

      feedbackAudio(`Ok, linha ${numeroLinha}: ${linhaAlvoConteudo.trim() || 'linha vazia'}`);
    } else {
      feedbackAudio(`A linha ${numeroLinha} não existe. O código tem ${linhas.length} linhas.`);
    }
  }

  function lerConsole() {
    // Seleciona a div (por id, classe etc.)
    const div = document.querySelector('#output');

    // Pega todos os <p> dentro da div
    const paragrafos = div.querySelectorAll('p');

    // Extrai o texto de todos e junta
    const textoCompleto = Array.from(paragrafos)
      .map(p => p.textContent.trim())
      .join(' ');

    feedbackAudio(textoCompleto);
  }

  /**
  * Pede confirmação e, se o usuário concordar, limpa o editor.
  * @param {object} flaskInstance A instância principal do CodeFlask.
  * @param {HTMLTextAreaElement} editorTextArea O elemento textarea do editor.
  */
  function limparEditorComConfirmacao(flaskInstance, editorTextArea) {
    const temCerteza = confirm("Você tem certeza que deseja limpar toda a área de código? Esta ação não pode ser desfeita.");

    if (temCerteza) {
      flaskInstance.updateCode('');

      // CORREÇÃO: Usamos a referência direta ao textarea
      editorTextArea.focus();

      feedbackAudio("Área de código limpa.");
    } else {
      feedbackAudio("Operação cancelada.");
    }
  }

  /**
  * Exporta o conteúdo atual do editor CodeFlask para um arquivo de texto.
  * @param {object} flaskInstance A instância principal do CodeFlask.
  * @param {string} nomeArquivo O nome do arquivo a ser salvo (ex: 'meu_codigo.egua').
  */
  function exportarCodigo(flaskInstance, nomeArquivo = 'codigo.egua') {
    // 1. Pega o código atual diretamente da instância do editor.
    const codigo = flaskInstance.getCode();

    // 2. Validação: não faz nada se não houver código para exportar.
    if (!codigo || codigo.trim() === '') {
      feedbackAudio("A área de código está vazia. Nada para exportar.");
      return;
    }

    // 3. Cria um Blob (Binary Large Object) do tipo texto plano com o código.
    const blob = new Blob([codigo], { type: "text/plain;charset=utf-8" });

    // 4. Gera uma URL temporária para o Blob.
    const url = URL.createObjectURL(blob);

    // 5. Cria um elemento de link <a> invisível para acionar o download.
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo; // Usa o nome de arquivo fornecido

    // 6. Simula um clique no link para iniciar o download e depois o remove.
    document.body.appendChild(a); // O link precisa estar no DOM para o Firefox
    a.click();
    document.body.removeChild(a);

    // 7. Libera a memória revogando a URL do objeto.
    URL.revokeObjectURL(url);

    feedbackAudio("Código exportado com sucesso.");
  }

  // --- PASSO 4: CONFIGURAR OS ATALHOS DE TECLADO ---
  // Este código está no mesmo escopo e, portanto, "enxerga" as constantes flask e meuEditorTextArea.
  if (flask && meuEditorTextArea) {
    document.addEventListener('keydown', async (event) => {
      // =======================================================
      // NOVO ATALHO: Focar no editor de código (Alt + C)
      // =======================================================
      if (event.key === 'F12' || (event.altKey && event.key.toLowerCase() === 'c')) {
        // 1. Previne qualquer ação padrão do navegador para Alt+C
        event.preventDefault();

        // 2. Coloca o foco (cursor) diretamente no textarea do editor
        meuEditorTextArea.focus();

        // 3. Fornece um feedback de áudio para o usuário
        feedbackAudio("Editor de código focado.");
      }
      // =======================================================

      // Leitura de CARACTERE (Shift + Setas Horizontais)
      if (event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault();
        lerCaracterSincronizado(flask, meuEditorTextArea, 'proximo');
      }

      if (event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        lerCaracterSincronizado(flask, meuEditorTextArea, 'anterior');
      }

      // Leitura de PALAVRA (Ctrl + Setas Horizontais)
      if (event.ctrlKey && event.key === 'ArrowRight') {
        event.preventDefault();
        lerPalavraSincronizado(flask, meuEditorTextArea, 'proximo');
      }
      if (event.ctrlKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        lerPalavraSincronizado(flask, meuEditorTextArea, 'anterior');
      }

      // --- NAVEGAÇÃO LINHA A LINHA (Shift + Setas Verticais) ---
      if (event.shiftKey && event.key === 'ArrowDown') {
        event.preventDefault();
        lerLinhaSincronizado(flask, meuEditorTextArea, 'proxima');
      }

      if (event.shiftKey && event.key === 'ArrowUp') {
        event.preventDefault();
        lerLinhaSincronizado(flask, meuEditorTextArea, 'anterior');
      }

      if (event.key === 'F7') {
        event.preventDefault();
        // Chama a nova função principal.
        irParaLinhaPorVoz(flask, meuEditorTextArea);
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        // Chama a nova função principal.
        irParaLinhaPorTeclado(flask, meuEditorTextArea);
      }

      if (event.key === 'F6' || (event.shiftKey && event.key.toLowerCase() === 'e')) {
        // 1. Previne qualquer ação padrão do navegador para Alt+C
        event.preventDefault();

        clearOutput();
        // 2. Executa o código
        runCode();

        // 3. Fornece um feedback de áudio para o usuário
        feedbackAudio("O código está sendo executado.");
      }

      // Substitua o bloco do atalho Ctrl + Espaço por este:
      if (event.ctrlKey && event.key === ' ') {
        event.preventDefault();

        // 1. Gera dinamicamente a lista de opções para o prompt inicial.
        const listaOpcoesPrompt = menuAudivelOpcoes
          .map(opt => `Opção ${opt.numero}: ${opt.nome}.`)
          .join(' ');

        const promptInicial = `Bem-vindo ao menu audível. Diga o número da opção para executá-la ou diga "ajuda" seguido do número para saber mais. ${listaOpcoesPrompt}`;

        // 2. Ouve a resposta do usuário.
        const respostaRaw = await ouvirComTentativas(promptInicial);
        if (!respostaRaw) {
          feedbackAudio("Operação cancelada.");
          return;
        }

        // O .replace() é adicionado ao final da cadeia
        const respostaLimpa = respostaRaw
          .toLowerCase()        // 1. Converte para minúsculas ("olá, mundo! (tudo bem?)")
          .trim()               // 2. Remove espaços no início/fim (não muda neste exemplo)
          .replace(/[\p{P}]/gu, ''); // 3. Remove a pontuação

        //console.log(respostaLimpa);

        // 3. Verifica se o usuário pediu AJUDA.
        if (respostaLimpa.startsWith("ajuda")) {
          // Extrai o número que veio depois da palavra "ajuda".
          const numeroAjuda = await textoParaNumero(respostaLimpa.replace("ajuda", "").trim());

          if (isNaN(numeroAjuda)) {
            feedbackAudio("Não entendi o número da opção para a qual você precisa de ajuda.");
            return;
          }

          const opcaoEncontrada = menuAudivelOpcoes.find(opt => opt.numero === numeroAjuda);

          if (opcaoEncontrada) {
            // Lê a descrição detalhada da opção.
            feedbackAudio(opcaoEncontrada.descricao);
          } else {
            feedbackAudio(`A opção de ajuda número ${numeroAjuda} não existe.`);
          }

        } else {
          // 4. Se não foi um pedido de ajuda, tenta EXECUTAR a opção.

          let numeroOpcao;

          if (respostaLimpa.startsWith("opção")) {
            numeroOpcao = await textoParaNumero(respostaLimpa.replace("opção", "").trim());
          } else {
            numeroOpcao = await textoParaNumero(respostaLimpa);
          }

          if (isNaN(numeroOpcao)) {
            feedbackAudio(`Não reconheci "${respostaRaw}" como uma opção válida.`);
            return;
          }

          const opcaoEncontrada = menuAudivelOpcoes.find(opt => opt.numero === numeroOpcao);

          if (opcaoEncontrada) {
            feedbackAudio(`Ok! Executando: ${opcaoEncontrada.nome}.`);
            opcaoEncontrada.acao(); // Executa a função associada à opção!
          } else {
            feedbackAudio(`A opção número ${numeroOpcao} não é válida.`);
          }
        }
      }

      if (event.key === 'F8' || (event.shiftKey && event.key.toLowerCase() === 'r')) {
        // 1. Previne qualquer ação padrão do navegador para CTRL + Espaço
        event.preventDefault();
        lerConsole();
      }

      if (event.key === 'F9' || (event.ctrlKey && event.key.toLowerCase() === 'k')) {
        event.preventDefault(); // evita comportamento padrão (ex: abrir busca)
        micBtn.click(); // simula o clique no botão
      }

      if (event.key === 'F10' || (event.ctrlKey && event.key.toLowerCase() === 'r')) {
        event.preventDefault();

        feedbackAudio("Você tem certeza que deseja limpar toda a área de código? Se SIM, pressione ENTER. Caso contrário, pressione ESC.");

        // Chama a nova versão com o passo de segurança
        limparEditorComConfirmacao(flask, meuEditorTextArea);
      }

      // =======================================================
      // ATALHO: Exportar/Salvar o código (Ctrl + S)
      // =======================================================
      if (event.key === 'F11' || (event.ctrlKey && event.key.toLowerCase() === 's')) {
        // MUITO IMPORTANTE: Impede o navegador de abrir o diálogo "Salvar Página Como..."
        event.preventDefault();

        // Chama a nossa nova função de exportação
        exportarCodigo(flask);
      }

      /*
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's') {
        // MUITO IMPORTANTE: Impede o navegador de abrir o diálogo "Salvar Página Como..."
        event.preventDefault();

        // Chama a nossa nova função de exportação
        exportarSomenteCodigo(flask);
      }
      */

      if (event.key === 'F2') {
        // Impede o navegador de executar a ação padrão...
        event.preventDefault();

        // Chama a nossa nova função de escrever variável/texto
        escrever();
      }

      if (event.key === 'F3') {
        // Impede o navegador de executar a ação padrão...
        event.preventDefault();

        // Chama a nossa nova função de criar variável
        criarVariavel();
      }

      if (event.key === 'F4') {
        // Impede o navegador de executar a ação padrão...
        event.preventDefault();

        // Chama a nossa nova função de operações
        operacao();
      }

      if (event.key === 'F5') {
        // Impede o navegador de executar a ação padrão...
        event.preventDefault();

        // Chama a nossa nova função de operações
        condicional();
      }
    });
  } else {
    console.error("Instância do CodeFlask ou o textarea não foram encontrados!");
  }
});

// =============================
// Função principal de envio de dados
// =============================
const modelURLs = {
  "gemini-latest": "http://localhost:4000/gerar-codigo",
  "gpt-4o": "http://localhost:4100/gerar-codigo",
  "transformer": "http://localhost:6969/",
  "phi-2": "http://localhost:4300/gerar-codigo",
  "llama-3": "http://localhost:4400/gerar-codigo",
  "qwen2": "http://localhost:4500/gerar-codigo"
};

async function sendData(userPrompt) {
  if (!userPrompt || userPrompt.trim() === "") {
    //console.log("Data is empty.");
    return;
  }

  let code = sessionStorage.getItem('codigoEditorEgua');

  const selected_model = getSelectedModel();

  //console.log("Sending data:", userPrompt);

  // 1. Criar o objeto de dados no formato esperado pelo servidor
  const data = {
    prompt: userPrompt,
    codigo_atual: code
  };

  const xhr = getXmlHttpRequestObject();
  xhr.onreadystatechange = () => sendDataCallback(xhr);
  xhr.open("POST", modelURLs[selected_model], true);

  // 2. Definir o Content-Type correto para JSON
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");

  // 3. Enviar os dados como uma string JSON
  xhr.send(JSON.stringify(data));
}