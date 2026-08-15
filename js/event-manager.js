(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const EVENT_SCHEMA_VERSION = 6;
    const MAX_EVENTS = 100;
    const EVENT_TYPES = [
        'conflitto', 'scoperta', 'relazione', 'decisione', 'missione', 'economia',
        'politica', 'pericolo', 'viaggio', 'personale', 'mondo'
    ];
    const IMPORTANCE_RANK = { normal: 0, high: 1, critical: 2 };

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function cleanText(value, maxLength = 240) {
        return String(value == null ? '' : value)
            .replace(/[\[\]]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength);
    }

    function normalizeKey(value) {
        return cleanText(value, 500)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeImportance(value, text = '') {
        const key = normalizeKey(value);
        if (/critical|critico|cruciale|epocale/.test(key)) return 'critical';
        if (/high|alto|importante|grave/.test(key)) return 'high';
        const corpus = normalizeKey(text);
        if (/morte|uccis|guerra|assedio|tradimento|catastrofe|regno cadut|missione fallita/.test(corpus)) return 'critical';
        if (/alleanza|vittoria|sconfitta|segreto|scoperta|incendio|rapimento|missione completata/.test(corpus)) return 'high';
        return 'normal';
    }

    function normalizeStatus(value) {
        const key = normalizeKey(value);
        if (/unresolved|irrisolto|active|attivo|aperto/.test(key)) return 'active';
        if (/resolved|risolto|concluso|completed|completato|closed|chiuso/.test(key)) return 'resolved';
        if (/developing|evolving|sviluppo|evoluzione|pending|in corso/.test(key)) return 'developing';
        return 'resolved';
    }

    function normalizeConversationMode(value, type, actors, goal) {
        const key = normalizeKey(value);
        if (/none|nessuna|vietat|impossibil/.test(key)) return 'none';
        if (/required|obbligator|urgent|necessar/.test(key)) return 'required';
        if (/available|open|aperta|possibil|optional/.test(key)) return 'available';
        if (cleanText(goal, 20)) return 'available';
        return asArray(actors).length >= 2 && /politica|relazione|economia|decisione|conflitto|missione/.test(type)
            ? 'available'
            : 'none';
    }

    function isConversationModeToken(value) {
        return /^(available|required|none|open|aperta|possibile|obbligatoria|nessuna)$/.test(normalizeKey(value));
    }

    function isInteractionModeToken(value) {
        return /^(dialogue|dialogo|action|azione|either|entrambi|none|nessuna)$/.test(normalizeKey(value));
    }

    function normalizeInteractionMode(value, conversationMode) {
        const key = normalizeKey(value);
        if (/either|entramb|scelta|dialogo o azione/.test(key)) return 'either';
        if (/dialog|chat|parl|negozi|riunione|udienza/.test(key)) return 'dialogue';
        if (/action|azione|agire|missione|intervento/.test(key)) return 'action';
        if (/none|nessun|automatic/.test(key)) return 'none';
        return conversationMode === 'required' ? 'dialogue' : conversationMode === 'available' ? 'either' : 'none';
    }

    function classifyEvent(value) {
        const key = normalizeKey(value);
        const aliases = {
            combattimento: 'conflitto', battaglia: 'conflitto', combat: 'conflitto', conflict: 'conflitto',
            rivelazione: 'scoperta', discovery: 'scoperta', esplorazione: 'scoperta',
            incontro: 'relazione', sociale: 'relazione', relationship: 'relazione',
            scelta: 'decisione', choice: 'decisione', morale: 'decisione',
            quest: 'missione', obiettivo: 'missione', mission: 'missione',
            commercio: 'economia', business: 'economia', economic: 'economia',
            regno: 'politica', diplomazia: 'politica', political: 'politica',
            minaccia: 'pericolo', tragedia: 'pericolo', danger: 'pericolo',
            viaggio: 'viaggio', travel: 'viaggio',
            crescita: 'personale', personal: 'personale',
            ambientale: 'mondo', world: 'mondo'
        };
        if (EVENT_TYPES.includes(key)) return key;
        if (aliases[key]) return aliases[key];
        if (/combatt|battaglia|duello|attacc|sconfitt|vittoria|ferit|uccis/.test(key)) return 'conflitto';
        if (/scopert|trov|rivel|indizio|segreto|esplorat/.test(key)) return 'scoperta';
        if (/allean|incontr|amic|relazion|promess|negozia|fiducia/.test(key)) return 'relazione';
        if (/decis|scelt|risparmi|rifiut|accett|sacrific/.test(key)) return 'decisione';
        if (/quest|mission|obiettiv|incaric|completat|fallita/.test(key)) return 'missione';
        if (/vend|compr|guadagn|perdit|negozio|contratt|debito|denaro/.test(key)) return 'economia';
        if (/regno|legge|fazione|diplom|sovran|rivolta|decreto/.test(key)) return 'politica';
        if (/pericol|minacc|incend|tempesta|epidemi|rapiment|traged/.test(key)) return 'pericolo';
        if (/viaggi|partit|arrivat|raggiunt|trasferit/.test(key)) return 'viaggio';
        if (/livello|abilit|crescita|guarit|ferita personale/.test(key)) return 'personale';
        return 'mondo';
    }

    function deriveTitle(summary) {
        const text = cleanText(summary, 240)
            .replace(/^(il|la|lo|i|gli|le|un|una)\s+/i, '')
            .replace(/[.!?]+$/g, '');
        if (!text) return 'Evento senza titolo';
        const words = text.split(' ');
        const title = words.slice(0, 8).join(' ');
        return title.charAt(0).toUpperCase() + title.slice(1);
    }

    function parseActors(value) {
        const seen = new Set();
        return cleanText(value, 320)
            .split(/[,;]/)
            .map(item => cleanText(item, 100))
            .filter(item => {
                const key = normalizeKey(item);
                if (!key || key === 'nessuno' || key === 'nessuna' || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 8);
    }

    function inferActors(summary, knownActors) {
        const corpus = normalizeKey(summary);
        return asArray(knownActors)
            .map(actor => cleanText(typeof actor === 'string' ? actor : actor?.name, 100))
            .filter(Boolean)
            .filter(name => corpus.includes(normalizeKey(name)))
            .slice(0, 8);
    }

    function fingerprintOf(event) {
        return normalizeKey(`${event.type || ''}|${event.title || ''}|${event.summary || ''}|${event.location || ''}`);
    }

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function normalizeEvent(source, context = {}) {
        const input = source && typeof source === 'object' ? source : { summary: source };
        const summary = cleanText(input.summary || input.description || input.fact, 1600);
        if (!summary) return null;
        const turnValue = Number(input.turn ?? context.turn ?? 0);
        const type = classifyEvent(input.type || summary);
        const title = cleanText(input.title, 100) || deriveTitle(summary);
        const location = cleanText(input.location || context.location, 100);
        const actors = parseActors(input.actors).length
            ? parseActors(input.actors)
            : inferActors(`${title} ${summary}`, context.knownActors);
        const consequence = cleanText(input.consequence, 1000);
        const cause = cleanText(input.cause || input.causedBy, 800);
        const historicalAnchor = cleanText(input.historicalAnchor || input.historicalContext, 800);
        const politicalShift = cleanText(input.politicalShift || input.powerShift, 900);
        const stakes = cleanText(input.stakes, 700);
        const rawConversationGoal = input.conversationGoal || input.agenda;
        const shiftedConversationMode = isConversationModeToken(rawConversationGoal) ? rawConversationGoal : input.conversationMode;
        const shiftedInteractionMode = isConversationModeToken(rawConversationGoal) && isInteractionModeToken(input.conversationMode)
            ? input.conversationMode
            : input.interactionMode;
        const conversationGoal = isConversationModeToken(rawConversationGoal)
            ? ''
            : cleanText(rawConversationGoal, 700);
        const importance = normalizeImportance(input.importance, `${title} ${summary} ${consequence}`);
        const status = normalizeStatus(input.status);
        const conversationMode = normalizeConversationMode(shiftedConversationMode, type, actors, conversationGoal);
        const event = {
            ...input,
            eventSchemaVersion: EVENT_SCHEMA_VERSION,
            type,
            title,
            summary,
            location,
            actors,
            consequence,
            cause,
            historicalAnchor,
            politicalShift,
            stakes,
            conversationGoal,
            conversationMode,
            interactionMode: normalizeInteractionMode(shiftedInteractionMode, conversationMode),
            occurredAt: cleanText(input.occurredAt || input.date || input.moment || context.occurredAt || context.timePassage?.endDate, 100),
            choice: cleanText(input.choice || context.choice, 600),
            importance,
            status,
            turn: Number.isFinite(turnValue) ? Math.max(0, Math.trunc(turnValue)) : 0,
            source: cleanText(input.source || context.source || 'llm', 40)
        };
        event.fingerprint = fingerprintOf(event);
        event.id = cleanText(input.id, 140) || `event-${event.turn}-${hashText(event.fingerprint)}`;
        return event;
    }

    function parseEventBody(body, context = {}) {
        const limits = [80, 140, 1600, 140, 500, 1000, 40, 40, 140, 800, 800, 900, 700, 700, 40, 40];
        const parts = String(body == null ? '' : body).split('|')
            .map((part, index) => cleanText(part, limits[index] || 700));
        if (!parts[0]) return null;
        if (parts.length === 1) {
            return normalizeEvent({ summary: parts[0], source: 'llm-legacy' }, context);
        }
        if (parts.length === 2 && /^(normal|high|critical|normale|alto|critico)$/i.test(parts[1])) {
            return normalizeEvent({ summary: parts[0], importance: parts[1], source: 'llm-legacy' }, context);
        }
        if (parts.length === 2) {
            return normalizeEvent({ type: parts[0], summary: parts[1] }, context);
        }
        const optionalStart = 12;
        let interactionIndex = -1;
        let conversationIndex = -1;
        for (let index = parts.length - 1; index >= optionalStart; index--) {
            if (interactionIndex < 0 && isInteractionModeToken(parts[index])) {
                interactionIndex = index;
                continue;
            }
            if (conversationIndex < 0 && isConversationModeToken(parts[index])) {
                conversationIndex = index;
                break;
            }
        }
        const conversationGoal = conversationIndex === 13 ? '' : parts[13];
        return normalizeEvent({
            type: parts[0],
            title: parts[1],
            summary: parts[2],
            location: parts[3],
            actors: parts[4],
            consequence: parts[5],
            importance: parts[6],
            status: parts[7],
            occurredAt: parts[8],
            cause: parts[9],
            historicalAnchor: parts[10],
            politicalShift: parts[11],
            stakes: parts[12],
            conversationGoal,
            conversationMode: conversationIndex >= 0 ? parts[conversationIndex] : parts[14],
            interactionMode: interactionIndex >= 0 ? parts[interactionIndex] : parts[15]
        }, context);
    }

    function chronicleFallback(response, context = {}) {
        const match = String(response || '').match(/\[CRONISTA:\s*([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]/i);
        if (!match) return null;
        return normalizeEvent({
            title: match[1],
            summary: match[2],
            importance: match[3],
            source: 'cronista-fallback'
        }, context);
    }

    function parseNarrativeTags(response, context = {}) {
        const text = String(response == null ? '' : response);
        const events = [];
        const seen = new Set();
        const eventRe = /\[EVENTO:\s*([^\]]+)\]/gi;
        let match;
        while ((match = eventRe.exec(text)) !== null) {
            const event = parseEventBody(match[1], context);
            if (!event || seen.has(event.fingerprint)) continue;
            seen.add(event.fingerprint);
            events.push(event);
        }
        if (!events.length && context.includeChronicleFallback !== false) {
            const fallback = chronicleFallback(text, context);
            if (fallback) events.push(fallback);
        }
        return events.slice(0, 1);
    }

    function migrateEvents(events, context = {}) {
        return asArray(events)
            .map(event => normalizeEvent(event, { ...context, source: event?.source || 'legacy' }))
            .filter(Boolean)
            .slice(-MAX_EVENTS);
    }

    function richerText(current, incoming) {
        const left = cleanText(current, 1600);
        const right = cleanText(incoming, 1600);
        return right.length > left.length ? right : left;
    }

    function mergeImportance(current, incoming) {
        const left = normalizeImportance(current);
        const right = normalizeImportance(incoming);
        return IMPORTANCE_RANK[right] > IMPORTANCE_RANK[left] ? right : left;
    }

    function recordEvents(currentEvents, incomingEvents, context = {}) {
        const requestedLimit = Number(context.maxEvents || MAX_EVENTS);
        const limit = Number.isFinite(requestedLimit) ? Math.max(10, requestedLimit) : MAX_EVENTS;
        const ledger = migrateEvents(currentEvents, context);
        const added = [];
        const updated = [];
        asArray(incomingEvents).forEach(rawEvent => {
            const incoming = normalizeEvent(rawEvent, context);
            if (!incoming) return;
            const duplicate = [...ledger].reverse().find(event =>
                event.fingerprint === incoming.fingerprint && event.turn === incoming.turn
            );
            if (duplicate) {
                duplicate.actors = [...new Set([...asArray(duplicate.actors), ...incoming.actors])].slice(0, 8);
                duplicate.consequence = richerText(duplicate.consequence, incoming.consequence);
                duplicate.cause = richerText(duplicate.cause, incoming.cause);
                duplicate.historicalAnchor = richerText(duplicate.historicalAnchor, incoming.historicalAnchor);
                duplicate.politicalShift = richerText(duplicate.politicalShift, incoming.politicalShift);
                duplicate.stakes = richerText(duplicate.stakes, incoming.stakes);
                duplicate.conversationGoal = richerText(duplicate.conversationGoal, incoming.conversationGoal);
                if (incoming.conversationMode !== 'none') duplicate.conversationMode = incoming.conversationMode;
                duplicate.importance = mergeImportance(duplicate.importance, incoming.importance);
                duplicate.status = incoming.status || duplicate.status;
                duplicate.updatedAtTurn = incoming.turn;
                duplicate.mentions = Math.max(1, Number(duplicate.mentions || 1)) + 1;
                updated.push(duplicate);
                return;
            }
            ledger.push(incoming);
            added.push(incoming);
        });
        return {
            events: ledger.slice(-limit),
            added,
            updated,
            changed: added.length > 0 || updated.length > 0
        };
    }

    function formatEvent(event, options = {}) {
        const item = normalizeEvent(event, { source: event?.source || 'memory' });
        if (!item) return '';
        const prefix = options.compact ? '' : `[${item.type} · ${item.importance} · ${item.status}] `;
        const place = item.location ? ` @ ${item.location}` : '';
        const actors = item.actors.length ? ` · ${item.actors.join(', ')}` : '';
        const consequence = item.consequence ? ` → ${item.consequence}` : '';
        const shift = item.politicalShift ? ` ⇄ ${item.politicalShift}` : '';
        return `${prefix}${item.title}: ${item.summary}${place}${actors}${consequence}${shift}`;
    }

    function buildPrompt(context = {}) {
        const recent = migrateEvents(context.recentEvents || [], context).slice(-5);
        const recentText = recent.length
            ? recent.map(event => `- ${event.title}: ${event.summary}`).join('\n')
            : '- Nessun evento precedente.';
        const questNames = asArray(context.activeQuests)
            .map(quest => cleanText(typeof quest === 'string' ? quest : quest?.name, 100))
            .filter(Boolean)
            .slice(0, 5)
            .join(', ') || 'nessuna';
        const passage = context.timePassage && Number(context.timePassage.elapsed) > 0
            ? context.timePassage
            : null;
        const eventCount = 'esattamente 1';
        const recentChoices = asArray(context.recentChoices)
            .map(choice => cleanText(typeof choice === 'string' ? choice : choice?.summary || choice?.description, 220))
            .filter(Boolean)
            .slice(-5);
        const passageDirective = passage
            ? `\n⏳ PERIODO DA CONSIDERARE: ${cleanText(passage.description, 120)}.
- Il tempo serve soltanto a datare il fatto: non genera fame, energia, pasti, sonno o eventi tecnici.
- Registra soltanto il PRIMO evento importante del periodo. Questo evento chiude il ciclo corrente.
- Resoconto temporale del motore: ${cleanText(passage.summary, 300)}\n`
            : `\n- Se fai trascorrere del tempo con [TEMPO], usalo soltanto per datare il primo evento importante. Non creare eventi successivi automatici.\n`;
        return `📜 **CRONACA STRUTTURATA DEL MONDO**
- Dopo la narrazione registra ${eventCount} fatto diventato vero in questo turno. Un fatto causale = un tag.
- Formato completo obbligatorio per i nuovi tag:
  [EVENTO: tipo|titolo|fatto_accaduto|luogo|entità_separate_da_virgola|conseguenza_persistente|normal/high/critical|active/developing/resolved|data_o_momento|causa_precisa|ancoraggio_storico|spostamento_politico|posta_in_gioco|obiettivo_conversazione|available/required/none|dialogue/action/either/none]
- Tipi ammessi: ${EVENT_TYPES.join(', ')}.
- Usa active quando una minaccia, un impegno o una conseguenza resta aperta; developing quando sta evolvendo; resolved quando il fatto è concluso.
- Registra l'ESITO realmente narrato, non l'intenzione del giocatore, un'ipotesi, una scelta non ancora compiuta o informazioni hidden del Simulatore.
- Il titolo deve distinguere l'evento; il fatto deve dire chi ha fatto cosa; la conseguenza deve indicare cosa i turni futuri dovranno rispettare. Causa, ancoraggio storico e spostamento politico spiegano perché il fatto è centrale. Evita categorie anonime come «l'Autorità» o «l'Opposizione» quando esistono nomi e istituzioni precise. Se non c'è conseguenza persistente scrivi «nessuna».
  - Ogni EVENTO deve descrivere un delta completo: situazione precedente, azione con leva concreta, reazione di un soggetto registrato e nuova realtà osservabile. Nomina il luogo specifico e la risorsa effettivamente usata.
  - Non sono eventi validi «la situazione cambia», «gli equilibri cambiano», «rafforza la propria posizione», «deve decidere se reagire» o una semplice intenzione. Indica invece chi ottiene o perde accesso, controllo, denaro, uomini, informazioni, tempo, fiducia o libertà d'azione.
  - Scrivi il fatto in 3-5 frasi complete e la conseguenza in 1-2 frasi complete. Chiudi ogni frase e ogni campo prima del separatore |: nessun testo può terminare a metà.
  - L'unico evento deve avere una data o un momento concreto coerente con il periodo. Deve essere una conseguenza delle scelte recenti quando esiste un legame causale: ${recentChoices.length ? recentChoices.join(' / ') : 'nessuna scelta recente registrata'}.
  - Usa interaction dialogue se richiede una risposta parlata, action se richiede un'azione del protagonista, either se ammette entrambe, none se non richiede intervento.
  - Apri una conversazione required soltanto quando una risposta pronunciata è indispensabile allo scopo immediato. Non aprirla per una conseguenza già compiuta o per chiedere al giocatore di ripetere una decisione.
  - Non emettere CODA_EVENTO: conseguenze e pressioni aggiornano il mondo, ma non generano automaticamente un altro evento.
- EVENTO alimenta la cronaca ma non sostituisce i tag di stato: se il fatto cambia soldi, inventario, NPC, quest, attività o regno emetti nello stesso turno anche il relativo tag MECCANICA, LOOT, NPC, QUEST, *_NEGOZIO o *_REGNO.
- Usa i nomi esatti già presenti nella memoria. Non inserire il carattere | o ] nei valori. Non duplicare eventi recenti e non spezzare lo stesso fatto in tag ripetitivi.
- Collega gli eventi a missioni e persone solo quando la scena li modifica davvero. Missioni attive: ${questNames}. Posizione attuale: ${cleanText(context.location, 100) || 'Sconosciuta'}.
- Esempio: [EVENTO: relazione|Il patto del porto|Elara accetta di aiutare il protagonista|Porto Vecchio|Elara, protagonista|Elara preparerà una barca entro l'alba|high|active|12 marzo, sera|La flotta di Varos chiude la rotta settentrionale|La crisi di successione divide il Consiglio di Daran|Elara lega la propria rete diplomatica al protagonista|Partire prima del blocco|Definire garanzie e rotta|available]
- Esempio: [EVENTO: conflitto|Agguato respinto|Il protagonista mette in fuga i briganti della strada|Via del Mulino|protagonista, briganti|La via torna percorribile ma un brigante è fuggito|high|developing|giorno 3 del periodo]
${passageDirective}

EVENTI RECENTI DA NON DUPLICARE:
${recentText}`;
    }

    class EventManager {
        constructor(options = {}) {
            this.options = { maxEvents: MAX_EVENTS, ...options };
        }

        migrate(events, context) { return migrateEvents(events, context); }
        parse(response, context) { return parseNarrativeTags(response, context); }
        record(events, incoming, context) {
            return recordEvents(events, incoming, { maxEvents: this.options.maxEvents, ...(context || {}) });
        }
        create(event, context) { return normalizeEvent(event, context); }
        format(event, options) { return formatEvent(event, options); }
        buildPrompt(context) { return buildPrompt(context); }
    }

    return {
        EVENT_SCHEMA_VERSION,
        MAX_EVENTS,
        EVENT_TYPES,
        EventManager,
        cleanText,
        normalizeImportance,
        normalizeStatus,
        normalizeInteractionMode,
        classifyEvent,
        normalizeEvent,
        parseEventBody,
        parseNarrativeTags,
        migrateEvents,
        recordEvents,
        formatEvent,
        buildPrompt
    };
});
