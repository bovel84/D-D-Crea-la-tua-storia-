# 📜 Cronache del Destino

> Gioco di ruolo narrativo con memoria persistente, Narrative Engine multilivello e connessione serverless a Ollama Cloud.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.8.0-blue.svg)](https://github.com/bovel84/D-D-Crea-la-tua-storia-)
**Licenza**: MIT © 2026 Andrea Cannas

---

## 🎮 Cos'è

Cronache del Destino è una miniapp IA che trasforma la chat con un LLM in un'esperienza di gioco di ruolo narrativa e persistente. Il giocatore crea un personaggio, sceglie un tema e una cornice narrativa, poi l'AI genera una storia interattiva in cui ogni scelta ha conseguenze tracciate nella memoria.

A differenza di una semplice chat con AI, Cronache del Destino mantiene:
- **Memoria multilivello** (breve/medio/lungo termine) con retrieval lessicale e compressione automatica
- **Narrative Compass** che traccia tono, obiettivi, trame aperte e rileva contraddizioni
- **Game Director** con timeline, world moves e pressures
- **Life Legacy** con 6 domini di crescita (Corpo, Mente, Relazioni, Professione, Leadership, Talento)
- **Campaign Vault** per salvare, ripristinare e fare backup delle avventure
- **Campaign Profile** con 5 toni e 5 focus narrativi selezionabili
- **Multi-modello con fallback** automatico su Ollama Cloud

---

## 🚀 Pubblicazione con Ollama Cloud

L'app usa il proxy Vercel `https://storia-app.vercel.app/api/ollama`, necessario perché le WebView Android e gli hosting statici non possono leggere direttamente le risposte di `https://ollama.com/api` per le restrizioni CORS. Il giocatore deve inserire soltanto la propria API key e scegliere il modello.

Il proxy accetta richieste CORS senza cookie e inoltra la chiave esclusivamente all'API ufficiale Ollama Cloud. Un proxy alternativo può essere impostato esplicitamente tramite `nativeProxy`.

---

## 🧩 Architettura

```
┌──────────────────────────────────────────────────────┐
│                    index.html (UI)                     │
│            Tema pergamena · 6 generi narrativi          │
├──────────────────────────────────────────────────────┤
│                   Experience v7                        │
│        Wizard onboarding · Thinking messages           │
│                  Auto-scroll                           │
├────────────┬─────────────┬────────────┬──────────────┤
│  Memory    │  Narrative  │    Game    │   Life       │
│  Manager   │   Master    │  Director  │   Legacy     │
│            │             │            │              │
│ Short-term │  Compass    │ Timeline   │ 6 Domini XP  │
│ Medium-term│  Tone detect│ World moves│ Milestones   │
│ Long-term │  Focus      │ Pressures  │ Timeline     │
│ Retrieval  │  Contradict.│            │              │
│ Compress.  │  Proactive  │            │              │
├────────────┴─────────────┴────────────┴──────────────┤
│              Campaign Vault + Profile                  │
│         Save/Load · Backup · 5 Toni · 5 Focus          │
├──────────────────────────────────────────────────────┤
│                 Ollama Cloud Client                    │
│        Multi-modello · Fallback · Retry                │
├──────────────────────────────────────────────────────┤
│              Proxy Vercel (serverless)                │
│            api/ollama/[action].js                     │
│        CORS · Auth passthrough · chat/tags            │
├──────────────────────────────────────────────────────┤
│                   Ollama Cloud API                     │
│              ollama.com/api/chat                       │
└──────────────────────────────────────────────────────┘
```

---

## 📦 Moduli

### `js/memory-manager.js` (413 righe)
Memoria multilivello con schema v2:
- **Breve termine**: ultimi 10 messaggi non compressi
- **Medio termine**: compressione automatica oltre soglia token (default 6000)
- **Lungo termine**: entità persistenti (NPC, location, fazioni, quest, eventi, decisioni, segreti rivelati, oggetti, abilità, proprietà, famiglia, dipendenti)
- **Retrieval lessicale**: tokenizzazione + stop-word italiane + keyword matching
- **Stima token** indipendente dal tokenizer del provider
- **Migrazione** automatica da schema legacy

### `js/narrative-master.js` (318 righe)
Narrative Engine con Compass (schema v1):
- **Tono**: epico, tragico, oscuro, leggero (rilevamento automatico dal testo)
- **Focus**: esplorazione, combattimento, dialogo, rivelazione, cliffhanger
- **Trame aperte** e **rami futuri** tracciati
- **Controllo contraddizioni** con registro
- **Beat proattivi**: il Master anticipa sviluppi ogni N turni
- **World tick**: contatore turni di mondo

### `js/game-director.js` (370 righe)
Direttore di gioco con stato mondiale:
- **Timeline** (max 60 eventi)
- **World moves** (max 40 mosse mondiali)
- **Pressures** (max 12 pressioni narrative, livelli 0-100)
- **Importanza** eventi: normal / high / critical
- **Visibilità**: visibile / nascosto

### `js/life-legacy.js` (526 righe)
Sistema di crescita personaggio:
- **6 domini**: Corpo 💪, Mente 🧠, Relazioni 🤝, Professione 🧰, Leadership 👑, Talento ✨
- **XP e livelli** (1-10, 100 XP per livello)
- **Milestone** (max 30)
- **Timeline** personale (max 80 eventi)
- **Schema v1** con migrazione

### `js/campaign-vault.js` (225 righe)
Sistema di salvataggio:
- **Save/Load** campagne con capacità default 3 slot
- **Backup/Restore** con export/import JSON
- **Hash** di integrità (FNV-1a)
- **Sanitizzazione** automatica di chiavi API/token/secret nei backup
- **Limite backup** 10 MB

### `js/campaign-profile.js` (187 righe)
Profili di campagna configurabili:
- **5 toni**: Eroico, Oscuro, Realistico, Avventuroso, Leggero
- **5 focus**: Bilanciato, Interpretazione, Esplorazione, Tattico, Management
- Ogni combinazione genera direttive narrative specifiche

### `js/experience-v7.js` (351 righe)
Esperienza utente e onboarding:
- **Wizard 4 step**: Storia, Eroe, Stile, Destino
- **Thinking messages** durante l'attesa
- **Auto-scroll** intelligente
- **Persistenza** stato wizard in localStorage

### `js/ollama-cloud.js` (282 righe)
Client Ollama Cloud:
- **Catalogo modelli** hardcoded + merge dinamico da API
- **Fallback** automatico: Qwen 3.5 397B → DeepSeek V4 Flash → GPT-OSS 20B
- **Retry** su status 400/404/408/409/425/429/5xx
- **Parametri** per modello (temperature, topP, topK, contextSize)
- **Modelli personalizzati** via ID manuale

### `api/ollama/[action].js` (48 righe)
Proxy serverless Vercel:
- **Endpoint**: `/api/ollama/chat` (POST), `/api/ollama/tags` (GET)
- **CORS** aperto senza cookie
- **Auth passthrough**: inoltra `Authorization: Bearer` a `ollama.com/api`
- **Whitelist** azioni: solo `chat` e `tags`

### `css/experience-v7.css` (893 righe)
Stili dell'interfaccia, tema pergamena medievale.

---

## 🎨 Temi narrativi

6 generi selezionabili dal giocatore:
- ⚔️ **Fantasy** — Eroi, magia, regni
- 🌃 **Cyberpunk** — Neon, corporazioni, hacking
- 🤠 **Western** — Frontier, duelli, polvere
- 🚀 **Fantascienza** — Spazio, tecnologia, alieni
- ☢️ **Terre Desolate** — Post-apocalittico, sopravvivenza
- 🕵️ **Noir** — Indagini, mistero, ombre

---

## 🛠️ Verifica locale

```bash
# Test suite (567 righe)
npm test

# Sintassi check su tutti i moduli
npm run check
```

### Dipendenze
Nessuna dipendenza runtime. Solo Node.js per i test.

### Deploy
1. Fork o clone del repo
2. Deploy su Vercel (o hosting statico) — la cartella root è servibile direttamente
3. Configurare il proxy: il file `api/ollama/[action].js` è già pronto per Vercel
4. Il giocatore inserisce la propria API key Ollama Cloud nell'interfaccia

---

## 📁 Struttura

```
.
├── index.html                      # UI principale (singola pagina)
├── css/
│   └── experience-v7.css           # Stili, tema pergamena
├── js/
│   ├── memory-manager.js           # Memoria multilivello + retrieval
│   ├── narrative-master.js          # Narrative Engine + Compass
│   ├── game-director.js            # Timeline, world moves, pressures
│   ├── life-legacy.js              # XP, 6 domini, milestone
│   ├── campaign-vault.js           # Save/load, backup, hash
│   ├── campaign-profile.js        # Toni + focus narrativi
│   ├── experience-v7.js            # Wizard, thinking, auto-scroll
│   └── ollama-cloud.js             # Client multi-modello + fallback
├── api/ollama/
│   └── [action].js                 # Proxy serverless Vercel
├── tests/
│   ├── run-tests.js                # Test suite (memoria, narrative, ollama, director, vault)
│   └── check-html-script.js        # Verifica script tag in index.html
├── docs/
│   └── ARCHITETTURA_MEMORIA_MASTER_OLLAMA.md
├── LICENSE                         # MIT
├── README.md
└── package.json
```

---

## 🗺️ Roadmap

### ✅ Completato
- [x] Memoria multilivello con retrieval e compressione
- [x] Narrative Compass (tono, focus, contraddizioni, beat proattivi)
- [x] Game Director (timeline, world moves, pressures)
- [x] Life Legacy (6 domini XP, milestone, timeline)
- [x] Campaign Vault (save/load, backup, hash)
- [x] Campaign Profile (5 toni × 5 focus)
- [x] Multi-modello con fallback automatico
- [x] 6 temi narrativi
- [x] Test suite (567 righe)
- [x] LICENSE MIT

### 🔜 In sviluppo
- [ ] Dice Engine (tiri reali in codice)
- [ ] Tool System / function-calling
- [ ] Game Clock deterministico
- [ ] Home Hub con card avventure salvate
- [ ] Daily Puzzle
- [ ] Rulepack YAML data-driven
- [ ] NPC Isolation
- [ ] Battle Report strutturato
- [ ] Structured Output JSON
- [ ] Temi visivi multi-genere (CSS variables)
- [ ] Session Recap automatico
- [ ] Mappe SVG dinamiche
- [ ] Skill System (SKILL.md)
- [ ] Forge (AI genera contenuti)

---

## 📚 Documentazione

- [Architettura Memoria Master Ollama](docs/ARCHITETTURA_MEMORIA_MASTER_OLLAMA.md) — Design della memoria multilivello

---

## 🤝 Contribuire

Pull request benvenute! Apri prima un issue per discutere le modifiche proposte.

1. Fork del repo
2. Branch feature (`git checkout -b feature/nome-feature`)
3. Commit (`git commit -m 'Aggiunge feature'`)
4. Push (`git push origin feature/nome-feature`)
5. Apri una Pull Request

### Convenzioni
- Nessuna dipendenza runtime: vanilla JS, stdlib Node per i test
- UMD module pattern per ogni modulo (`(function(root, factory) { ... })`)
- Testabili in Node.js senza browser
- Italiano per i commenti e la documentazione

---

## 📄 Licenza

[MIT](LICENSE) © 2026 Andrea Cannas
