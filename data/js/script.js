function transcricao(){
    let chaveDinamica = 'item_' + Date.now();
    const texto = document.getElementById("outputText");
    createIndexedDB();
    saveSessionToIndexedDB(chaveDinamica, String(texto.textContent));
    let array = loadFromIndexedDB()
    //sessionStorage.setItem(chaveDinamica, String(texto.textContent));

    let box = '';

    for (let i=0; i < array.length; i++){
        box += array[i] + '\n';
    }
    console.log(box);
    editor.setValue(box);
}

function createIndexedDB() {
    // Abrir (ou criar) o banco de dados chamado "SessionStorageDB"
    const request = indexedDB.open("SessionStorageDB", 1);
  
    // Evento de atualização (executado se não existir ou quando há mudanças de versão)
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("sessionStore")) {
        // Cria o ObjectStore com chave "key"
        db.createObjectStore("sessionStore", { keyPath: "key" });
      }
    };
  
    // Em caso de sucesso
    request.onsuccess = (event) => {
      console.log("Banco de dados IndexedDB criado ou aberto com sucesso.");
    };
  
    // Em caso de erro
    request.onerror = (event) => {
      console.error("Erro ao abrir o banco de dados IndexedDB:", event.target.error);
    };
  }
  

function saveSessionToIndexedDB(key, value) {
    const request = indexedDB.open("SessionStorageDB", 1);

    // Evento de atualização (executado se não existir ou quando há mudanças de versão)
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("sessionStore")) {
          // Cria o ObjectStore com chave "key"
          db.createObjectStore("sessionStore", { keyPath: "key" });
        }
    };
  
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction("sessionStore", "readwrite");
      const store = transaction.objectStore("sessionStore");
  
        // Salvar no IndexedDB
        store.put({ key, value });
      
  
      transaction.oncomplete = () => {
        console.log("Dados do sessionStorage foram salvos no IndexedDB.");
      };
  
      transaction.onerror = (event) => {
        console.error("Erro ao salvar dados no IndexedDB:", event.target.error);
      };
    }
};

function loadFromIndexedDB() {
    const request = indexedDB.open("SessionStorageDB", 1);
    let vector = [];

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["sessionStore"], "readonly");
      const store = transaction.objectStore("sessionStore");
  
      const getAllRequest = store.getAll();
  
      getAllRequest.onsuccess = (event) => {
        const data = event.target.result;
  
        data.forEach(({ key, value }) => {
          vector.push(value)
        });
  
        console.log("Dados do IndexedDB carregados com sucesso.");
      };
  
      getAllRequest.onerror = (event) => {
        console.error("Erro ao carregar dados do IndexedDB:", event.target.error);
      };
    };

    return(vector);
}
  

function outf(text) {
    var mypre = document.getElementById("output");
    mypre.value = mypre.value + text;
}
function builtinRead(x) {
    if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined)
        throw "File not found: '" + x + "'";
    return Sk.builtinFiles["files"][x];
}

function run() {
    var t0 = (new Date()).getTime()
    var prog = editor.getValue();
    var mypre = document.getElementById("output");
    mypre.value = '';
    Sk.pre = "output";
    Sk.configure({
        inputfun: function (prompt) {
            return window.prompt(prompt);
        },
        inputfunTakesPrompt: true,
        output: outf,
        read: builtinRead,
        __future__: Sk.python3
    });
    var myPromise = Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, prog, true);
    });
    myPromise.then(function () {
        var t1 = (new Date()).getTime()
        mypre.value = mypre.value + "\n" + "<completed in " + (t1 - t0) + " ms>";
    },
        function (err) {
            mypre.value = mypre.value + err.toString() + "\n";
            var t1 = (new Date()).getTime()
            mypre.value = mypre.value + "\n" + "<completed in " + (t1 - t0) + " ms>";
        });
};

function main() {
    run();
    var mypre = document.getElementById("output");
    mypre.style.display = 'block';
    editor.resize()
}

function openFile() {
    var files = input.files;
    if (files.length == 0) return;

    var file = files[0];
    var reader = new FileReader();
    reader.onload = (e) => {
        var file = e.target.result;
        var lines = file.split(/\r\n|\n/);
        editor.setValue(lines.join('\n'));
    };

    reader.onerror = (e) => alert(e.target.error.name);
    reader.readAsText(file);
};

function toggleConsole() {
    var mypre = document.getElementById("output");
    if (mypre.style.display !== 'none') {
        mypre.style.display = 'none';
    }
    else {
        mypre.style.display = 'block';
    }
    editor.resize()
}

function saveCode() {
    localStorage['saveKey'] = editor.getValue();
    window.alert("Code saved!")
}

function downloadCode() {
    var prog = editor.getValue();
    var hiddenElement = document.createElement('a');
    hiddenElement.href = 'data:attachment/text,' + encodeURI(prog);
    hiddenElement.download = 'download.py';
    if (confirm('Download Code?')) {
        hiddenElement.click();
    }
}

function shareCode() {
    var link = window.location.href.split('?')[0] + "?code=" + encodeURIComponent(editor.getValue());
    window.prompt("Copy link to clipboard: Ctrl+C, Enter", link);
}

function kbShortcuts() {
    window.alert("Run : Ctrl+Enter\nOpen : Ctrl+Shift+O\nConsole : Ctrl+Shift+E\nSave : Ctrl+Shift+S\nDownload : Ctrl+Shift+D\nShare : Ctrl+Shift+A\nKeyboard : Ctrl+Shift+K\nSettings : Ctrl+,")
}

function aceSettings() {
    editor.execCommand("showSettingsMenu")
}

function resPanel() {
    var x = document.getElementById("myTopnav");
    if (x.className === "topnav") {
        x.className += " responsive";
    } else {
        x.className = "topnav";
    }
}

document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key == "Enter") {
        event.preventDefault();
        main();
    }

    if (event.ctrlKey && event.shiftKey && event.key == "O") {
        event.preventDefault();
        input.click()
    }

    if (event.ctrlKey && event.shiftKey && event.key == "E") {
        event.preventDefault();
        toggleConsole();
    }

    if (event.ctrlKey && event.shiftKey && event.key == "S") {
        event.preventDefault();
        saveCode();
    }

    if (event.ctrlKey && event.shiftKey && event.key == "D") {
        event.preventDefault();
        downloadCode();
    }

    if (event.ctrlKey && event.shiftKey && event.key == "A") {
        event.preventDefault();
        shareCode();
    }

    if (event.ctrlKey && event.shiftKey && event.key == "K") {
        event.preventDefault();
        kbShortcuts();
    }

});

var editor = ace.edit("editor");
editor.setTheme("ace/theme/merbivore_soft");
editor.session.setMode("ace/mode/python");
editor.setShowPrintMargin(false);
editor.commands.removeCommand('findprevious');
editor.commands.removeCommand('duplicateSelection');
editor.commands.removeCommand('replaymacro');
ace.require("ace/ext/language_tools");
editor.setOptions({
    fontFamily: "Source Code Pro",
    fontSize: "15px",
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true,
    autoScrollEditorIntoView: true,
});

var savedCode = localStorage['saveKey'] || 'defaultValue';

if (savedCode != "defaultValue") {
    editor.setValue(savedCode);
}

var params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
});

if (params.code != null) {
    editor.setValue(params.code);
};

var input = document.querySelector('input')
input.addEventListener('change', () => {
    openFile();
});

window.addEventListener('beforeunload', function (event) {
    event.preventDefault();
    event.returnValue = '';
});

toggleConsole();