(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheStoryGenerator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const GENRES = new Set([
        'fantasy', 'contemporary', 'sport', 'business', 'crime', 'historical',
        'military', 'diplomatic', 'rural', 'pirate', 'spy'
    ]);

    const BLUEPRINTS = {
        fantasy: ['Fantasy medievale', 'un potere antico si risveglia e altera gli equilibri del regno', 'una città di frontiera stretta tra rovine, foreste e rivalità', 'Evocativo, avventuroso e misterioso, con conseguenze concrete.', 'Fazioni, PNG e luoghi hanno obiettivi autonomi. Magia, politica e risorse seguono regole coerenti.'],
        contemporary: ['Mondo contemporaneo', 'un evento inatteso costringe il protagonista a cambiare vita', 'una città moderna piena di opportunità, pressioni economiche e relazioni', 'Realistico, umano e cinematografico, con dialoghi naturali.', 'Lavoro, denaro, famiglia, reputazione e rapporti personali evolvono nel tempo.'],
        sport: ['Sport professionistico contemporaneo', 'una squadra in difficoltà offre al protagonista una possibilità irripetibile', 'un ambiente sportivo competitivo tra campo, spogliatoio e dirigenza', 'Energico e realistico, alternando tensione agonistica e vita privata.', 'Prestazioni, allenamento, contratti, morale, rivalità e scelte societarie producono conseguenze.'],
        business: ['Economia e impresa contemporanea', 'una piccola attività con pochi mezzi può diventare un impero oppure fallire', 'un mercato vivo fatto di clienti, fornitori, concorrenti e istituzioni', 'Realistico e manageriale, con dialoghi naturali e rischi economici credibili.', 'Cassa, magazzino, contratti, personale, reputazione e concorrenza devono sempre restare coerenti.'],
        crime: ['Crime contemporaneo', 'un debito, un segreto e una proposta pericolosa trascinano il protagonista nel crimine', 'una città divisa tra quartieri, famiglie criminali e forze dell’ordine', 'Teso, noir e realistico, senza glorificare gratuitamente la violenza.', 'Le fazioni ricordano tradimenti e favori; denaro, prove, sospetti e reputazione hanno conseguenze.'],
        historical: ['Epoca storica', 'una crisi politica e sociale apre al protagonista una strada rischiosa verso il potere', 'una comunità storica coerente con istituzioni, mestieri e tecnologie dell’epoca', 'Storico, immersivo e concreto, evitando elementi anacronistici.', 'Ceto sociale, legge, religione, economia e rapporti di potere condizionano ogni scelta.'],
        military: ['Conflitto militare', 'una missione critica mette alla prova lealtà, comando e sopravvivenza', 'un fronte instabile con civili, reparti, logistica e intelligence', 'Teso e realistico, attento al costo umano delle decisioni.', 'Morale, ordini, risorse, terreno, catena di comando e conseguenze politiche restano persistenti.'],
        diplomatic: ['Intrigo politico e diplomatico', 'un equilibrio fragile tra potenze rischia di spezzarsi', 'una capitale dove ambasciate, fazioni e interessi economici si scontrano', 'Strategico, elegante e ricco di sottotesto.', 'Trattati, fiducia, informazioni, reputazione e rapporti tra fazioni cambiano in modo tracciabile.'],
        rural: ['Vita rurale e gestione agricola', 'una terra trascurata può rinascere, ma debiti e stagioni non aspettano', 'una comunità rurale legata a raccolti, mercati e famiglie', 'Caldo e realistico, con momenti di fatica, scoperta e comunità.', 'Stagioni, scorte, animali, lavoratori, debiti, clienti e fornitori evolvono concretamente.'],
        pirate: ['Età della vela e pirateria', 'una mappa incompleta promette ricchezza e attira nemici', 'un arcipelago di porti, rotte commerciali, imperi e isole inesplorate', 'Avventuroso, salmastro e imprevedibile.', 'Equipaggio, nave, provviste, reputazione, rotte e alleanze influenzano ogni viaggio.'],
        spy: ['Spionaggio internazionale', 'un’informazione rubata può impedire una crisi o provocarla', 'una rete di città, coperture, servizi segreti e doppi giochi', 'Teso, intelligente e cinematografico.', 'Coperture, prove, sospetti, contatti e obiettivi delle agenzie restano coerenti e persistenti.']
    };

    const START_PRESETS = {
        fantasy: { day: 1, month: 3, year: 1400, hour: 8, minute: 0 },
        contemporary: { day: 2, month: 5, year: 2024, hour: 9, minute: 0 },
        sport: { day: 15, month: 8, year: 2024, hour: 10, minute: 0 },
        business: { day: 2, month: 4, year: 2023, hour: 9, minute: 0 },
        crime: { day: 7, month: 10, year: 1986, hour: 22, minute: 0 },
        historical: { day: 2, month: 4, year: 1472, hour: 9, minute: 0 },
        military: { day: 1, month: 11, year: 1943, hour: 5, minute: 0 },
        diplomatic: { day: 10, month: 9, year: 2025, hour: 10, minute: 0 },
        rural: { day: 20, month: 4, year: 1890, hour: 6, minute: 0 },
        pirate: { day: 5, month: 7, year: 1720, hour: 14, minute: 0 },
        spy: { day: 3, month: 3, year: 1968, hour: 21, minute: 0 }
    };

    const GENRE_DETAILS = {
        fantasy: {
            scale: 'locale o geopolitica secondo la premessa',
            politics: 'signorie, regni, città libere, ordini o poteri coerenti con il mondo',
            economy: 'terre, tributi, commercio, artigianato e risorse rare',
            law: 'consuetudini, giurisdizioni e autorità locali',
            society: 'ceti, casate, comunità, corporazioni e gruppi marginali',
            technology: 'tecnologia e magia coerenti con le regole stabilite',
            culture: 'religioni, tradizioni, tabù e identità locali',
            locationTypes: ['luogo iniziale', 'centro del potere', 'mercato o snodo economico', 'luogo di pericolo', 'luogo sociale', 'luogo legato al mistero'],
            factionTypes: ['potere dominante', 'rivale politico o territoriale', 'gruppo economico o corporativo', 'ordine religioso o culturale'],
            characterRoles: ['autorità locale', 'intermediario', 'rivale', 'alleato potenziale', 'testimone o informatore', 'agente autonomo']
        },
        contemporary: {
            scale: 'locale o regionale',
            politics: 'istituzioni civiche e amministrative reali o plausibili',
            economy: 'lavoro, reddito, imprese, credito e costo della vita',
            law: 'diritto e procedure contemporanee pertinenti',
            society: 'famiglia, lavoro, reti sociali e comunità',
            technology: 'tecnologia contemporanea coerente con data e luogo',
            culture: 'abitudini, media, identità e tensioni sociali',
            locationTypes: ['casa o base personale', 'luogo di lavoro', 'istituzione rilevante', 'luogo sociale', 'infrastruttura', 'luogo del conflitto'],
            factionTypes: ['datore di lavoro o impresa', 'istituzione', 'rete familiare o sociale', 'gruppo d’interesse'],
            characterRoles: ['familiare o persona vicina', 'collega o superiore', 'funzionario o professionista', 'rivale', 'contatto sociale', 'soggetto con agenda autonoma']
        },
        sport: {
            scale: 'club, città e circuito sportivo pertinente',
            politics: 'dirigenza, lega, federazione e proprietà',
            economy: 'stipendi, contratti, sponsor, premi e budget',
            law: 'regolamenti sportivi e contrattuali',
            society: 'squadra, staff, tifoseria, media e vita privata',
            technology: 'strumenti e metodi di allenamento coerenti con l’epoca',
            culture: 'identità del club, rivalità e pressione dei tifosi',
            locationTypes: ['impianto sportivo', 'centro allenamento', 'spogliatoio o area squadra', 'sede dirigenziale', 'luogo media', 'luogo della vita privata'],
            factionTypes: ['dirigenza/proprietà', 'staff e squadra', 'club rivale', 'lega/federazione o sponsor'],
            characterRoles: ['allenatore o dirigente', 'compagno', 'rivale', 'agente', 'giornalista', 'persona della vita privata']
        },
        business: {
            scale: 'locale o regionale salvo espansione richiesta',
            politics: 'enti locali, regolatori e associazioni pertinenti',
            economy: 'cassa, credito, prezzi, domanda, fornitori, concorrenti e fiscalità',
            law: 'licenze, contratti, obblighi e procedure pertinenti',
            society: 'clienti, lavoratori, proprietari, reti professionali e comunità',
            technology: 'strumenti e processi coerenti con settore ed epoca',
            culture: 'abitudini di consumo, reputazione e pratiche commerciali',
            locationTypes: ['attività del protagonista', 'concorrente', 'fornitore o magazzino', 'banca o finanziatore', 'istituzione o regolatore', 'mercato/clientela', 'luogo sociale'],
            factionTypes: ['concorrente', 'finanziatore', 'fornitore o rete commerciale', 'ente/regolatore', 'gruppo di clienti o lavoratori'],
            characterRoles: ['cliente chiave', 'fornitore', 'concorrente', 'creditore o bancario', 'dipendente o collaboratore', 'funzionario o professionista']
        },
        crime: {
            scale: 'quartieri, città e reti collegate',
            politics: 'forze dell’ordine, istituzioni e poteri locali',
            economy: 'denaro legale/illecito, debiti, attività di copertura e mercati',
            law: 'indagini, prove, procedura e rischio giudiziario',
            society: 'famiglie, quartieri, reti di fiducia e reputazione',
            technology: 'sorveglianza e comunicazioni coerenti con l’epoca',
            culture: 'codici informali, lealtà, paura e reputazione',
            locationTypes: ['base del protagonista', 'luogo criminale', 'istituzione legale', 'attività di copertura', 'quartiere conteso', 'snodo informativo'],
            factionTypes: ['gruppo criminale', 'forze dell’ordine', 'rete economica legale', 'gruppo locale o istituzionale'],
            characterRoles: ['intermediario', 'investigatore', 'rivale', 'informatore', 'persona legata a un debito o segreto', 'agente autonomo']
        },
        historical: {
            scale: 'coerente con luogo, anno e conflitto',
            politics: 'istituzioni, cariche e poteri plausibili per l’epoca',
            economy: 'moneta, credito, mestieri, proprietà e commerci dell’epoca',
            law: 'diritto, consuetudini e giurisdizioni storicamente plausibili',
            society: 'ceti, corporazioni, famiglie, comunità e dipendenze sociali',
            technology: 'solo tecnologie disponibili nell’epoca indicata',
            culture: 'religione, costumi, alfabetizzazione e mentalità coerenti',
            locationTypes: ['luogo iniziale storicamente plausibile', 'sede istituzionale', 'mercato o centro produttivo', 'luogo religioso', 'quartiere o territorio sociale', 'snodo militare/commerciale se pertinente'],
            factionTypes: ['istituzione civica', 'casata o gruppo patrizio', 'corporazione o gruppo economico', 'potere religioso o militare'],
            characterRoles: ['magistrato o autorità', 'mercante/artigiano o professionista', 'membro di una casata o corporazione', 'religioso o funzionario', 'rivale politico/economico', 'persona comune con interessi propri']
        },
        military: {
            scale: 'fronte e retrovie necessarie',
            politics: 'catena di comando e autorità politiche',
            economy: 'logistica, rifornimenti, trasporti e produzione',
            law: 'ordini, disciplina e diritto di guerra pertinente',
            society: 'reparti, civili, alleati e popolazioni locali',
            technology: 'armi, comunicazioni e mezzi coerenti con data e teatro',
            culture: 'morale, dottrina, identità e tensioni tra reparti',
            locationTypes: ['posizione iniziale', 'comando', 'linea del fronte', 'snodo logistico', 'centro civile', 'obiettivo strategico'],
            factionTypes: ['comando alleato', 'forza avversaria', 'intelligence', 'autorità civile o gruppo locale'],
            characterRoles: ['comandante', 'subordinato', 'specialista', 'civile', 'agente intelligence', 'rivale o alleato autonomo']
        },
        diplomatic: {
            scale: 'capitale e paesi direttamente coinvolti',
            politics: 'governi, ministeri, ambasciate, partiti e blocchi',
            economy: 'commercio, sanzioni, energia, finanza e interessi industriali pertinenti',
            law: 'trattati, diritto internazionale e procedure diplomatiche',
            society: 'opinione pubblica, lobby, media ed élite',
            technology: 'comunicazioni e intelligence coerenti con l’epoca',
            culture: 'protocolli, identità nazionali e sensibilità politiche',
            locationTypes: ['ministero o sede di governo', 'ambasciata', 'luogo negoziale', 'centro media', 'sede economica', 'luogo informale di contatto'],
            factionTypes: ['governo', 'potenza rivale/alleata', 'servizio intelligence', 'gruppo economico o politico'],
            characterRoles: ['diplomatico', 'ministro o consigliere', 'agente intelligence', 'lobbista o imprenditore', 'giornalista', 'delegato con agenda autonoma']
        },
        rural: {
            scale: 'comunità rurale e mercato regionale',
            politics: 'comune, consorzi, enti agricoli e proprietari',
            economy: 'raccolti, bestiame, debiti, forniture, manodopera e prezzi',
            law: 'proprietà, contratti, acqua, lavoro e norme agricole pertinenti',
            society: 'famiglie, lavoratori, vicini, cooperative e commercianti',
            technology: 'attrezzature e tecniche coerenti con l’epoca',
            culture: 'stagioni, tradizioni e legami comunitari',
            locationTypes: ['proprietà agricola', 'mercato', 'fornitore', 'cooperativa o istituzione', 'proprietà rivale', 'luogo comunitario'],
            factionTypes: ['famiglia/proprietario', 'cooperativa', 'commerciante o fornitore', 'banca/ente locale'],
            characterRoles: ['lavoratore', 'vicino', 'fornitore', 'compratore', 'funzionario', 'rivale o alleato autonomo']
        },
        pirate: {
            scale: 'arcipelago, rotte e potenze direttamente collegate',
            politics: 'governatori, marine, compagnie e porti',
            economy: 'carichi, prezzi, bottino, rifornimenti e commercio',
            law: 'giurisdizioni marittime, lettere di corsa e contrabbando',
            society: 'equipaggi, porti, mercanti, schiavi/liberi secondo epoca e contesto',
            technology: 'navi, armi e navigazione coerenti con l’epoca',
            culture: 'disciplina di bordo, reputazione, usanze portuali e identità imperiali',
            locationTypes: ['porto iniziale', 'rotta commerciale', 'isola o approdo', 'forte/naval base', 'mercato', 'luogo di rifornimento'],
            factionTypes: ['equipaggio', 'marina o governatore', 'compagnia commerciale', 'pirati/contrabbandieri rivali'],
            characterRoles: ['capitano o ufficiale', 'marinaio specialista', 'mercante', 'governatore/ufficiale', 'rivale', 'informatore o contatto portuale']
        },
        spy: {
            scale: 'rete di città e paesi indispensabili alla missione',
            politics: 'governi, servizi, ambasciate e apparati di sicurezza',
            economy: 'finanziamenti, coperture economiche e interessi strategici',
            law: 'sicurezza, arresti, immunità e procedure coerenti con l’epoca',
            society: 'reti clandestine, contatti, famiglie e istituzioni',
            technology: 'sorveglianza, cifratura e comunicazioni coerenti con l’epoca',
            culture: 'coperture, linguaggi, ideologie e sospetti',
            locationTypes: ['safe house o base', 'sede istituzionale', 'luogo di scambio', 'copertura civile', 'frontiera/snodo di viaggio', 'luogo sorvegliato'],
            factionTypes: ['servizio alleato', 'servizio rivale', 'governo/istituzione', 'rete clandestina o intermediaria'],
            characterRoles: ['case officer', 'agente sul campo', 'fonte', 'doppio agente o sospetto', 'funzionario', 'contatto civile con agenda propria']
        }
    };

    function clean(value, limit = 1200) {
        const text = String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return text.length > limit ? text.slice(0, limit).trim() : text;
    }

    function genreOf(value) {
        const key = clean(value, 40).toLowerCase();
        return GENRES.has(key) ? key : 'fantasy';
    }

    function blueprintFor(genre) {
        const values = BLUEPRINTS[genreOf(genre)] || BLUEPRINTS.fantasy;
        return { setting: values[0], hook: values[1], place: values[2], tone: values[3], depth: values[4] };
    }

    function inferStartTime(source = {}, genreValue) {
        const genre = genreOf(genreValue || source.genre);
        const explicit = source.startTime && typeof source.startTime === 'object' ? source.startTime : {};
        const explicitYear = Number(explicit.year);
        const combined = [source.setting, source.idea, source.desc, source.prologue]
            .map(value => clean(value, 2000)).filter(Boolean).join(' ');
        const historicalBusiness = genre === 'business' &&
            /\b(?:storico|medici|pazzi|signoria|rinascimento|rinascimentale|quattrocento|cinquecento|fiorini)\b/i.test(combined);
        const preset = { ...(START_PRESETS[historicalBusiness ? 'historical' : genre] || START_PRESETS.fantasy) };
        const years = combined.match(/\b(?:1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/g) || [];
        const inferredYear = years.length ? Number(years[0]) : NaN;
        const year = Number.isFinite(explicitYear) && explicitYear >= 1000 && explicitYear <= 2199
            ? explicitYear
            : (Number.isFinite(inferredYear) ? inferredYear : preset.year);
        const integer = (value, fallback, min, max) => {
            const parsed = Math.trunc(Number(value));
            return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
        };
        return {
            day: integer(explicit.day, preset.day, 1, 31),
            month: integer(explicit.month, preset.month, 1, 12),
            year,
            hour: integer(explicit.hour, preset.hour, 0, 23),
            minute: integer(explicit.minute, preset.minute, 0, 59)
        };
    }

    function titleFrom(seed, blueprint) {
        const explicit = clean(seed.title, 100);
        if (explicit && !/^nuova storia$/i.test(explicit)) return explicit;
        const idea = clean(seed.idea || seed.desc, 100);
        if (idea) {
            const words = idea.replace(/[^\p{L}\p{N}\s'-]/gu, '').split(/\s+/).filter(Boolean).slice(0, 6);
            if (words.length) return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }
        return `Cronache di ${blueprint.setting}`;
    }

    function normalizeProperty(raw, genre, index) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name, 100);
        if (!name) return null;
        const businessLike = genre === 'business' || genre === 'rural' ||
            /negozio|bottega|impresa|azienda|locanda|taverna|fattoria|studio|officina|banco dei pegni/i.test(name);
        return {
            id: clean(source.id, 120) || `generated-property-${Date.now()}-${index}`,
            name,
            description: clean(source.description, 400),
            notes: clean(source.notes, 400),
            type: clean(source.type, 40) || (businessLike ? 'business' : 'property'),
            condition: Math.max(0, Math.min(100, Number(source.condition) || 70)),
            baseValue: Math.max(0, Math.round(Number(source.baseValue) || 0)),
            income: Math.round(Number(source.income) || 0),
            businessCash: businessLike ? Math.max(0, Math.round(Number(source.businessCash) || 100)) : 0
        };
    }

    function normalizeTextList(value, fallback = [], maxItems = 10, maxLength = 260) {
        const input = Array.isArray(value) ? value : [];
        const normalized = input.map(item => clean(item, maxLength)).filter(Boolean).slice(0, maxItems);
        if (normalized.length) return normalized;
        return fallback.map(item => clean(item, maxLength)).filter(Boolean).slice(0, maxItems);
    }

    function normalizeObjectList(value, fallback, fields, maxItems) {
        const source = Array.isArray(value) ? value : [];
        const normalize = item => {
            const raw = item && typeof item === 'object' ? item : (typeof item === 'string' ? { purpose: item } : {});
            const result = {};
            fields.forEach(([field, max]) => { result[field] = clean(raw[field], max); });
            return Object.values(result).some(Boolean) ? result : null;
        };
        const result = source.map(normalize).filter(Boolean).slice(0, maxItems);
        if (result.length) return result;
        return (fallback || []).map(normalize).filter(Boolean).slice(0, maxItems);
    }

    function createFallbackWorldBlueprint(seed = {}, genreValue) {
        const genre = genreOf(genreValue || seed.genre);
        const details = GENRE_DETAILS[genre] || GENRE_DETAILS.fantasy;
        const base = blueprintFor(genre);
        const setting = clean(seed.setting, 180) || base.setting;
        const premise = clean(seed.desc || seed.idea, 900) || base.hook;
        const locationNeeds = details.locationTypes.map((type, index) => ({
            nameHint: index === 0 ? clean(seed.startLocation, 100) : '',
            type,
            purpose: index === 0 ? 'ancorare la scena iniziale e la vita concreta del protagonista' : `rendere giocabile ${type}`,
            storyLink: premise
        }));
        const factionNeeds = details.factionTypes.map(type => ({
            nameHint: '', type,
            roleInConflict: `rappresentare un interesse autonomo collegato a: ${premise}`,
            goal: 'perseguire un obiettivo concreto anche senza intervento del protagonista',
            resources: 'risorse coerenti con il ruolo e con l’epoca',
            autonomousPressure: 'compiere mosse visibili nella timeline se ignorata'
        }));
        const characterNeeds = details.characterRoles.map(role => ({
            nameHint: '', role,
            storyFunction: `collegare il protagonista a una conseguenza o opportunità di: ${premise}`,
            factionHint: '',
            locationHint: '',
            publicGoal: 'ottenere un risultato concreto nel mondo',
            privateGoal: 'proteggere un interesse personale non completamente coincidente con quello pubblico',
            autonomy: 'può prendere iniziative e cambiare situazione senza attendere il protagonista'
        }));
        return {
            centralConflict: premise,
            stakes: `Il fallimento o il successo del protagonista modifica concretamente gli equilibri di ${setting}, senza bloccare l’autonomia del mondo.`,
            scope: {
                scale: details.scale,
                primaryArea: setting,
                secondaryAreas: [],
                travelLogic: 'Aggiungere aree solo quando servono a una relazione, risorsa, minaccia o opportunità della storia.'
            },
            institutions: {
                politicalSystem: details.politics,
                economy: details.economy,
                law: details.law,
                socialStructure: details.society,
                technology: details.technology,
                cultureReligion: details.culture
            },
            locationNeeds,
            factionNeeds,
            characterNeeds,
            activeForces: [
                { name: 'Pressione iniziale', actor: 'forza più direttamente legata al conflitto', objective: 'modificare lo status quo', cause: premise, escalation: 'produce una conseguenza concreta se nessuno interviene' },
                { name: 'Reazione autonoma', actor: 'gruppo con interessi contrari o paralleli', objective: 'difendere il proprio interesse', cause: `gli equilibri di ${setting} sono instabili`, escalation: 'crea un nuovo vincolo o una nuova opportunità' },
                { name: 'Vincolo materiale', actor: 'economia, istituzione, ambiente o logistica', objective: 'imporre costi e limiti credibili', cause: details.economy, escalation: 'riduce opzioni, risorse o tempo disponibile' }
            ],
            startingSituation: {
                locationHint: clean(seed.startLocation, 120) || base.place,
                immediateProblem: premise,
                openThreads: ['chi trae vantaggio dalla crisi', 'quale costo avrà la prima scelta', 'quale forza agirà se il protagonista resta fermo'],
                firstDecision: 'offrire almeno due approcci realmente diversi senza scegliere per il protagonista'
            }
        };
    }

    function normalizeWorldBlueprint(raw, seed = {}, genreValue) {
        const genre = genreOf(genreValue || seed.genre);
        const fallback = createFallbackWorldBlueprint(seed, genre);
        const source = raw && typeof raw === 'object' ? raw : {};
        const scope = source.scope && typeof source.scope === 'object' ? source.scope : {};
        const institutions = source.institutions && typeof source.institutions === 'object' ? source.institutions : {};
        const starting = source.startingSituation && typeof source.startingSituation === 'object' ? source.startingSituation : {};
        return {
            centralConflict: clean(source.centralConflict, 900) || fallback.centralConflict,
            stakes: clean(source.stakes, 700) || fallback.stakes,
            scope: {
                scale: clean(scope.scale, 120) || fallback.scope.scale,
                primaryArea: clean(scope.primaryArea, 180) || fallback.scope.primaryArea,
                secondaryAreas: normalizeTextList(scope.secondaryAreas, fallback.scope.secondaryAreas, 8, 140),
                travelLogic: clean(scope.travelLogic, 420) || fallback.scope.travelLogic
            },
            institutions: {
                politicalSystem: clean(institutions.politicalSystem, 500) || fallback.institutions.politicalSystem,
                economy: clean(institutions.economy, 500) || fallback.institutions.economy,
                law: clean(institutions.law, 500) || fallback.institutions.law,
                socialStructure: clean(institutions.socialStructure, 500) || fallback.institutions.socialStructure,
                technology: clean(institutions.technology, 500) || fallback.institutions.technology,
                cultureReligion: clean(institutions.cultureReligion, 500) || fallback.institutions.cultureReligion
            },
            locationNeeds: normalizeObjectList(source.locationNeeds, fallback.locationNeeds, [
                ['nameHint', 120], ['type', 100], ['purpose', 320], ['storyLink', 420]
            ], 14),
            factionNeeds: normalizeObjectList(source.factionNeeds, fallback.factionNeeds, [
                ['nameHint', 120], ['type', 100], ['roleInConflict', 360], ['goal', 320], ['resources', 260], ['autonomousPressure', 320]
            ], 10),
            characterNeeds: normalizeObjectList(source.characterNeeds, fallback.characterNeeds, [
                ['nameHint', 120], ['role', 120], ['storyFunction', 360], ['factionHint', 120], ['locationHint', 120], ['publicGoal', 300], ['privateGoal', 300], ['autonomy', 320]
            ], 16),
            activeForces: normalizeObjectList(source.activeForces, fallback.activeForces, [
                ['name', 140], ['actor', 160], ['objective', 340], ['cause', 340], ['escalation', 340]
            ], 8),
            startingSituation: {
                locationHint: clean(starting.locationHint, 160) || fallback.startingSituation.locationHint,
                immediateProblem: clean(starting.immediateProblem, 600) || fallback.startingSituation.immediateProblem,
                openThreads: normalizeTextList(starting.openThreads, fallback.startingSituation.openThreads, 8, 300),
                firstDecision: clean(starting.firstDecision, 500) || fallback.startingSituation.firstDecision
            }
        };
    }

    function createFallbackStory(seed = {}) {
        const genre = genreOf(seed.genre);
        const blueprint = blueprintFor(genre);
        const title = titleFrom(seed, blueprint);
        const setting = clean(seed.setting, 160) || blueprint.setting;
        const idea = clean(seed.idea || seed.desc, 900);
        const premise = idea || blueprint.hook;
        const properties = Array.isArray(seed.starterProperties)
            ? seed.starterProperties.map((item, index) => normalizeProperty(item, genre, index)).filter(Boolean)
            : [];
        const baseSeed = { ...seed, setting, desc: clean(seed.desc, 1800) || premise };
        const worldBlueprint = normalizeWorldBlueprint(seed.worldBlueprint, baseSeed, genre);
        const startTime = inferStartTime(baseSeed, genre);
        return {
            title,
            setting,
            genre,
            difficulty: ['easy', 'normal', 'hard'].includes(seed.difficulty) ? seed.difficulty : 'normal',
            starterGold: Number.isFinite(Number(seed.starterGold)) ? Math.round(Number(seed.starterGold)) : 100,
            desc: clean(seed.desc, 1800) || `${setting}. ${premise}. Conflitto centrale: ${worldBlueprint.centralConflict}. Posta in gioco: ${worldBlueprint.stakes}`,
            personality: clean(seed.personality, 1200) || blueprint.tone,
            depth: clean(seed.depth, 1800) || `${blueprint.depth} Luoghi, fazioni e PNG devono derivare dal worldBlueprint, avere funzioni concrete e agire autonomamente. Non regalare successi: applica costi, rischi e conseguenze persistenti.`,
            prologue: clean(seed.prologue, 2200) || `È l’inizio di una giornata destinata a cambiare tutto. Ti trovi in ${worldBlueprint.startingSituation.locationHint}: ${worldBlueprint.startingSituation.immediateProblem}. Una conseguenza della crisi è già visibile e la prima decisione resta completamente al protagonista.`,
            startTime,
            starterProperties: properties,
            worldBlueprint,
            canonFacts: normalizeTextList(seed.canonFacts, [
                `La campagna inizia in ${setting}.`,
                `La data iniziale è ${startTime.day}/${startTime.month}/${startTime.year}.`,
                `Il conflitto centrale è: ${worldBlueprint.centralConflict}`
            ], 10, 360),
            openThreads: normalizeTextList(seed.openThreads, worldBlueprint.startingSituation.openThreads, 10, 360)
        };
    }

    function extractJson(response) {
        const text = String(response || '').trim();
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        const source = fenced ? fenced[1].trim() : (first >= 0 && last > first ? text.slice(first, last + 1) : '');
        if (!source) throw new Error('Il generatore non ha restituito una scheda JSON valida.');
        return JSON.parse(source);
    }

    function completeStory(input = {}, seed = {}) {
        const merged = { ...seed, ...input };
        const fallback = createFallbackStory(merged);
        const requestedTitle = clean(merged.title, 100);
        const properties = Array.isArray(merged.starterProperties)
            ? merged.starterProperties.map((item, index) => normalizeProperty(item, fallback.genre, index)).filter(Boolean)
            : fallback.starterProperties;
        const worldBlueprint = normalizeWorldBlueprint(merged.worldBlueprint, {
            ...merged,
            setting: clean(merged.setting, 160) || fallback.setting,
            desc: clean(merged.desc, 1800) || fallback.desc,
            prologue: clean(merged.prologue, 2200) || fallback.prologue
        }, fallback.genre);
        return {
            ...fallback,
            title: requestedTitle && !/^nuova storia$/i.test(requestedTitle) ? requestedTitle : fallback.title,
            setting: clean(merged.setting, 160) || fallback.setting,
            desc: clean(merged.desc, 1800) || fallback.desc,
            personality: clean(merged.personality, 1200) || fallback.personality,
            depth: clean(merged.depth, 1800) || fallback.depth,
            prologue: clean(merged.prologue, 2200) || fallback.prologue,
            startTime: inferStartTime(merged, fallback.genre),
            starterProperties: properties,
            worldBlueprint,
            canonFacts: normalizeTextList(merged.canonFacts, fallback.canonFacts, 10, 360),
            openThreads: normalizeTextList(merged.openThreads, worldBlueprint.startingSituation.openThreads, 10, 360)
        };
    }

    function parseGeneratedStory(response, seed = {}) {
        const generated = extractJson(response);
        return completeStory({
            ...generated,
            genre: genreOf(seed.genre || generated.genre)
        }, seed);
    }

    function buildGenerationPrompt(seed = {}) {
        const base = createFallbackStory(seed);
        return [
            'Crea una campagna completa, specifica e immediatamente giocabile per un GDR narrativo persistente.',
            'Restituisci ESCLUSIVAMENTE un singolo oggetto JSON valido, senza markdown, commenti o testo esterno.',
            '',
            '=== INTENTO DEL GIOCATORE: FONTE AUTORITATIVA ===',
            `Idea del giocatore: ${clean(seed.idea || seed.desc, 1000) || 'nessuna idea aggiuntiva'}`,
            `Genere: ${base.genre}. Ambientazione richiesta: ${clean(seed.setting, 200) || base.setting}.`,
            `Difficoltà: ${base.difficulty}. Titolo suggerito: ${clean(seed.title, 120) || 'da inventare'}.`,
            '- Non sostituire l’idea del giocatore con una trama standard del genere.',
            '- Prima definisci la storia; solo dopo specifica il mondo necessario a farla funzionare.',
            '- Ogni dettaglio deve poter essere usato direttamente dal generatore di luoghi, fazioni, personaggi ed eventi.',
            '',
            '=== CAMPI TOP-LEVEL OBBLIGATORI ===',
            'title, setting, genre, difficulty, starterGold, desc, personality, depth, prologue, startTime, starterProperties, worldBlueprint, canonFacts, openThreads.',
            'startTime = {"day":numero,"month":numero,"year":numero,"hour":numero,"minute":numero}. Scegli una data esatta coerente con epoca e premessa; non usare l’anno corrente come riempitivo.',
            'desc (600-1800 caratteri) deve descrivere situazione iniziale, conflitto centrale, posta in gioco e perché il mondo è già in movimento.',
            'personality deve definire tono, ritmo, tipo di dialoghi e grado di realismo.',
            'depth deve imporre causalità, persistenza, economia/istituzioni pertinenti, autonomia di PNG/fazioni e conseguenze delle decisioni.',
            'prologue (600-2200 caratteri) deve essere una vera scena iniziale in seconda persona: luogo concreto, persone o forze già presenti, problema immediato, elementi osservabili e una scelta aperta. Non decidere per il protagonista.',
            'starterProperties è un array: usalo solo se la premessa assegna davvero beni/attività. Ogni elemento: name, description, notes, type, condition, baseValue, income, businessCash.',
            '',
            '=== worldBlueprint OBBLIGATORIO ===',
            'worldBlueprint = {',
            '  "centralConflict": "conflitto preciso e già attivo",',
            '  "stakes": "cosa cambia concretamente se le forze prevalgono o falliscono",',
            '  "scope": { "scale": "locale|regionale|multi-area|geopolitica o descrizione equivalente", "primaryArea": "area principale", "secondaryAreas": ["solo aree realmente utili"], "travelLogic": "quando e perché la storia si sposta" },',
            '  "institutions": { "politicalSystem": "potere e istituzioni", "economy": "come circolano denaro/risorse/lavoro", "law": "vincoli legali o consuetudinari", "socialStructure": "ceti/reti/gruppi", "technology": "livello tecnico coerente con l’epoca", "cultureReligion": "valori, cultura, religione se pertinenti" },',
            '  "locationNeeds": [{ "nameHint": "nome solo se già canonico o davvero utile", "type": "tipo funzionale", "purpose": "cosa permette di fare", "storyLink": "legame con conflitto/prologo/proprietà" }],',
            '  "factionNeeds": [{ "nameHint": "nome concreto se utile", "type": "organizzazione coerente", "roleInConflict": "funzione nella tensione", "goal": "obiettivo autonomo", "resources": "leve concrete", "autonomousPressure": "cosa farà senza il protagonista" }],',
            '  "characterNeeds": [{ "nameHint": "nome se già necessario", "role": "ruolo specifico", "storyFunction": "perché esiste in questa storia", "factionHint": "collegamento", "locationHint": "dove opera", "publicGoal": "obiettivo visibile", "privateGoal": "interesse personale", "autonomy": "iniziativa possibile fuori scena" }],',
            '  "activeForces": [{ "name": "pressione/crisi/processo", "actor": "chi o cosa la muove", "objective": "direzione", "cause": "perché esiste", "escalation": "cosa succede se continua" }],',
            '  "startingSituation": { "locationHint": "luogo implicato dal prologo", "immediateProblem": "problema già presente", "openThreads": ["3-8 questioni non risolte"], "firstDecision": "decisione aperta senza esito imposto" }',
            '}.',
            '',
            '=== QUANTITÀ E QUALITÀ ===',
            '- locationNeeds: 6-12 elementi pertinenti. Non sono riempitivi geografici: ognuno deve avere una funzione di gioco.',
            '- factionNeeds: 3-6 gruppi con interessi distinti. Devono poter entrare in conflitto o cooperare anche senza il protagonista.',
            '- characterNeeds: 6-12 ruoli/personaggi necessari. Almeno 2 devono avere obiettivi importanti non centrati sul protagonista.',
            '- activeForces: 3-6 processi già in corso e capaci di generare eventi autonomi.',
            '- canonFacts: 4-10 fatti già veri e non modificabili senza un evento di gioco.',
            '- openThreads: 3-8 domande o tensioni intenzionalmente non risolte all’inizio.',
            '',
            '=== COERENZA PER GENERE E SCALA ===',
            `Per questo genere considera come riferimento: ${JSON.stringify(GENRE_DETAILS[base.genre] || GENRE_DETAILS.fantasy)}.`,
            '- Questi riferimenti sono categorie funzionali, NON nomi da copiare.',
            '- Una storia business, sportiva, contemporanea, crime o rurale non deve inventare regni/continenti/guerre se la premessa è locale.',
            '- Una storia storica deve rispettare data, tecnologia, istituzioni, moneta, ceti e mentalità plausibili.',
            '- Una storia fantasy può essere locale o geopolitica: decide la premessa, non il genere da solo.',
            '- Non usare personaggi standard intercambiabili. Ogni characterNeed deve essere radicato in luogo, fazione, proprietà, conflitto o forza attiva.',
            '- Non usare nomi di esempio ricorrenti o preset del gioco.',
            '- Non inserire tag meccanici nella scheda e non citare queste istruzioni.'
        ].join('\n');
    }

    function storyBlueprintSummary(story = {}) {
        const blueprint = normalizeWorldBlueprint(story.worldBlueprint, story, story.genre);
        const lines = [
            '=== BLUEPRINT STRUTTURATO DELLA STORIA (CANONE) ===',
            `Conflitto centrale: ${blueprint.centralConflict}`,
            `Posta in gioco: ${blueprint.stakes}`,
            `Scala: ${blueprint.scope.scale}; area primaria: ${blueprint.scope.primaryArea}; aree secondarie: ${blueprint.scope.secondaryAreas.join(', ') || 'nessuna obbligatoria'}`,
            `Logica spostamenti: ${blueprint.scope.travelLogic}`,
            `Istituzioni/politica: ${blueprint.institutions.politicalSystem}`,
            `Economia: ${blueprint.institutions.economy}`,
            `Legge: ${blueprint.institutions.law}`,
            `Struttura sociale: ${blueprint.institutions.socialStructure}`,
            `Tecnologia: ${blueprint.institutions.technology}`,
            `Cultura/religione: ${blueprint.institutions.cultureReligion}`,
            `Bisogni luoghi: ${JSON.stringify(blueprint.locationNeeds)}`,
            `Bisogni fazioni: ${JSON.stringify(blueprint.factionNeeds)}`,
            `Bisogni personaggi: ${JSON.stringify(blueprint.characterNeeds)}`,
            `Forze attive: ${JSON.stringify(blueprint.activeForces)}`,
            `Situazione iniziale: ${JSON.stringify(blueprint.startingSituation)}`,
            `Fatti canonici: ${normalizeTextList(story.canonFacts, [], 10, 360).join(' | ') || 'nessuno aggiuntivo'}`,
            `Fili aperti: ${normalizeTextList(story.openThreads, blueprint.startingSituation.openThreads, 10, 360).join(' | ')}`,
            'REGOLA: il generatore del mondo deve concretizzare questo blueprint, non sostituirlo con archetipi del genere. Può inventare nomi e dettagli mancanti, ma non cambiare scala, epoca, conflitto, istituzioni o funzioni già definite.'
        ];
        return lines.join('\n');
    }

    return {
        GENRES,
        BLUEPRINTS,
        GENRE_DETAILS,
        genreOf,
        START_PRESETS,
        inferStartTime,
        createFallbackWorldBlueprint,
        normalizeWorldBlueprint,
        createFallbackStory,
        completeStory,
        parseGeneratedStory,
        buildGenerationPrompt,
        storyBlueprintSummary
    };
});

// Collega il blueprint strutturato di "Crea storia IA" al world-builder anche
// quando i due moduli vengono caricati in un ordine diverso nel browser.
(function installStoryBlueprintWorldBridge(root) {
    'use strict';
    const storyApi = root && root.CronacheStoryGenerator;
    if (!storyApi) return;

    function patchWorldGenerator() {
        const generator = root && root.CronacheWorldGenerator;
        if (!generator || generator.__storyBlueprintBridgeVersion >= 1) return;
        const append = story => `\n\n${storyApi.storyBlueprintSummary(story || {})}`;

        if (typeof generator.buildGenerationPrompt === 'function') {
            const original = generator.buildGenerationPrompt.bind(generator);
            generator.buildGenerationPrompt = function blueprintAwareGeneration(story, context = {}) {
                return `${original(story, context)}${append(story)}`;
            };
        }
        if (typeof generator.buildLocationsPrompt === 'function') {
            const original = generator.buildLocationsPrompt.bind(generator);
            generator.buildLocationsPrompt = function blueprintAwareLocations(story, context = {}) {
                return `${original(story, context)}${append(story)}`;
            };
        }
        if (typeof generator.buildNpcPrompt === 'function') {
            const original = generator.buildNpcPrompt.bind(generator);
            generator.buildNpcPrompt = function blueprintAwareNpcs(world, story, context = {}) {
                return `${original(world, story, context)}${append(story)}`;
            };
        }
        generator.__storyBlueprintBridgeVersion = 1;
    }

    patchWorldGenerator();
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', patchWorldGenerator, { once: true });
        }
        setTimeout(patchWorldGenerator, 0);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);

// Integrazione con l'editor e con il budget IA della creazione storia.
// Conserva i campi strutturati non visibili nell'editor e impedisce che il JSON
// ricco venga troncato dal vecchio limite di 1800 token.
(function installRichStoryEditorIntegration(root) {
    'use strict';
    const storyApi = root && root.CronacheStoryGenerator;
    if (!storyApi || storyApi.__richStoryEditorIntegrationVersion >= 1) return;

    const originalCompleteStory = storyApi.completeStory.bind(storyApi);
    storyApi.completeStory = function preserveGeneratedBlueprint(input = {}, seed = {}) {
        const draft = root && root.__cronacheGeneratedStoryDraft;
        const sameGenre = !draft?.genre || !input?.genre || String(draft.genre) === String(input.genre);
        const enriched = draft && typeof draft === 'object' && !input.worldBlueprint && sameGenre
            ? {
                ...input,
                worldBlueprint: draft.worldBlueprint,
                canonFacts: input.canonFacts || draft.canonFacts,
                openThreads: input.openThreads || draft.openThreads
            }
            : input;
        return originalCompleteStory(enriched, seed);
    };

    function patchAiBudget() {
        const ai = root && root.CronacheAI;
        if (!ai || ai.__richStoryBudgetVersion >= 1 || typeof ai.getTaskProfile !== 'function') return;
        const originalGetTaskProfile = ai.getTaskProfile.bind(ai);
        ai.getTaskProfile = function richStoryTaskProfile(task, overrides = {}) {
            const profile = originalGetTaskProfile(task, overrides);
            if (task !== 'story') return profile;
            return {
                ...profile,
                maxInputTokens: Math.max(12000, Number(profile.maxInputTokens) || 0),
                maxOutputTokens: Math.max(4600, Number(profile.maxOutputTokens) || 0),
                timeoutMs: Math.max(80000, Number(profile.timeoutMs) || 0),
                maxAttempts: Math.max(2, Number(profile.maxAttempts) || 0)
            };
        };
        ai.__richStoryBudgetVersion = 1;
    }

    function patchEditorFunctions() {
        patchAiBudget();
        if (!root || root.__richStoryEditorFunctionsPatched) return;
        const originalOpen = typeof root.openStoryEditor === 'function' ? root.openStoryEditor : null;
        const originalRender = typeof root.renderGeneratedStory === 'function' ? root.renderGeneratedStory : null;
        if (!originalOpen || !originalRender) return;

        root.openStoryEditor = function richOpenStoryEditor(story = null, ...args) {
            root.__cronacheGeneratedStoryDraft = story && typeof story === 'object' ? story : null;
            return originalOpen.call(this, story, ...args);
        };

        root.renderGeneratedStory = function richRenderGeneratedStory(story, ...args) {
            if (story && typeof story === 'object') root.__cronacheGeneratedStoryDraft = story;
            return originalRender.call(this, story, ...args);
        };
        root.__richStoryEditorFunctionsPatched = true;
    }

    storyApi.__richStoryEditorIntegrationVersion = 1;
    patchAiBudget();
    patchEditorFunctions();
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', patchEditorFunctions, { once: true });
        }
        setTimeout(patchEditorFunctions, 0);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
