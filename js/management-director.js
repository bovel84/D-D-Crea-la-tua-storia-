(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheManagementDirector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 300) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    const MANAGEMENT_MODE = Object.freeze({
        CHARACTER: 'personaggio',
        KINGDOM: 'regno',
        BUSINESS: 'attivita'
    });

    function deriveManagementPressure(memory) {
        const management = memory?.management || {};
        const businesses = asArray(management.businesses).filter(item => item && item.status !== 'closed');
        const businessSignals = [];
        let businessLevel = 0;
        businesses.forEach(business => {
            const name = clean(business.name || business.propertyName || 'Attività', 80);
            const report = business.lastReport || {};
            const profit = number(report.netProfit);
            const lowStock = Array.isArray(report.lowStock)
                ? report.lowStock.length
                : asArray(business.products).filter(product =>
                    product?.active !== false && number(product.stock) <= Math.max(0, number(product.reorderPoint))
                ).length;
            if (number(business.cash) < 0) {
                businessLevel += 28;
                businessSignals.push(`${name}: cassa negativa`);
            }
            if (profit < 0) {
                businessLevel += 16;
                businessSignals.push(`${name}: ultimo periodo in perdita`);
            }
            if (lowStock > 0) {
                businessLevel += Math.min(22, 5 + lowStock * 4);
                businessSignals.push(`${name}: ${lowStock} prodotti sotto scorta`);
            }
            if (number(business.customerSatisfaction, 60) < 40) {
                businessLevel += 14;
                businessSignals.push(`${name}: clienti insoddisfatti`);
            }
        });
        businessLevel = Math.max(0, Math.min(100, businessLevel));

        const kingdom = memory?.kingdom || {};
        const kingdomSignals = [];
        let kingdomLevel = 0;
        if (kingdom.active) {
            if (number(kingdom.treasury) < 0) {
                kingdomLevel += 28;
                kingdomSignals.push('tesoro negativo');
            }
            if (number(kingdom.food) <= 0) {
                kingdomLevel += 30;
                kingdomSignals.push('riserve alimentari esaurite');
            }
            if (number(kingdom.stability, 50) < 40) {
                kingdomLevel += 20;
                kingdomSignals.push(`stabilità ${Math.round(number(kingdom.stability))}%`);
            }
            if (number(kingdom?.people?.unrest) >= 55) {
                kingdomLevel += 25;
                kingdomSignals.push(`disordini ${Math.round(number(kingdom.people.unrest))}%`);
            }
            if (number(kingdom?.people?.health, 50) < 35) {
                kingdomLevel += 12;
                kingdomSignals.push(`salute pubblica ${Math.round(number(kingdom.people.health))}%`);
            }
            const crises = asArray(kingdom.crises).filter(crisis => crisis?.status === 'active' && number(crisis.severity) >= 60);
            if (crises.length) {
                const severity = Math.max(...crises.map(crisis => number(crisis.severity)));
                kingdomLevel += Math.min(35, Math.round(severity * 0.35));
                kingdomSignals.push(`crisi attiva: ${clean(crises[0].name || crises[0].title || crises[0].description || 'crisi grave', 100)}`);
            }
        }
        kingdomLevel = Math.max(0, Math.min(100, kingdomLevel));

        const useKingdom = kingdomLevel >= businessLevel && kingdomLevel > 0;
        const level = useKingdom ? kingdomLevel : businessLevel;
        const signals = (useKingdom ? kingdomSignals : businessSignals).slice(0, 4);
        return {
            level,
            type: level ? (useKingdom ? 'regno' : 'attivita') : 'nessuna',
            summary: signals.length ? signals.join(' · ') : 'nessuna criticità gestionale rilevante',
            signals,
            businessLevel,
            kingdomLevel,
            businessSignals: businessSignals.slice(0, 5),
            kingdomSignals: kingdomSignals.slice(0, 5)
        };
    }

    function managementIntent(action, fallback = 'esplorazione') {
        const text = clean(action, 800).toLowerCase();
        if (/\b(tass|impost|decret|legge|consiglio|censiment|reclut|sussid|territor|sanit|istruzion|giustizia|govern|regno|tesor|bilanc|popol|provinc|esercit|diplom|trattat|confine|infrastruttur|ordine pubblico|amministrazion)\w*/.test(text)) return 'governo';
        if (/\b(compr|vend|prezz|fornitor|client|marketing|magazzin|scort|invest|assum|licenzi|pago|incass|prestito|affar|negozio|impresa|azienda|attivit|produzion|personale|dipendent|contratt|ricav|costi?|margine|filiale|stabiliment|inventario)\w*/.test(text)) return 'economia';
        return fallback;
    }

    function detectNarrativeMode(action, context = {}) {
        const text = clean(action, 900).toLowerCase();
        const memory = context?.memory || {};
        const explicitIntent = managementIntent(action, '');

        if (explicitIntent === 'governo') return MANAGEMENT_MODE.KINGDOM;
        if (explicitIntent === 'economia') return MANAGEMENT_MODE.BUSINESS;

        const kingdomDomain = /\b(acquedott|strad|porto|fortific|caserm|ospedal|scuol|granaio|raccolt|carest|rivolt|nobilt|clero|borghes|contadin|province|ducat|contea|governator|ministro)\w*/;
        const businessDomain = /\b(officin|fabbrica|bottega|taverna come attivit|ristorant|locanda come attivit|deposito|capannone|catena|franchising|turni di lavoro|stipendi|buste paga)\w*/;
        if (memory?.kingdom?.active && kingdomDomain.test(text)) return MANAGEMENT_MODE.KINGDOM;
        if (asArray(memory?.management?.businesses).some(item => item?.status !== 'closed') && businessDomain.test(text)) return MANAGEMENT_MODE.BUSINESS;

        const previousIntent = clean(
            context?.director?.currentIntent ||
            context?.memory?.director?.currentIntent ||
            context?.director?.lastPlan?.intent ||
            context?.memory?.director?.lastPlan?.intent,
            40
        ).toLowerCase();
        const continuation = /^(approvo|confermo|procedo|continua|accetto|rifiuto|vai avanti|lo faccio|esegui|mantengo la decisione)\b/;
        if (continuation.test(text)) {
            if (previousIntent === 'governo') return MANAGEMENT_MODE.KINGDOM;
            if (previousIntent === 'economia') return MANAGEMENT_MODE.BUSINESS;
        }

        return MANAGEMENT_MODE.CHARACTER;
    }

    function buildNarrativeModeInstruction(mode, management) {
        if (mode === MANAGEMENT_MODE.KINGDOM) {
            return [
                'MODALITÀ NARRATIVA: GESTIONE DEL REGNO — PRIORITÀ STRATEGICA',
                '- Il giocatore sta agendo come sovrano/governante: narra soprattutto sistemi, decisioni pubbliche e risultati, non micro-azioni da avventura.',
                '- Struttura il turno come: situazione iniziale -> decisione -> attuazione -> reazioni degli stakeholder -> effetti misurabili -> nuova scelta/problema.',
                '- Mostra conseguenze su almeno 2-3 assi pertinenti tra tesoro/economia, popolo e classi sociali, stabilità, territori, istituzioni/fazioni, esercito, diplomazia.',
                '- Se una misura richiede tempo, NON trattarla come completata all’istante: distingui ordine, implementazione e risultati nel tempo.',
                '- Fai reagire ministri, nobili, popolo, categorie economiche, territori e potenze esterne quando pertinenti.',
                '- Usa scene RPG dettagliate solo se il giocatore entra personalmente in un incontro, viaggio, duello, ispezione o dialogo decisivo.',
                '- Evita riempitivi tipo “attraversi il corridoio / osservi la stanza” quando il cuore dell’azione è amministrativo.',
                `- Pressione gestionale osservata: ${management?.kingdomLevel ?? 0}/100. Segnali: ${management?.kingdomSignals?.join(' · ') || 'nessun segnale critico'}.`
            ].join('\n');
        }

        if (mode === MANAGEMENT_MODE.BUSINESS) {
            return [
                'MODALITÀ NARRATIVA: GESTIONE DELL’ATTIVITÀ — PRIORITÀ OPERATIVA',
                '- Il giocatore sta dirigendo un’attività: narra operazioni, mercato e decisioni manageriali prima della componente RPG.',
                '- Struttura il turno come: dato/problema -> decisione -> esecuzione -> reazioni -> impatto su cassa/ricavi/costi/scorte/reputazione -> prossimo trade-off.',
                '- Coinvolgi clienti, dipendenti, fornitori, concorrenti, finanziatori e autorità quando pertinenti.',
                '- Se la decisione produce effetti differiti, separa l’ordine dal risultato e fai avanzare il tempo in modo credibile.',
                '- Non inventare numeri precisi senza base: usa dati persistenti, variazioni motivate o stime esplicitamente presentate come tali.',
                '- Usa la narrazione RPG ravvicinata solo per trattative, sopralluoghi o interazioni personali davvero decisive.',
                '- Evita di trasformare una scelta aziendale in una quest o in una scena d’avventura se non nasce logicamente dalla situazione.',
                `- Pressione gestionale osservata: ${management?.businessLevel ?? 0}/100. Segnali: ${management?.businessSignals?.join(' · ') || 'nessun segnale critico'}.`
            ].join('\n');
        }

        return [
            'MODALITÀ NARRATIVA: PERSONAGGIO / RPG',
            '- Il giocatore sta agendo direttamente come personaggio: usa una scena immediata, concreta e immersiva.',
            '- Mantieni agenzia, dialoghi, luogo, rischi e conseguenze personali in primo piano.',
            '- Regno e attività restano sistemi di sfondo: falli intervenire solo quando hanno una conseguenza concreta sulla scena o sulla scelta attuale.',
            '- Non convertire automaticamente ogni azione personale in un report gestionale solo perché il personaggio possiede un regno o un’attività.'
        ].join('\n');
    }

    function augmentPlan(basePlan, action, context) {
        const memory = context?.memory || {};
        const management = deriveManagementPressure(memory);
        const mode = detectNarrativeMode(action, { ...context, director: basePlan?.state || context?.director });
        const intent = mode === MANAGEMENT_MODE.KINGDOM
            ? 'governo'
            : mode === MANAGEMENT_MODE.BUSINESS
                ? 'economia'
                : managementIntent(action, basePlan?.intent || 'esplorazione');
        const baseLevel = number(basePlan?.pressure?.level, 20);
        const bonus = management.level >= 70
            ? Math.round(management.level * 0.34)
            : management.level >= 40
                ? Math.round(management.level * 0.22)
                : Math.round(management.level * 0.10);
        const intentBonus = intent === 'governo' || intent === 'economia' ? 6 : 0;
        const pressureLevel = Math.max(10, Math.min(100, baseLevel + bonus + intentBonus));
        const managementDominates = mode !== MANAGEMENT_MODE.CHARACTER || (management.level >= 45 && bonus >= 10);
        const pressureType = managementDominates && mode !== MANAGEMENT_MODE.CHARACTER
            ? mode
            : managementDominates
                ? management.type
                : (basePlan?.pressure?.type || 'narrativa');
        const sceneFocus = mode === MANAGEMENT_MODE.KINGDOM
            ? 'Decisioni pubbliche, implementazione, costi, classi sociali, fazioni, istituzioni, territori e reazioni esterne'
            : mode === MANAGEMENT_MODE.BUSINESS
                ? 'Operazioni, cassa, costi, ricavi, scorte, contratti e reazioni di clienti, dipendenti, fornitori e concorrenti'
                : basePlan?.sceneFocus;
        const managementInstruction = `\n\nGESTIONE PERSISTENTE:\n- Pressione gestionale: ${management.level}/100 (${management.type}).\n- Segnali reali: ${management.summary}.\n- Se questi segnali sono rilevanti per il turno, trasformali in reazioni osservabili di clienti, dipendenti, fornitori, concorrenti, popolo, fazioni, istituzioni o potenze.\n- Non limitarti a cambiare numeri in silenzio e non inventare una crisi gestionale quando i segnali sono assenti.`;
        const modeInstruction = buildNarrativeModeInstruction(mode, management);
        const state = basePlan?.state && typeof basePlan.state === 'object' ? {
            ...basePlan.state,
            currentIntent: intent,
            narrativeMode: mode,
            scene: {
                ...(basePlan.state.scene || {}),
                focus: sceneFocus,
                pressure: pressureLevel
            },
            lastPlan: {
                ...(basePlan.state.lastPlan || {}),
                intent,
                pressure: pressureLevel,
                narrativeMode: mode,
                managementType: management.type,
                managementPressure: management.level
            }
        } : basePlan?.state;
        return {
            ...basePlan,
            intent,
            narrativeMode: mode,
            sceneFocus,
            pressure: {
                ...(basePlan?.pressure || {}),
                level: pressureLevel,
                type: pressureType,
                management,
                description: managementDominates
                    ? `La pressione nasce anche dalla gestione: ${management.summary}.`
                    : basePlan?.pressure?.description
            },
            state,
            prompt: `${basePlan?.prompt || ''}${managementInstruction}\n\n${modeInstruction}`
        };
    }

    function augmentNarrativeDecision(baseDecision, action, state) {
        if (!baseDecision || typeof baseDecision !== 'object') return baseDecision;
        const memory = state?.memory || {};
        const management = deriveManagementPressure(memory);
        const mode = detectNarrativeMode(action, state || {});
        const focus = mode === MANAGEMENT_MODE.KINGDOM
            ? 'governo'
            : mode === MANAGEMENT_MODE.BUSINESS
                ? 'economia'
                : baseDecision?.decision?.focus;

        const compass = baseDecision.compass && typeof baseDecision.compass === 'object'
            ? { ...baseDecision.compass, currentFocus: focus || baseDecision.compass.currentFocus }
            : baseDecision.compass;
        const decision = baseDecision.decision && typeof baseDecision.decision === 'object'
            ? {
                ...baseDecision.decision,
                focus: focus || baseDecision.decision.focus,
                narrativeMode: mode,
                proactiveBeat: mode === MANAGEMENT_MODE.KINGDOM
                    ? 'Fai avanzare una reazione sistemica alla decisione: almeno uno tra popolo/classi sociali, istituzioni/fazioni, territori, economia o diplomazia deve cambiare in modo osservabile.'
                    : mode === MANAGEMENT_MODE.BUSINESS
                        ? 'Fai avanzare una reazione operativa o di mercato: almeno uno tra clienti, personale, fornitori, concorrenti, cassa, scorte o contratti deve reagire in modo osservabile.'
                        : baseDecision.decision.proactiveBeat
            }
            : baseDecision.decision;

        return {
            ...baseDecision,
            compass,
            decision,
            narrativeMode: mode,
            prompt: `${baseDecision.prompt || ''}\n\n${buildNarrativeModeInstruction(mode, management)}`
        };
    }

    function installGameDirectorPatch() {
        const director = root.CronacheDirector;
        if (!director?.GameDirector) return false;
        if (director.GameDirector.prototype.planTurn?.__managementDirectorWrapped) return true;
        const original = director.GameDirector.prototype.planTurn;
        if (typeof original !== 'function') return false;
        const wrapped = function managementAwarePlanTurn(action, context) {
            return augmentPlan(original.call(this, action, context), action, context);
        };
        wrapped.__managementDirectorWrapped = true;
        wrapped.__managementDirectorOriginal = original;
        director.GameDirector.prototype.planTurn = wrapped;
        director.deriveManagementPressure = deriveManagementPressure;
        director.managementIntent = managementIntent;
        director.detectNarrativeMode = detectNarrativeMode;
        root.__cronacheManagementDirectorVersion = PATCH_VERSION;
        return true;
    }

    function installNarrativeMasterPatch() {
        const narrative = root.CronacheNarrative;
        if (!narrative?.NarrativeMasterEngine) return false;
        if (narrative.NarrativeMasterEngine.prototype.decide?.__managementNarrativeWrapped) return true;
        const original = narrative.NarrativeMasterEngine.prototype.decide;
        if (typeof original !== 'function') return false;
        const wrapped = function managementAwareNarrativeDecision(action, state) {
            return augmentNarrativeDecision(original.call(this, action, state), action, state);
        };
        wrapped.__managementNarrativeWrapped = true;
        wrapped.__managementNarrativeOriginal = original;
        narrative.NarrativeMasterEngine.prototype.decide = wrapped;
        narrative.detectNarrativeMode = detectNarrativeMode;
        narrative.buildNarrativeModeInstruction = buildNarrativeModeInstruction;
        return true;
    }

    function install() {
        const directorInstalled = installGameDirectorPatch();
        const narrativeInstalled = installNarrativeMasterPatch();
        return directorInstalled || narrativeInstalled;
    }

    function scheduleInstall() {
        install();
        if (typeof setTimeout !== 'function') return;
        [0, 80, 250, 700, 1500, 3000].forEach(delay => setTimeout(install, delay));
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        MANAGEMENT_MODE,
        deriveManagementPressure,
        managementIntent,
        detectNarrativeMode,
        buildNarrativeModeInstruction,
        augmentPlan,
        augmentNarrativeDecision,
        install,
        installGameDirectorPatch,
        installNarrativeMasterPatch
    };
});
