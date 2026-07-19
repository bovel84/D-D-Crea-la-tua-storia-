# Cronache del Destino — memoria, Master e Ollama

## 1. Architettura generale

```text
Input del giocatore
       │
       ├── AdvancedMemoryManager
       │     ├── breve termine: ultimi 10 messaggi
       │     ├── medio termine: riassunto scena/capitolo, max 500 token stimati
       │     ├── lungo termine: entità strutturate persistenti
       │     ├── compressione oltre 6.000 token stimati
       │     └── retrieval lessicale pesato: top 5 ricordi
       │
       ├── NarrativeMasterEngine
       │     ├── analisi stato
       │     ├── conseguenze
       │     ├── focus narrativo
       │     ├── beat proattivo
       │     ├── narrative compass
       │     └── controllo contraddizioni
       │
       ├── Prompt finale + ultimi 10 messaggi
       │
       └── Provider selezionato
             ├── Groq / OpenRouter esistenti
             └── OllamaCloudClient
                   ├── endpoint nativo /api/chat
                   ├── endpoint compatibile /v1/chat/completions
                   └── fallback ordinato tra modelli
```

L'applicazione resta browser-only e non introduce dipendenze di runtime. I moduli usano un wrapper compatibile sia con `<script>` nel browser sia con `require()` nei test Node.

## 2. File creati o modificati

| File | Ruolo |
| --- | --- |
| `index.html` | Integrazione con stato, UI, prompt, parser dei tag, salvataggi e provider esistenti. |
| `js/memory-manager.js` | Migrazione memoria, breve/medio/lungo termine, stima token, compressione e retrieval top 5. |
| `js/narrative-master.js` | Ciclo decisionale, proattività, narrative compass e rilevamento contraddizioni. |
| `js/ollama-cloud.js` | Catalogo modelli Cloud, collegamento nativo, ID modello libero e fallback. |
| `api/ollama/[action].js` | Funzione serverless che inoltra chat e catalogo a Ollama Cloud. |
| `tests/run-tests.js` | Test funzionali per memoria, Master e Ollama. |
| `tests/check-html-script.js` | Controllo sintattico dello script inline. |
| `package.json` | Comandi `npm test` e `npm run check`; nessuna dipendenza installata. |

## 3. Implementazione delle tre aree

### Memoria multilivello

Lo stato precedente di `worldMemory` non viene sostituito. La migrazione additiva porta lo schema a `memorySchemaVersion: 2` e conserva anche i campi sconosciuti. Alle collezioni esistenti vengono aggiunte:

- `factions`;
- `playerDecisions`;
- `narrativeGoals`;
- `revealedSecrets`;
- `mediumTerm` e `sceneSummary`;
- metadati `compression`;
- `narrativeCompass`.

Flusso operativo semplificato:

```js
const memory = memoryManager.migrate(savedWorldMemory);
const context = memoryManager.buildContext(playerAction, history, memory);

// context.shortTerm contiene al massimo 10 messaggi.
// context.retrieved contiene i 5 elementi più rilevanti.

history.push(userMessage, assistantMessage);
const result = memoryManager.compress(history, memory);
history = result.history;
worldMemory = result.memory;
```

La compressione scatta oltre 6.000 token stimati, ordina le frasi vecchie in base a scelte, eventi, entità e rilevanza narrativa, aggiorna il riassunto incrementale e conserva intatti gli ultimi 10 messaggi. Il riassunto è troncato a un massimo stimato di 500 token.

Il retrieval non usa embedding o dipendenze esterne. Indicizza personaggi, luoghi, fazioni, eventi, decisioni, obiettivi, segreti e quest. Il punteggio considera:

- corrispondenza del nome;
- sovrapposizione delle parole significative;
- importanza (`normal`, `high`, `critical`);
- stato attivo della trama;
- recenza in turni.

### Master a 360 gradi

Ogni chiamata esegue quattro fasi esplicite:

```js
const masterTurn = narrativeMaster.decide(playerAction, {
  memory: worldMemory,
  character,
  story,
  time,
  currentLocation
});
```

Il risultato contiene:

1. analisi di posizione, urgenze fisiche, quest, NPC ed eventi recenti;
2. conseguenze da far maturare;
3. focus tra `esplorazione`, `combattimento`, `dialogo`, `rivelazione` e `cliffhanger`;
4. beat proattivo che fa evolvere un NPC, una quest o l'ambiente.

Il `narrativeCompass` persiste tono, obiettivi del giocatore, obiettivi degli NPC, trame aperte, ramificazioni future, focus, ultimo ciclo e tick del mondo. È visibile in **Memoria del Mondo → Bussola**.

Il controllo di coerenza intercetta almeno:

- interazioni richieste con NPC registrati come morti;
- dichiarazioni di posizione incompatibili con lo stato salvato.

Il prompt ordina al Master di rispettare il fatto canonico e di chiedere una precisazione dentro la scena solo se l'ambiguità cambia davvero l'esito.

I nuovi tag persistenti sono:

```text
[FAZIONE: nome|descrizione|relazione]
[DECISIONE: sintesi|importanza]
[OBIETTIVO_NARRATIVO: nome|descrizione|stato|progresso]
[SEGRETO: nome|descrizione]
```

`[SEGRETO]` deve essere emesso solo dopo una rivelazione effettiva al giocatore.

### Provider cloud configurabili e Ollama Cloud

Per Groq, OpenRouter e Kimera le Impostazioni permettono di inserire API key, URL della API e ID modello. L'URL deve essere un endpoint HTTPS compatibile OpenAI `.../chat/completions` e deve consentire CORS.

Per Ollama l'utente inserisce soltanto API key e ID modello. L'app usa automaticamente le rotte interne `/api/ollama/chat` e `/api/ollama/tags`; la funzione serverless inoltra la richiesta a `https://ollama.com/api` con l'autenticazione Bearer. Non viene mai eseguito un modello sul cellulare.

Questa parte richiede un hosting con funzioni serverless, come Vercel. GitHub Pages può pubblicare i file statici ma non può eseguire la rotta `/api/ollama`; sulla versione Pages il collegamento Ollama non può quindi funzionare.

| ID API | Contesto consigliato | Temperature | top_p | top_k | Uso narrativo |
| --- | ---: | ---: | ---: | ---: | --- |
| `gpt-oss:120b` | 131.072 | 0,70 | 0,90 | 40 | Scelta generale per campagne complesse. |
| `deepseek-v3.1:671b` | 131.072 | 0,65 | 0,90 | 40 | Investigazione, enigmi e conseguenze strategiche. |
| `qwen3-coder:480b` | 131.072 | 0,65 | 0,90 | 40 | Rispetto delle istruzioni e tag del Master. |
| `gpt-oss:20b` | 131.072 | 0,75 | 0,90 | 40 | Scene brevi e fallback rapido. |

Il client Ollama invia richieste native a `/api/chat` con `temperature`, `top_p`, `top_k`, `num_ctx` e `num_predict` dentro `options`. L'ID scritto nel campo libero ha priorità sul menu e può essere anche un modello non presente nel catalogo.

Il catalogo iniziale mostra i modelli Cloud consigliati. Dopo aver incollato la chiave, il pulsante **Aggiorna modelli Ollama Cloud** richiama la rotta nativa e aggiunge al menu tutti i modelli abilitati per quell'account.

Il fallback prova in ordine il modello primario e gli ID indicati dall'utente. Passa al successivo su timeout, risposta vuota, modello non disponibile, rate limit o errore 5xx. Su `401` o `403` interrompe subito, perché cambiare modello non risolve una credenziale errata.

La funzione serverless inoltra le richieste all'endpoint Cloud `https://ollama.com/api`, con autenticazione Bearer. Riferimenti: [Ollama Cloud](https://docs.ollama.com/cloud), [autenticazione](https://docs.ollama.com/api/authentication), [API chat](https://docs.ollama.com/api/chat).

## 4. Esempio di flusso completo

Input:

> Torno alla locanda del Cigno Nero e chiedo notizie di Elara.

1. **Breve termine:** vengono forniti gli ultimi 10 messaggi.
2. **Medio termine:** viene aggiunto il riassunto della scena o del capitolo corrente.
3. **Retrieval:** tra tutte le entità vengono selezionati, per esempio:

```text
1. [personaggi] Elara — amica d'infanzia, scomparsa tre giorni fa
2. [luoghi] Locanda del Cigno Nero — vecchia locanda sul porto
3. [quest] Trovare Elara — seguire le tracce dalla locanda
4. [eventi] Elara è scomparsa tre giorni fa
5. [fazioni] Casa Vareth — casata legata al pugnale col sigillo
```

4. **Decisione del Master:** analizza lo stato, valuta le conseguenze, sceglie `dialogo`, ordina a Mirella o a un antagonista di compiere un'azione autonoma e verifica eventuali contraddizioni.
5. **Generazione:** il modello riceve contesto, bussola e istruzioni meccaniche. Una risposta possibile è:

> La locanda del Cigno Nero è più silenziosa del solito. Mirella ti guarda con occhi stanchi: «Nessuna notizia di Elara. Ma stanotte qualcuno ha lasciato questo nella sua stanza...» Ti porge un pugnale con il sigillo della Casa Vareth.

6. **Aggiornamento:** parser e Master registrano evento, fazione, eventuale decisione, obiettivo e cambiamenti della bussola. Se la soglia è superata, i messaggi vecchi vengono compressi; al salvataggio tutto finisce nello slot esistente.

## 5. Compatibilità, test e rischi

Verifica locale:

```bash
npm test
npm run check
```

Rischi e scelte deliberate:

- La stima token è portabile ma approssimata; tokenizer diversi possono produrre conteggi differenti.
- Il retrieval lessicale è leggero e deterministico, ma non coglie sinonimi quanto un sistema a embedding.
- Il catalogo riflette i modelli Cloud disponibili al momento dell'implementazione; Ollama può aggiornare l'offerta. In caso di modello rimosso, il fallback prova il successivo.
- Ollama richiede un deployment serverless dell'intero repository; il solo URL GitHub Pages resta limitato ai provider che consentono chiamate dirette dal browser.
- Le API key restano in `localStorage`, come le chiavi degli altri provider già presenti. Per uso multiutente o produzione vanno spostate in un backend sicuro.
- Ollama Cloud non garantisce attualmente gli structured output; l'integrazione mantiene quindi il parser a tag già usato dal progetto invece di dipendere da JSON Schema.
- Il salvataggio `dnd_v4` non cambia forma: `worldMemory` riceve campi additivi e una migrazione idempotente. Vecchi slot e impostazioni restano caricabili.
