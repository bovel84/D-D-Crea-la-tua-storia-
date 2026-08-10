(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const EVENT_SCHEMA_VERSION = 4;
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
        const summary = cleanText(input.summary || input.description || input.fact, 280);
        if (!summary) return null;
        const turnValue = Number(input.turn ?? context.turn ?? 0);
        const type = classifyEvent(input.type || summary);
        const title = cleanText(input.title, 100) || deriveTitle(summary);
        const location = cleanText(input.location || context.location, 100);
        const actors = parseActors(input.actors).length
            ? parseActors(input.actors)
            : inferActors(`${title} ${summary}`, context.knownActors);
        const consequence = cleanText(input.consequence, 260);
        const cause = cleanText(input.cause || input.causedBy, 320);
        const historicalAnchor = cleanText(input.historicalAnchor || input.historicalContext, 280);
        const politicalShift = cleanText(input.politicalShift || input.powerShift, 300);
        const stakes = cleanText(input.stakes, 260);
        const conversationGoal = cleanText(input.conversationGoal || input.agenda, 260);
        const importance = normalizeImportance(input.importance, `${title} ${summary} ${consequence}`);
        const status = normalizeStatus(input.status);
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
            conversationMode: normalizeConversationMode(input.conversationMode, type, actors, conversationGoal),
            occurredAt: cleanText(input.occurredAt || input.date || input.moment || context.occurredAt || context.timePassage?.endDate, 100),
            choice: cleanText(input.choice || context.choice, 240),
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
        const parts = String(body == null ? '' : body).split('|').map(part => cleanText(part, 320));
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
            conversationGoal: parts[13],
            conversationMode: parts[14]
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
        return events.slice(0, 6);
    }

    function migrateEvents(events, context = {}) {
        return asArray(events)
            .map(event => normalizeEvent(event, { ...context, source: event?.source || 'legacy' }))
            .filter(Boolean)
            .slice(-MAX_EVENTS);
    }

    function richerText(current, incoming) {
        const left = cleanText(current, 320);
        const right = cleanText(incoming, 320);
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
        const eventCount = passage ? 'da 2 a 6' : 'da 1 a 3';
        const recentChoices = asArray(context.recentChoices)
            .map(choice => cleanText(typeof choice === 'string' ? choice : choice?.summary || choice?.description, 220))
            .filter(Boolean)
            .slice(-5);
        const passageDirective = passage
            ? `\n⏳ PERIODO DA NARRARE: ${cleanText(passage.description, 120)}.
- Non saltare direttamente alla scena finale: crea un breve montaggio cronologico dell'intero periodo.
- Mostra la normale vita del protagonista (sonno, pasti, lavoro, relazioni) senza elencare ogni gesto ripetitivo.
- Distribuisci da 2 a ${Math.min(6, Math.max(3, Math.ceil(Number(passage.days || 1) / 7) + 2))} EVENTO significativi in momenti diversi del periodo e raccontane cause e conseguenze.
- Resoconto già simulato dal motore, da rispettare: ${cleanText(passage.summary, 300)}\n`
            : `\n- Se fai trascorrere almeno un giorno con [TEMPO], narra ciò che accade durante il periodo in ordine cronologico: il protagonista dorme, mangia e vive normalmente. Registra da 2 a 6 EVENTO significativi distribuiti nel periodo, non soltanto lo stato finale.\n`;
        return `📜 **CRONACA STRUTTURATA DEL MONDO**
- Dopo la narrazione registra ${eventCount} fatti che sono diventati veri in questo turno. Un fatto causale = un tag.
- Formato completo obbligatorio per i nuovi tag:
  [EVENTO: tipo|titolo|fatto_accaduto|luogo|entità_separate_da_virgola|conseguenza_persistente|normal/high/critical|active/developing/resolved|data_o_momento|causa_precisa|ancoraggio_storico|spostamento_politico|posta_in_gioco|obiettivo_conversazione|available/required/none]
- Tipi ammessi: ${EVENT_TYPES.join(', ')}.
- Usa active quando una minaccia, un impegno o una conseguenza resta aperta; developing quando sta evolvendo; resolved quando il fatto è concluso.
- Registra l'ESITO realmente narrato, non l'intenzione del giocatore, un'ipotesi, una scelta non ancora compiuta o informazioni hidden del Simulatore.
- Il titolo deve distinguere l'evento; il fatto deve dire chi ha fatto cosa; la conseguenza deve indicare cosa i turni futuri dovranno rispettare. Causa, ancoraggio storico e spostamento politico spiegano perché il fatto è centrale. Evita categorie anonime come «l'Autorità» o «l'Opposizione» quando esistono nomi e istituzioni precise. Se non c'è conseguenza persistente scrivi «nessuna».
- Ogni evento deve avere una data o un momento concreto coerente con il periodo. Deve essere una conseguenza delle scelte recenti quando esiste un legame causale: ${recentChoices.length ? recentChoices.join(' / ') : 'nessuna scelta recente registrata'}.
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
