(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheWorldGenerator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const GENERATOR_SCHEMA_VERSION = 1;
    const MAP_W = 1000;
    const MAP_H = 650;

    // ─── Helpers ───────────────────────────────────────────

    function clean(value, max = 500) {
        const text = String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return text.length > max ? text.slice(0, max).trim() + '…' : text;
    }

    function keyOf(value) {
        return clean(value, 500)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function clampNum(value, min, max, fallback) {
        const n = Number(String(value == null ? '' : value).replace(',', '.'));
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function hashStr(value) {
        let h = 2166136261;
        const t = String(value || '');
        for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    // ─── Prompt builder ────────────────────────────────────
    // Asks the LLM to produce a complete world as a single JSON object.
    // The world must follow a strict geographic hierarchy:
    //   Continente → Nazione → Regione → Luogo
    // Each location has explicit x,y coordinates on a 1000×650 canvas.
    // Each NPC is resident in a specific location.
    // Each faction controls one or more nations/regions.

    function buildGenerationPrompt(story, context) {
        const s = story || {};
        const ctx = context || {};
        const title = clean(s.title, 120);
        const genre = clean(s.genre, 40) || 'fantasy';
        const setting = clean(s.setting, 160);
        const desc = clean(s.desc, 800);
        const difficulty = clean(s.difficulty, 20) || 'normal';
        const startTime = s.startTime || {};
        const dateStr = `${startTime.day || 1}/${startTime.month || 1}/${startTime.year || 1400}`;
        const idea = clean(ctx.idea || s.desc, 700);
        const protagonistName = clean(ctx.protagonistName, 100);

        return [
            'Sei un world-builder esperto. Crea un mondo completo e coerente per un GDR narrativo.',
            'Restituisci ESCLUSIVAMENTE un oggetto JSON valido — niente markdown, niente commenti, niente testo fuori dal JSON.',
            '',
            '=== PARAMETRI DELLA CAMPAGNA ===',
            `Titolo: ${title || 'da inventare'}`,
            `Genere: ${genre}`,
            `Ambientazione: ${setting || 'libera'}`,
            `Difficoltà: ${difficulty}`,
            `Data di inizio: ${dateStr}`,
            `Idea del giocatore: ${idea || 'nessuna idea aggiuntiva'}`,
            protagonistName ? `Protagonista: ${protagonistName} (NON includerlo negli NPC)` : '',
            '',
            '=== STRUTTURA GEOGRAFICA OBBLIGATORIA ===',
            'Il mondo deve seguire questa gerarchia: Continente → Nazione → Regione → Luogo.',
            '1-3 continenti. Ogni continente ha 2-6 nazioni. Ogni nazione ha 2-5 regioni. Ogni regione ha 1-4 luoghi.',
            'Totale luoghi: minimo 8, massimo 20.',
            '',
            '=== COORDINATE ===',
            `Ogni luogo ha coordinate x (0-${MAP_W}) e y (0-${MAP_H}) sulla mappa.`,
            'I luoghi nella stessa regione devono essere vicini tra loro (distanza < 200).',
            'I luoghi in nazioni confinanti devono essere raggiungibili (distanza < 400).',
            'Distribuisci i luoghi su tutta la mappa, non ammucchiati in un angolo.',
            '',
            '=== FAZIONI ===',
            '3-8 fazioni. Ogni fazione controlla almeno una nazione o regione (campo territory).',
            'La fazione più potente controlla la nazione dove inizia il protagonista.',
            'Ogni fazione ha leader, ideologia, forza militare, intelligence, ostilità verso il protagonista.',
            '',
            '=== NPC ===',
            '6-15 NPC. Ogni NPC risiede in un luogo specifico (campo location deve corrispondere a un nome di luogo esistente).',
            'Ogni NPC ha: ruolo, fazione, personalità, obiettivo pubblico, obiettivo privato, strategia, risorse, influenza, conoscenze, agenda.',
            'Almeno 2 NPC alleati, 2 avversari, 2 neutrali verso il protagonista.',
            'Gli NPC devono avere nomi propri coerenti con l\'ambientazione (non generici).',
            '',
            '=== RELAZIONI ===',
            '5-12 relazioni tra fazioni e/o NPC. Includere alleanze, conflitti e tensioni.',
            '',
            '=== FORZE STORICHE ===',
            '3-6 forze in movimento nel mondo (conflitti in corso, crisi economiche, movimenti politici, ecc.).',
            'Ogni forza ha: attore responsabile, obiettivo, progresso 0-100, urgenza 0-100, causa, oppositori, conseguenza al 100%.',
            '',
            '=== SCHEMA JSON ===',
            '{',
            '  "worldName": "string",',
            '  "premise": "string (max 600)",',
            '  "centralConflict": "string (max 400)",',
            '  "stakes": "string (max 300)",',
            '  "continents": [',
            '    {',
            '      "name": "string",',
            '      "nations": [',
            '        {',
            '          "name": "string",',
            '          "government": "string",',
            '          "controllingFaction": "nome fazione",',
            '          "regions": [',
            '            {',
            '              "name": "string",',
            '              "terrain": "forest|mountain|plains|coast|desert|wetland|urban|tundra|volcanic",',
            '              "locations": [',
            '                {',
            '                  "name": "string",',
            '                  "type": "city|village|castle|port|temple|fortress|market|mine|farm|tavern|ruins|camp|monastery|bridge|crossroads",',
            '                  "x": number 0-1000,',
            '                  "y": number 0-650,',
            '                  "description": "string (max 300)",',
            '                  "resource": "string o vuoto",',
            '                  "danger": "string o vuoto",',
            '                  "connections": ["nome altro luogo", ...]',
            '                }',
            '              ]',
            '            }',
            '          ]',
            '        }',
            '      ]',
            '    }',
            '  ],',
            '  "factions": [',
            '    {',
            '      "name": "string",',
            '      "type": "kingdom|republic|guild|cult|tribe|corporation|military|criminal|rebellion",',
            '      "leader": "string",',
            '      "ideology": "string",',
            '      "base": "nome luogo",',
            '      "territory": "nome nazione o regione",',
            '      "description": "string (max 300)",',
            '      "goal": "string",',
            '      "strategy": "string",',
            '      "resources": "string",',
            '      "influence": number 0-100,',
            '      "militaryStrength": number 0-100,',
            '      "intelligence": number 0-100,',
            '      "hostility": number 0-100,',
            '      "legitimacy": number 0-100,',
            '      "tactics": "string",',
            '      "grievance": "string",',
            '      "nextMove": "string",',
            '      "relationship": "string"',
            '    }',
            '  ],',
            '  "npcs": [',
            '    {',
            '      "name": "string",',
            '      "role": "string",',
            '      "faction": "nome fazione o vuoto",',
            '      "location": "nome luogo esistente",',
            '      "description": "string (max 300)",',
            '      "personality": "string",',
            '      "goal": "string",',
            '      "publicGoal": "string",',
            '      "privateGoal": "string",',
            '      "strategy": "string",',
            '      "resources": "string",',
            '      "influence": number 0-100,',
            '      "knowledge": "string",',
            '      "agenda": "string",',
            '      "leverage": "string",',
            '      "constraints": "string",',
            '      "relationship": "string",',
            '      "gender": "string"',
            '    }',
            '  ],',
            '  "relations": [',
            '    { "from": "string", "to": "string", "type": "string", "trust": number 0-100, "tension": number 0-100, "description": "string" }',
            '  ],',
            '  "forces": [',
            '    { "name": "string", "actor": "string", "objective": "string", "progress": number 0-100, "urgency": number 0-100, "cause": "string", "opposition": ["string"], "consequenceAt100": "string" }',
            '  ],',
            '  "startLocation": "nome luogo dove inizia il protagonista"',
            '}',
            '',
            '=== REGOLE DI COERENZA ===',
            '- Ogni "location" negli NPC deve corrispondere a un nome di luogo nei continents.',
            '- Ogni "territory" nelle fazioni deve corrispondere a una nazione o regione esistente.',
            '- Ogni "base" nelle fazioni deve corrispondere a un luogo esistente.',
            '- Ogni "from" e "to" nelle relazioni deve corrispondere a una fazione o NPC esistente.',
            '- I "connections" dei luoghi devono riferirsi a luoghi esistenti.',
            '- Non usare nomi generici come "Autorità", "Opposizione", "Guida locale".',
            '- I nomi dei luoghi devono essere coerenti con l\'ambientazione e la lingua del genere.',
            protagonistName ? `- Non creare NPC con lo stesso nome del protagonista (${protagonistName}).` : '',
            '- Il startLocation deve essere un luogo esistente, idealmente nella nazione più stabile.',
            '- Tutti i campi numerici (influence, militaryStrength, ecc.) devono essere interi 0-100.',
            '- Il JSON deve essere valido e completo. Non troncare nessun array.'
        ].filter(Boolean).join('\n');
    }

    // ─── Split prompt: Phase 1 — Locations, Factions, Relations, Forces ───

    function buildLocationsPrompt(story, context) {
        const s = story || {};
        const ctx = context || {};
        const title = clean(s.title, 120);
        const genre = clean(s.genre, 40) || 'fantasy';
        const setting = clean(s.setting, 160);
        const desc = clean(s.desc, 800);
        const difficulty = clean(s.difficulty, 20) || 'normal';
        const startTime = s.startTime || {};
        const dateStr = `${startTime.day || 1}/${startTime.month || 1}/${startTime.year || 1400}`;
        const idea = clean(ctx.idea || s.desc, 700);
        const protagonistName = clean(ctx.protagonistName, 100);

        return [
            'Sei un world-builder esperto. Crea la struttura geografica e politica di un mondo per un GDR narrativo.',
            'Restituisci ESCLUSIVAMENTE un oggetto JSON valido — niente markdown, niente commenti, niente testo fuori dal JSON.',
            'NON includere NPC in questa risposta. Solo geografia, fazioni, relazioni e forze storiche.',
            '',
            '=== PARAMETRI DELLA CAMPAGNA ===',
            `Titolo: ${title || 'da inventare'}`,
            `Genere: ${genre}`,
            `Ambientazione: ${setting || 'libera'}`,
            `Difficoltà: ${difficulty}`,
            `Data di inizio: ${dateStr}`,
            `Idea del giocatore: ${idea || 'nessuna idea aggiuntiva'}`,
            protagonistName ? `Protagonista: ${protagonistName}` : '',
            '',
            '=== STRUTTURA GEOGRAFICA OBBLIGATORIA ===',
            'Il mondo deve seguire questa gerarchia: Continente → Nazione → Regione → Luogo.',
            '1-3 continenti. Ogni continente ha 2-6 nazioni. Ogni nazione ha 2-5 regioni. Ogni regione ha 1-4 luoghi.',
            'Totale luoghi: minimo 8, massimo 20.',
            '',
            '=== COORDINATE ===',
            `Ogni luogo ha coordinate x (0-${MAP_W}) e y (0-${MAP_H}) sulla mappa.`,
            'I luoghi nella stessa regione devono essere vicini tra loro (distanza < 200).',
            'I luoghi in nazioni confinanti devono essere raggiungibili (distanza < 400).',
            'Distribuisci i luoghi su tutta la mappa, non ammucchiati in un angolo.',
            '',
            '=== FAZIONI ===',
            '3-8 fazioni. Ogni fazione controlla almeno una nazione o regione (campo territory).',
            'La fazione più potente controlla la nazione dove inizia il protagonista.',
            'Ogni fazione ha leader, ideologia, forza militare, intelligence, ostilità verso il protagonista.',
            '',
            '=== RELAZIONI ===',
            '5-12 relazioni tra fazioni. Includere alleanze, conflitti e tensioni.',
            '',
            '=== FORZE STORICHE ===',
            '3-6 forze in movimento nel mondo (conflitti in corso, crisi economiche, movimenti politici, ecc.).',
            'Ogni forza ha: attore responsabile, obiettivo, progresso 0-100, urgenza 0-100, causa, oppositori, conseguenza al 100%.',
            '',
            '=== SCHEMA JSON ===',
            '{',
            '  "worldName": "string",',
            '  "premise": "string (max 600)",',
            '  "centralConflict": "string (max 400)",',
            '  "stakes": "string (max 300)",',
            '  "continents": [',
            '    {',
            '      "name": "string",',
            '      "nations": [',
            '        {',
            '          "name": "string",',
            '          "government": "string",',
            '          "controllingFaction": "nome fazione",',
            '          "regions": [',
            '            {',
            '              "name": "string",',
            '              "terrain": "forest|mountain|plains|coast|desert|wetland|urban|tundra|volcanic",',
            '              "locations": [',
            '                {',
            '                  "name": "string",',
            '                  "type": "city|village|castle|port|temple|fortress|market|mine|farm|tavern|ruins|camp|monastery|bridge|crossroads",',
            '                  "x": number 0-1000,',
            '                  "y": number 0-650,',
            '                  "description": "string (max 300)",',
            '                  "resource": "string o vuoto",',
            '                  "danger": "string o vuoto",',
            '                  "connections": ["nome altro luogo", ...]',
            '                }',
            '              ]',
            '            }',
            '          ]',
            '        }',
            '      ]',
            '    }',
            '  ],',
            '  "factions": [',
            '    {',
            '      "name": "string",',
            '      "type": "kingdom|republic|guild|cult|tribe|corporation|military|criminal|rebellion",',
            '      "leader": "string",',
            '      "ideology": "string",',
            '      "base": "nome luogo",',
            '      "territory": "nome nazione o regione",',
            '      "description": "string (max 300)",',
            '      "goal": "string",',
            '      "strategy": "string",',
            '      "resources": "string",',
            '      "influence": number 0-100,',
            '      "militaryStrength": number 0-100,',
            '      "intelligence": number 0-100,',
            '      "hostility": number 0-100,',
            '      "legitimacy": number 0-100,',
            '      "tactics": "string",',
            '      "grievance": "string",',
            '      "nextMove": "string",',
            '      "relationship": "string"',
            '    }',
            '  ],',
            '  "relations": [',
            '    { "from": "string", "to": "string", "type": "string", "trust": number 0-100, "tension": number 0-100, "description": "string" }',
            '  ],',
            '  "forces": [',
            '    { "name": "string", "actor": "string", "objective": "string", "progress": number 0-100, "urgency": number 0-100, "cause": "string", "opposition": ["string"], "consequenceAt100": "string" }',
            '  ],',
            '  "startLocation": "nome luogo dove inizia il protagonista"',
            '}',
            '',
            '=== REGOLE DI COERENZA ===',
            '- Ogni "territory" nelle fazioni deve corrispondere a una nazione o regione esistente.',
            '- Ogni "base" nelle fazioni deve corrispondere a un luogo esistente.',
            '- Ogni "from" e "to" nelle relazioni deve corrispondere a una fazione esistente.',
            '- I "connections" dei luoghi devono riferirsi a luoghi esistenti.',
            '- Non usare nomi generici come "Autorità", "Opposizione", "Guida locale".',
            '- I nomi dei luoghi devono essere coerenti con l\'ambientazione e la lingua del genere.',
            '- Il startLocation deve essere un luogo esistente, idealmente nella nazione più stabile.',
            '- Tutti i campi numerici (influence, militaryStrength, ecc.) devono essere interi 0-100.',
            '- Il JSON deve essere valido e completo. Non troncare nessun array.'
        ].filter(Boolean).join('\n');
    }

    // ─── Split prompt: Phase 2 — NPCs ──────────────────────

    function buildNpcPrompt(worldData, story, context) {
        const s = story || {};
        const ctx = context || {};
        const protagonistName = clean(ctx.protagonistName, 100);
        const genre = clean(s.genre, 40) || 'fantasy';
        const setting = clean(s.setting, 160);

        // Collect location names and faction names from the already-generated world
        const locNames = (worldData.locations || []).map(l => l.name).filter(Boolean);
        const facNames = (worldData.factions || []).map(f => f.name).filter(Boolean);
        const startLoc = worldData.startLocation || (locNames[0] || '');

        return [
            'Sei un world-builder esperto. Crea i personaggi non giocanti (NPC) per il mondo già generato di un GDR narrativo.',
            'Restituisci ESCLUSIVAMENTE un oggetto JSON valido contenente solo l\'array "npcs" e l\'array "relations".',
            'Niente markdown, niente commenti, niente testo fuori dal JSON.',
            '',
            '=== CONTESTO ===',
            `Genere: ${genre}`,
            `Ambientazione: ${setting || 'libera'}`,
            `Luogo di partenza del protagonista: ${startLoc}`,
            protagonistName ? `Protagonista: ${protagonistName} (NON includerlo negli NPC)` : '',
            '',
            '=== LUOGHI ESISTENTI ===',
            locNames.map((n, i) => `${i + 1}. ${n}`).join('\n'),
            '',
            '=== FAZIONI ESISTENTI ===',
            facNames.map((n, i) => `${i + 1}. ${n}`).join('\n'),
            '',
            '=== REQUISITI NPC ===',
            '6-15 NPC. Ogni NPC risiede in un luogo specifico (campo location deve essere uno dei luoghi elencati sopra).',
            'Ogni NPC ha: ruolo, fazione (una di quelle elencate o vuoto), personalità, obiettivo pubblico, obiettivo privato, strategia, risorse, influenza, conoscenze, agenda.',
            'Almeno 2 NPC alleati, 2 avversari, 2 neutrali verso il protagonista.',
            'Gli NPC devono avere nomi propri coerenti con l\'ambientazione (non generici).',
            'Almeno 2 NPC devono risiedere nel luogo di partenza del protagonista o nelle vicinanze.',
            '',
            '=== REQUISITI RELAZIONI ===',
            '3-8 relazioni tra NPC e/o tra NPC e fazioni. Includere alleanze, conflitti e tensioni.',
            '',
            '=== SCHEMA JSON ===',
            '{',
            '  "npcs": [',
            '    {',
            '      "name": "string",',
            '      "role": "string",',
            '      "faction": "nome fazione o vuoto",',
            '      "location": "nome luogo esistente",',
            '      "description": "string (max 300)",',
            '      "personality": "string",',
            '      "goal": "string",',
            '      "publicGoal": "string",',
            '      "privateGoal": "string",',
            '      "strategy": "string",',
            '      "resources": "string",',
            '      "influence": number 0-100,',
            '      "knowledge": "string",',
            '      "agenda": "string",',
            '      "leverage": "string",',
            '      "constraints": "string",',
            '      "relationship": "string",',
            '      "gender": "string"',
            '    }',
            '  ],',
            '  "relations": [',
            '    { "from": "string", "to": "string", "type": "string", "trust": number 0-100, "tension": number 0-100, "description": "string" }',
            '  ]',
            '}',
            '',
            '=== REGOLE ===',
            '- Ogni "location" negli NPC deve essere uno dei luoghi elencati sopra (match esatto).',
            '- Ogni "faction" negli NPC deve essere una delle fazioni elencate sopra o vuoto.',
            '- Ogni "from" e "to" nelle relazioni deve corrispondere a un NPC o fazione esistente.',
            protagonistName ? `- Non creare NPC con lo stesso nome del protagonista (${protagonistName}).` : '',
            '- Tutti i campi numerici devono essere interi 0-100.',
            '- Il JSON deve essere valido e completo. Non troncare nessun array.'
        ].filter(Boolean).join('\n');
    }

    // ─── JSON extraction ───────────────────────────────────

    function extractWorldJson(response) {
        const text = String(response || '').trim();
        // Try fenced JSON first
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fenced ? fenced[1].trim() : text;
        // Find outermost JSON object
        const first = candidate.indexOf('{');
        const last = candidate.lastIndexOf('}');
        if (first < 0 || last <= first) throw new Error('Il generatore non ha restituito JSON valido.');
        const jsonStr = candidate.slice(first, last + 1);
        return JSON.parse(jsonStr);
    }

    // ─── Validation ────────────────────────────────────────
    // Checks that the generated world has geographic consistency.

    function collectLocationNames(world) {
        const names = new Set();
        const locMap = new Map(); // keyOf(name) → { name, x, y, region, nation, continent }
        asArray(world.continents).forEach(cont => {
            const contName = clean(cont.name, 120);
            asArray(cont.nations).forEach(nation => {
                const natName = clean(nation.name, 120);
                asArray(nation.regions).forEach(region => {
                    const regName = clean(region.name, 120);
                    asArray(region.locations).forEach(loc => {
                        const locName = clean(loc.name, 120);
                        if (!locName) return;
                        const key = keyOf(locName);
                        names.add(locName);
                        locMap.set(key, {
                            name: locName,
                            x: clampNum(loc.x, 0, MAP_W, 500),
                            y: clampNum(loc.y, 0, MAP_H, 325),
                            region: regName,
                            nation: natName,
                            continent: contName,
                            terrain: clean(region.terrain, 40) || 'plains'
                        });
                    });
                });
            });
        });
        return { names, locMap };
    }

    function collectFactionNames(world) {
        const names = new Set();
        asArray(world.factions).forEach(f => {
            const name = clean(f.name, 120);
            if (name) names.add(name);
        });
        return names;
    }

    function collectNpcNames(world) {
        const names = new Set();
        asArray(world.npcs).forEach(n => {
            const name = clean(n.name, 120);
            if (name) names.add(name);
        });
        return names;
    }

    function validateHierarchy(world) {
        const errors = [];
        const warnings = [];
        const { names: locNames, locMap } = collectLocationNames(world);
        const factionNames = collectFactionNames(world);
        const npcNames = collectNpcNames(world);

        // Check minimums
        if (locNames.size < 8) errors.push(`Troppi pochi luoghi: ${locNames.size} (min 8).`);
        if (locNames.size > 20) warnings.push(`Troppi luoghi: ${locNames.size} (max 20).`);
        if (factionNames.size < 3) errors.push(`Troppi poche fazioni: ${factionNames.size} (min 3).`);
        if (npcNames.size < 6) errors.push(`Troppi pochi NPC: ${npcNames.size} (min 6).`);

        // Check NPC locations
        asArray(world.npcs).forEach(npc => {
            const loc = clean(npc.location, 120);
            if (loc && !locMap.has(keyOf(loc))) {
                errors.push(`NPC "${clean(npc.name, 80)}" riferimento a luogo inesistente: "${loc}".`);
            }
        });

        // Check faction territories and bases
        asArray(world.factions).forEach(faction => {
            const territory = clean(faction.territory, 120);
            const base = clean(faction.base, 120);
            if (territory && !locMap.has(keyOf(territory))) {
                // territory might be a nation/region name, not a location — that's ok
                // but warn if it doesn't match any nation or region either
                const allRegions = new Set();
                asArray(world.continents).forEach(c =>
                    asArray(c.nations).forEach(n =>
                        asArray(n.regions).forEach(r => allRegions.add(keyOf(r.name)))
                    )
                );
                const allNations = new Set();
                asArray(world.continents).forEach(c =>
                    asArray(c.nations).forEach(n => allNations.add(keyOf(n.name)))
                );
                if (!allRegions.has(keyOf(territory)) && !allNations.has(keyOf(territory))) {
                    warnings.push(`Fazione "${clean(faction.name, 80)}" territorio non trovato: "${territory}".`);
                }
            }
            if (base && !locMap.has(keyOf(base))) {
                warnings.push(`Fazione "${clean(faction.name, 80)}" base non trovata: "${base}".`);
            }
        });

        // Check relations
        const allActorNames = new Set([...factionNames, ...npcNames]);
        asArray(world.relations).forEach(rel => {
            const from = clean(rel.from, 120);
            const to = clean(rel.to, 120);
            if (from && !allActorNames.has(keyOf(from))) {
                warnings.push(`Relazione "from" non trovato: "${from}".`);
            }
            if (to && !allActorNames.has(keyOf(to))) {
                warnings.push(`Relazione "to" non trovato: "${to}".`);
            }
        });

        // Check connections reference existing locations
        locMap.forEach(loc => {
            // We don't have connections here at this level, skip
        });

        // Check startLocation
        const startLoc = clean(world.startLocation, 120);
        if (startLoc && !locMap.has(keyOf(startLoc))) {
            errors.push(`startLocation non trovato tra i luoghi: "${startLoc}".`);
        }

        // Check coordinate distribution
        const coords = [];
        locMap.forEach(loc => coords.push({ x: loc.x, y: loc.y, name: loc.name }));
        if (coords.length >= 3) {
            const xs = coords.map(c => c.x);
            const ys = coords.map(c => c.y);
            const xRange = Math.max(...xs) - Math.min(...xs);
            const yRange = Math.max(...ys) - Math.min(...ys);
            if (xRange < 300) warnings.push('Luoghi troppo vicini orizzontalmente. Distribuirli meglio.');
            if (yRange < 200) warnings.push('Luoghi troppo vicini verticalmente. Distribuirli meglio.');
        }

        return { errors, warnings, locMap, locNames, factionNames, npcNames };
    }

    // ─── Normalize to existing world schema ────────────────
    // Maps the generated JSON to the format used by world-bootstrap.js
    // so the rest of the engine can consume it without changes.

    function normalizeGeneratedWorld(generated, context) {
        const ctx = context || {};
        const { locMap } = collectLocationNames(generated);
        const turn = Math.max(0, Number(ctx.turn) || 0);

        // Build locations array (flat, with hierarchy metadata)
        const locations = [];
        locMap.forEach(loc => {
            locations.push({
                id: `gen-loc-${hashStr(loc.name).toString(36)}`,
                name: loc.name,
                type: '',
                region: loc.region,
                nation: loc.nation,
                continent: loc.continent,
                terrain: loc.terrain,
                description: '',
                controller: '',
                resource: '',
                danger: '',
                connections: [],
                x: loc.x,
                y: loc.y,
                status: 'active',
                createdAtTurn: turn,
                source: 'world-generator'
            });
        });

        // Enrich locations with details from the generated structure
        asArray(generated.continents).forEach(cont => {
            const contName = clean(cont.name, 120);
            asArray(cont.nations).forEach(nation => {
                const natName = clean(nation.name, 120);
                const ctrlFaction = clean(nation.controllingFaction, 120);
                asArray(nation.regions).forEach(region => {
                    const regName = clean(region.name, 120);
                    asArray(region.locations).forEach(loc => {
                        const locName = clean(loc.name, 120);
                        const key = keyOf(locName);
                        const existing = locations.find(l => keyOf(l.name) === key);
                        if (!existing) return;
                        existing.type = clean(loc.type, 60) || existing.type;
                        existing.description = clean(loc.description, 420);
                        existing.resource = clean(loc.resource, 160);
                        existing.danger = clean(loc.danger, 180);
                        existing.connections = asArray(loc.connections)
                            .map(c => clean(c, 120))
                            .filter(c => c && keyOf(c) !== key);
                        if (ctrlFaction) existing.controller = ctrlFaction;
                    });
                });
            });
        });

        // Build factions
        const factions = asArray(generated.factions).map(f => {
            const name = clean(f.name, 120);
            return {
                id: `gen-fac-${hashStr(name).toString(36)}`,
                kind: 'faction',
                name,
                type: clean(f.type, 80) || 'gruppo',
                leader: clean(f.leader, 120),
                description: clean(f.description, 420),
                goal: clean(f.goal, 300),
                strategy: clean(f.strategy, 260),
                resources: clean(f.resources, 240),
                ideology: clean(f.ideology, 220),
                legitimacy: clampNum(f.legitimacy, 0, 100, 50),
                leverage: clean(f.leverage || f.resources, 260),
                constraints: clean(f.constraints, 260),
                militaryStrength: clampNum(f.militaryStrength, 0, 100, 35),
                intelligence: clampNum(f.intelligence, 0, 100, 40),
                hostility: clampNum(f.hostility, 0, 100, 45),
                tactics: clean(f.tactics, 240),
                grievance: clean(f.grievance, 240),
                nextMove: clean(f.nextMove, 300),
                influence: clampNum(f.influence, 0, 100, 50),
                relationship: clean(f.relationship, 100) || 'neutrale',
                base: clean(f.base, 120),
                territory: clean(f.territory, 120),
                status: 'active',
                lastMove: '',
                lastMoveTurn: 0,
                createdAtTurn: turn,
                source: 'world-generator'
            };
        }).filter(f => f.name);

        // Build actors (NPCs)
        const protagonistName = clean(ctx.protagonistName, 100);
        const npcs = asArray(generated.npcs).map(n => {
            const name = clean(n.name, 120);
            return {
                id: `gen-npc-${hashStr(name).toString(36)}`,
                kind: 'npc',
                name,
                role: clean(n.role, 120),
                faction: clean(n.faction, 120),
                description: clean(n.description, 420),
                personality: clean(n.personality, 240),
                goal: clean(n.goal, 300),
                strategy: clean(n.strategy, 260),
                resources: clean(n.resources, 240),
                publicGoal: clean(n.publicGoal || n.goal, 300),
                privateGoal: clean(n.privateGoal, 300),
                leverage: clean(n.leverage || n.resources, 260),
                constraints: clean(n.constraints, 260),
                knowledge: clean(n.knowledge, 320),
                agenda: clean(n.agenda || n.strategy, 260),
                gender: clean(n.gender, 20),
                influence: clampNum(n.influence, 0, 100, 45),
                relationship: clean(n.relationship, 100) || 'neutrale',
                location: clean(n.location, 120),
                status: 'active',
                vitalStatus: 'alive',
                deathCause: '',
                deathTurn: null,
                lastMove: '',
                lastMoveTurn: 0,
                lastInteractionTurn: 0,
                createdAtTurn: turn,
                source: 'world-generator'
            };
        }).filter(n => n.name && (!protagonistName || keyOf(n.name) !== keyOf(protagonistName)));

        // Build relations
        const relations = asArray(generated.relations).map(r => {
            const from = clean(r.from, 120);
            const to = clean(r.to, 120);
            if (!from || !to || keyOf(from) === keyOf(to)) return null;
            return {
                id: `gen-rel-${hashStr(`${from}|${to}`).toString(36)}`,
                from,
                to,
                type: clean(r.type, 80) || 'neutrale',
                trust: clampNum(r.trust, 0, 100, 50),
                tension: clampNum(r.tension, 0, 100, 30),
                description: clean(r.description, 320),
                status: 'active',
                updatedAtTurn: turn,
                source: 'world-generator'
            };
        }).filter(Boolean);

        // Build forces
        const forces = asArray(generated.forces).map(f => {
            const name = clean(f.name, 120);
            if (!name) return null;
            return {
                id: `gen-for-${hashStr(name).toString(36)}`,
                name,
                actor: clean(f.actor, 120),
                objective: clean(f.objective, 320),
                cause: clean(f.cause, 320),
                opposition: asArray(f.opposition).map(o => clean(o, 120)).filter(Boolean),
                consequenceAt100: clean(f.consequenceAt100, 320),
                progress: clampNum(f.progress, 0, 100, 10),
                urgency: clampNum(f.urgency, 0, 100, 50),
                status: 'active',
                updatedAtTurn: turn,
                source: 'world-generator'
            };
        }).filter(Boolean);

        // Build hierarchy tree for rendering
        const hierarchy = {
            continents: asArray(generated.continents).map(cont => {
                const contName = clean(cont.name, 120);
                return {
                    name: contName,
                    nations: asArray(cont.nations).map(nation => {
                        const natName = clean(nation.name, 120);
                        return {
                            name: natName,
                            government: clean(nation.government, 200),
                            controllingFaction: clean(nation.controllingFaction, 120),
                            regions: asArray(nation.regions).map(region => {
                                const regName = clean(region.name, 120);
                                return {
                                    name: regName,
                                    terrain: clean(region.terrain, 40) || 'plains',
                                    locationNames: asArray(region.locations).map(l => clean(l.name, 120)).filter(Boolean)
                                };
                            })
                        };
                    })
                };
            })
        };

        return {
            worldSchemaVersion: GENERATOR_SCHEMA_VERSION,
            id: `gen-world-${hashStr(generated.worldName || 'mondo').toString(36)}`,
            name: clean(generated.worldName, 120) || 'Mondo della campagna',
            setting: clean(ctx.setting || (ctx.story && ctx.story.setting), 160) || '',
            premise: clean(generated.premise, 600),
            centralConflict: clean(generated.centralConflict, 420),
            stakes: clean(generated.stakes, 320),
            historicalContext: {
                date: clean(ctx.currentDate || ctx.date, 120),
                region: clean(ctx.setting || (ctx.story && ctx.story.setting), 160),
                politicalSystem: hierarchy.continents.map(c =>
                    c.nations.map(n => `${n.name}: ${n.government || 'n/a'}`).join('; ')
                ).join(' | '),
                baseline: clean(generated.premise, 600),
                activeTensions: clean(generated.centralConflict, 500),
                constraints: '',
                divergencePolicy: 'La storia può divergere soltanto come conseguenza esplicita degli eventi di gioco.'
            },
            locations,
            actors: npcs,
            factions,
            relations,
            forces,
            hierarchy,
            startLocation: clean(generated.startLocation, 120) || (locations[0] && locations[0].name) || '',
            initialized: true,
            provisional: false,
            status: 'ready',
            createdAtTurn: turn,
            updatedAtTurn: turn,
            generated: true  // flag: this world was LLM-generated, not tag-parsed
        };
    }

    // ─── Auto-fix: repair broken references ────────────────
    // If the LLM made mistakes (NPC location doesn't exist, etc.),
    // try to fix them automatically instead of failing.

    function autoFix(world) {
        const { locMap } = collectLocationNames(world);
        const locList = [];
        locMap.forEach(l => locList.push(l));

        // Fix NPC locations: snap to nearest if missing
        asArray(world.npcs).forEach(npc => {
            const locKey = keyOf(npc.location);
            if (locKey && !locMap.has(locKey)) {
                // Try partial match
                const partial = locList.find(l =>
                    keyOf(l.name).includes(locKey) || locKey.includes(keyOf(l.name))
                );
                npc.location = partial ? partial.name : (locList[0] ? locList[0].name : '');
            }
        });

        // Fix faction bases: snap to nearest matching location, or first available
        asArray(world.factions).forEach(faction => {
            const baseKey = keyOf(faction.base);
            if (baseKey && !locMap.has(baseKey)) {
                const partial = locList.find(l =>
                    keyOf(l.name).includes(baseKey) || baseKey.includes(keyOf(l.name))
                );
                faction.base = partial ? partial.name : (locList[0] ? locList[0].name : '');
            }
        });

        // Fix location connections: remove references to non-existent locations
        asArray(world.continents).forEach(cont =>
            asArray(cont.nations).forEach(nation =>
                asArray(nation.regions).forEach(region =>
                    asArray(region.locations).forEach(loc => {
                        if (Array.isArray(loc.connections)) {
                            loc.connections = loc.connections.filter(c => {
                                const ck = keyOf(c);
                                return ck && locMap.has(ck);
                            });
                        }
                    })
                )
            )
        );

        // Ensure startLocation exists
        const startKey = keyOf(world.startLocation);
        if (!startKey || !locMap.has(startKey)) {
            world.startLocation = locList[0] ? locList[0].name : '';
        }

        return world;
    }

    // ─── Merge NPC data into an existing normalized world ──

    function mergeNpcIntoWorld(worldData, npcResponse, context) {
        const ctx = context || {};
        const turn = Math.max(0, Number(ctx.turn) || 0);
        const protagonistName = clean(ctx.protagonistName, 100);

        // Extract NPC JSON from the response
        const npcData = extractWorldJson(npcResponse);
        const npcs = asArray(npcData.npcs).map(n => {
            const name = clean(n.name, 120);
            return {
                id: `gen-npc-${hashStr(name).toString(36)}`,
                kind: 'npc',
                name,
                role: clean(n.role, 120),
                faction: clean(n.faction, 120),
                description: clean(n.description, 420),
                personality: clean(n.personality, 240),
                goal: clean(n.goal, 300),
                strategy: clean(n.strategy, 260),
                resources: clean(n.resources, 240),
                publicGoal: clean(n.publicGoal || n.goal, 300),
                privateGoal: clean(n.privateGoal, 300),
                leverage: clean(n.leverage || n.resources, 260),
                constraints: clean(n.constraints, 260),
                knowledge: clean(n.knowledge, 320),
                agenda: clean(n.agenda || n.strategy, 260),
                gender: clean(n.gender, 20),
                influence: clampNum(n.influence, 0, 100, 45),
                relationship: clean(n.relationship, 100) || 'neutrale',
                location: clean(n.location, 120),
                status: 'active',
                vitalStatus: 'alive',
                deathCause: '',
                deathTurn: null,
                lastMove: '',
                lastMoveTurn: 0,
                lastInteractionTurn: 0,
                createdAtTurn: turn,
                source: 'world-generator'
            };
        }).filter(n => n.name && (!protagonistName || keyOf(n.name) !== keyOf(protagonistName)));

        // Merge NPC relations (append to existing)
        const newRelations = asArray(npcData.relations).map(r => {
            const from = clean(r.from, 120);
            const to = clean(r.to, 120);
            if (!from || !to || keyOf(from) === keyOf(to)) return null;
            return {
                id: `gen-rel-${hashStr(`${from}|${to}`).toString(36)}`,
                from,
                to,
                type: clean(r.type, 80) || 'neutrale',
                trust: clampNum(r.trust, 0, 100, 50),
                tension: clampNum(r.tension, 0, 100, 30),
                description: clean(r.description, 320),
                status: 'active',
                updatedAtTurn: turn,
                source: 'world-generator'
            };
        }).filter(Boolean);

        worldData.actors = [...(worldData.actors || []), ...npcs];
        worldData.relations = [...(worldData.relations || []), ...newRelations];
        worldData.updatedAtTurn = turn;
        return worldData;
    }

    // ─── Fallback NPC generation (when LLM fails) ─────────

    function generateFallbackNpcs(worldData, context) {
        const ctx = context || {};
        const turn = Math.max(0, Number(ctx.turn) || 0);
        const protagonistName = clean(ctx.protagonistName, 100);
        const factions = asArray(worldData.factions);
        const locations = asArray(worldData.locations);
        const existingNpcNames = new Set(asArray(worldData.actors).map(a => keyOf(a.name)));
        if (protagonistName) existingNpcNames.add(keyOf(protagonistName));

        const npcTemplates = [
            { role: 'Nobile', suffix: 'conte di', desc: 'Un nobile di antico lignaggio', goal: 'consolidare il potere della propria casata', personality: 'ambizioso e calcolatore', strategy: 'alleanze strategiche e matrimoni politici', resources: 'terre, vassalli e titoli nobiliari' },
            { role: 'Comandante', suffix: 'capitano', desc: 'Un veterano di molte battaglie', goal: 'proteggere i confini e mantenere l\'ordine', personality: 'disciplinato e leale', strategy: 'presenza militare e pattugliamenti', resources: 'soldati e fortezze' },
            { role: 'Mercante', suffix: 'maestro', desc: 'Un mercante astuto e ben collegato', goal: 'espandere le rotte commerciali', personality: 'pragmatico e persuasivo', strategy: 'reti di scambio e favori reciproci', resources: 'capitali, magazzini e contatti' },
            { role: 'Sacerdote', suffix: 'padre', desc: 'Una guida spirituale rispettata', goal: 'preservare la fede e la morale pubblica', personality: 'pio e determinato', strategy: 'influenza dottrinale e apoyo popolare', resources: 'seguaci e autorità morale' },
            { role: 'Spiaccico', suffix: 'maestro', desc: 'Esperto di informazioni e segreti', goal: 'controllare il flusso di informazioni', personality: 'circospetto e paziente', strategy: 'spie e ricatto', resources: 'reti di informatori' }
        ];

        const npcs = [];
        const relations = [];

        // Genera 1 NPC per ogni fazione (leader)
        factions.forEach((faction, idx) => {
            const factionName = clean(faction.name, 120);
            const base = clean(faction.base || faction.territory, 120);
            const loc = locations.find(l => keyOf(l.name) === keyOf(base)) || locations[idx % Math.max(1, locations.length)] || {};
            const tmpl = npcTemplates[idx % npcTemplates.length];
            const name = generateFallbackName(idx, genreHint(worldData));
            if (existingNpcNames.has(keyOf(name))) return;
            existingNpcNames.add(keyOf(name));
            npcs.push({
                id: `fb-npc-${idx}-${hashStr(name).toString(36)}`,
                kind: 'npc',
                name,
                role: clean(faction.leader || tmpl.role, 120),
                faction: factionName,
                description: `${tmpl.desc}, legato alla fazione ${factionName}.`,
                personality: tmpl.personality,
                goal: tmpl.goal,
                strategy: tmpl.strategy,
                resources: tmpl.resources,
                publicGoal: tmpl.goal,
                privateGoal: `Rafforzare ${factionName} a scapito dei rivali`,
                leverage: tmpl.resources,
                constraints: `Risponde a ${factionName}; opera principalmente a ${clean(loc.name, 100) || base}.`,
                knowledge: `Conosce la politica locale di ${base}.`,
                agenda: tmpl.strategy,
                gender: idx % 2 === 0 ? 'M' : 'F',
                influence: clampNum(faction.influence || faction.power || 50, 0, 100, 50),
                relationship: 'neutrale',
                location: clean(loc.name, 120) || base,
                status: 'active',
                vitalStatus: 'alive',
                deathCause: '',
                deathTurn: null,
                lastMove: '',
                lastMoveTurn: 0,
                lastInteractionTurn: 0,
                createdAtTurn: turn,
                source: 'fallback-npc'
            });
        });

        // Genera NPC aggiuntivi dai luoghi (se pochi NPC)
        if (npcs.length < 4 && locations.length > 0) {
            locations.slice(0, 4).forEach((loc, idx) => {
                const tmpl = npcTemplates[(npcs.length + idx) % npcTemplates.length];
                const name = generateFallbackName(npcs.length + idx + 10, genreHint(worldData));
                if (existingNpcNames.has(keyOf(name))) return;
                existingNpcNames.add(keyOf(name));
                npcs.push({
                    id: `fb-npc-loc-${idx}-${hashStr(name).toString(36)}`,
                    kind: 'npc',
                    name,
                    role: tmpl.role,
                    faction: '',
                    description: `${tmpl.desc}, risiede a ${clean(loc.name, 100)}.`,
                    personality: tmpl.personality,
                    goal: tmpl.goal,
                    strategy: tmpl.strategy,
                    resources: tmpl.resources,
                    publicGoal: tmpl.goal,
                    privateGoal: `Prosperare a ${clean(loc.name, 100)}`,
                    leverage: tmpl.resources,
                    constraints: `Opera a ${clean(loc.name, 100)}.`,
                    knowledge: `Conosce bene ${clean(loc.name, 100)} e dintorni.`,
                    agenda: tmpl.strategy,
                    gender: idx % 2 === 0 ? 'M' : 'F',
                    influence: 35 + (idx * 10),
                    relationship: 'neutrale',
                    location: clean(loc.name, 120),
                    status: 'active',
                    vitalStatus: 'alive',
                    deathCause: '',
                    deathTurn: null,
                    lastMove: '',
                    lastMoveTurn: 0,
                    lastInteractionTurn: 0,
                    createdAtTurn: turn,
                    source: 'fallback-npc'
                });
            });
        }

        // Relazioni tra NPC e fazioni
        npcs.forEach((npc, idx) => {
            if (npc.faction) {
                const targetFaction = factions.find(f => keyOf(f.name) === keyOf(npc.faction));
                if (targetFaction) {
                    relations.push({
                        id: `fb-rel-${idx}-${hashStr(npc.name + '|' + targetFaction.name).toString(36)}`,
                        from: npc.name,
                        to: targetFaction.name,
                        type: 'servitore',
                        trust: 60,
                        tension: 15,
                        description: `${npc.name} serve ${targetFaction.name} come ${clean(npc.role, 60)}.`,
                        status: 'active',
                        updatedAtTurn: turn,
                        source: 'fallback-npc'
                    });
                }
            }
            // Rivalità tra NPC di fazioni diverse
            if (idx > 0 && npcs[idx - 1].faction && npc.faction && npcs[idx - 1].faction !== npc.faction) {
                relations.push({
                    id: `fb-rel-rival-${idx}-${hashStr(npc.name + '|' + npcs[idx - 1].name).toString(36)}`,
                    from: npc.name,
                    to: npcs[idx - 1].name,
                    type: 'rivalità',
                    trust: 25,
                    tension: 60,
                    description: `Tensione tra ${npc.name} e ${npcs[idx - 1].name} per questioni di influenza.`,
                    status: 'active',
                    updatedAtTurn: turn,
                    source: 'fallback-npc'
                });
            }
        });

        worldData.actors = [...(worldData.actors || []), ...npcs];
        worldData.relations = [...(worldData.relations || []), ...relations];
        worldData.updatedAtTurn = turn;
        console.info(`[WorldGenerator] Fallback: generati ${npcs.length} NPC e ${relations.length} relazioni deterministici.`);
        return worldData;
    }

    function genreHint(worldData) {
        const setting = clean(worldData.setting, 40).toLowerCase();
        if (/fantasy|epico|draghi|magia/.test(setting)) return 'fantasy';
        if (/steampunk|vittoriano|industriale/.test(setting)) return 'steampunk';
        if (/horror|gotico|cimitero|nebbia/.test(setting)) return 'gothic';
        return 'medieval';
    }

    function generateFallbackName(seed, hint) {
        const fantasyFirst = ['Aldric','Elara','Morven','Sera','Kael','Bran','Lyra','Cedric','Isolde','Roderick','Marcella','Gareth','Yvaine','Theron','Callista'];
        const medievalFirst = ['Tommaso','Beatrice\u00e8','Ugo','Aldo','Matilde','Rinaldo','Ginevra','Lorenzo','Bianca','Ercole','Costanza','Ottaviano','Lucrezia','Alessio'];
        const gothicFirst = ['Victor','Elisabeth','Edgar','Lenore','Abraham','Cordelia','Mortimer','Serena','Ambrose','Rosalind'];
        const first = hint === 'fantasy' ? fantasyFirst : hint === 'gothic' ? gothicFirst : medievalFirst;
        const lastParts = ['di Valdoria','di Morvane','di Ravenhollow','di Castelnuovo','dellaMarca','di Belmonte','di Serravalle','di Roccaforte','dell\'Altavalle','di Selvalunga'];
        const f = first[seed % first.length];
        const l = lastParts[(seed * 7 + 3) % lastParts.length];
        return `${f} ${l}`;
    }

    // ─── Public API ────────────────────────────────────────

    return {
        GENERATOR_SCHEMA_VERSION,
        MAP_W,
        MAP_H,
        buildGenerationPrompt,
        buildLocationsPrompt,
        buildNpcPrompt,
        extractWorldJson,
        validateHierarchy,
        autoFix,
        normalizeGeneratedWorld,
        mergeNpcIntoWorld,
        generateFallbackNpcs,
        collectLocationNames,
        collectFactionNames,
        collectNpcNames
    };
});