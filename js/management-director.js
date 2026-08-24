(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheManagementDirector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 4;
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
        const hasKingdom = memory?.kingdom?.active === true;
        const hasBusiness = asArray(memory?.management?.businesses).some(item => item?.status !== 'closed');
        const personalScene = /\b(parl|chied|domand|dico|salut|incontr|entro|esco|vado|cammin|corr|cavalc|viaggi|guard|osserv|cerc|indag|combat|attacc|difend|mang|dorm|ripos|prend|apr|legg|segu|visito|passegg|nuot|scal|sedut|sdrai|bev|cucin|lav|indoss|vest|spogli)\w*/.test(text);
        const managementCommand = /\b(ordino|ordine|approv|decid|stabilisc|eman|aument|riduc|abbass|alz|tagli|stanz|finanzi|riform|costruisc|avvio|lancio|nomino|assegn|reclut|sovvenzion|assum|licenz|invest|compro|vend|fiss|modific|pianific|negozi|tratt|firm)\w*/.test(text);

        // A noun from the management domain must not steal an otherwise personal scene.
        // "Parlo con il ministro" is RPG; "ordino al ministro di alzare le tasse" is government.
        if (personalScene && !managementCommand) return MANAGEMENT_MODE.CHARACTER;

        const explicitIntent = managementIntent(action, '');
        if (explicitIntent === 'governo') return MANAGEMENT_MODE.KINGDOM;
        if (explicitIntent === 'economia') return MANAGEMENT_MODE.BUSINESS;

        const kingdomDomain = /\b(acquedott|strad|porto|fortific|caserm|ospedal|scuol|granaio|raccolt|carest|rivolt|nobilt|clero|borghes|contadin|province|ducat|contea|governator|ministro)\w*/;
        const businessDomain = /\b(officin|fabbrica|bottega|taverna come attivit|ristorant|locanda come attivit|deposito|capannone|catena|franchising|turni di lavoro|stipendi|buste paga)\w*/;
        if (hasKingdom && kingdomDomain.test(text)) return MANAGEMENT_MODE.KINGDOM;
        if (hasBusiness && businessDomain.test(text)) return MANAGEMENT_MODE.BUSINESS;

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

        // Default: when the protagonist is a ruler or business owner, generic actions
        // ("aspetto notizie", "controllo i rapporti", "penso alla situazione")
        // should default to management mode — not RPG — unless a personal verb
        // explicitly placed the scene in CHARACTER mode above.
        if (hasKingdom && hasBusiness) {
            // If both are active, pick the one with higher pressure.
            const pressure = deriveManagementPressure(memory);
            return pressure.kingdomLevel >= pressure.businessLevel ? MANAGEMENT_MODE.KINGDOM : MANAGEMENT_MODE.BUSINESS;
        }
        if (hasKingdom) return MANAGEMENT_MODE.KINGDOM;
        if (hasBusiness) return MANAGEMENT_MODE.BUSINESS;

        return MANAGEMENT_MODE.CHARACTER;
    }

    function buildStrategicAssessment(mode, memory) {
        if (mode === MANAGEMENT_MODE.KINGDOM) {
            const kingdom = memory?.kingdom || {};
            const people = kingdom.people || {};
            const army = kingdom.army || {};
            const crises = asArray(kingdom.crises).filter(c => c?.status === 'active');
            const stability = number(kingdom.stability, 50);
            const approval = number(people.approval, 50);
            const unrest = number(people.unrest, 20);
            const health = number(people.health, 50);
            const foodSecurity = number(people.foodSecurity, 50);
            const employment = number(people.employment, 60);
            const treasury = number(kingdom.treasury, 0);
            const food = number(kingdom.food, 0);
            const prosperity = number(kingdom.prosperity, 50);
            const legitimacy = number(kingdom.legitimacy, 50);

            const kpis = [
                `Stabilità ${Math.round(stability)}/100`,
                `Legittimità ${Math.round(legitimacy)}/100`,
                `Prosperità ${Math.round(prosperity)}/100`,
                `Consenso ${Math.round(approval)}/100`,
                `Disordini ${Math.round(unrest)}/100`,
                `Salute pubblica ${Math.round(health)}/100`,
                `Sicurezza alimentare ${Math.round(foodSecurity)}/100`,
                `Occupazione ${Math.round(employment)}/100`,
                `Tesoro ${Math.round(treasury)}`,
                `Viveri ${Math.round(food)}`
            ];

            const risks = [];
            const opportunities = [];
            const priorities = [];

            if (food <= 0 || foodSecurity < 35) {
                risks.push('carestia imminente');
                priorities.push('Garantire approvvigionamento alimentare e aiuti ai territori colpiti');
            }
            if (unrest >= 50) {
                risks.push('rivolta popolare');
                priorities.push('Ridurre la pressione fiscale e ascolare le rivendicazioni');
            }
            if (treasury < 0) {
                risks.push('tesoro negativo');
                priorities.push('Riequilibrare il bilancio senza comprimere servizi essenziali');
            }
            if (health < 35) {
                risks.push('emergenza sanitaria');
                priorities.push('Investire in infrastrutture sanitarie e igiene pubblica');
            }
            if (employment < 60) {
                risks.push('disoccupazione elevata');
                priorities.push('Creare posti di lavoro compatibili con le qualifiche disponibili');
            }
            if (stability < 40) {
                risks.push('governo fragile');
                priorities.push('Rafforzare legittimità con riforme e consultazione del consiglio');
            }
            if (crises.length) {
                risks.push(`${crises.length} crisi attiva/e: ${crises.map(c => clean(c.name || c.title || 'crisi', 60)).join(', ')}`);
                priorities.push(`Gestire la crisi più grave: ${clean(crises[0].name || crises[0].title || 'crisi', 80)}`);
            }
            if (army?.readiness != null && number(army.readiness, 50) < 40) {
                risks.push('esercito impreparato');
                priorities.push('Addestrare e riequipaggiare le forze armate');
            }

            if (stability >= 65 && approval >= 55) opportunities.push('capitale politico per riforme ambiziose');
            if (prosperity >= 60 && treasury > 200) opportunities.push('risorse per investimenti infrastrutturali');
            if (food > 100 && foodSecurity >= 60) opportunities.push('surplus agricolo commerciabile');
            if (employment >= 75) opportunities.push('base produttiva e fiscale solida');

            if (!priorities.length) priorities.push('Consolidare crescita, servizi e coesione sociale');
            if (!opportunities.length) opportunities.push('nessuna opportunità strategica evidente al momento');

            const threatLevel = risks.length >= 4 ? 'CRITICO' : risks.length >= 2 ? 'ELEVATO' : risks.length >= 1 ? 'MODERATO' : 'BASSO';

            return [
                'ANALISI STRATEGICA DEL REGNO',
                `Livello minaccia: ${threatLevel}`,
                `KPI: ${kpis.join(' | ')}`,
                `Rischi: ${risks.length ? risks.join('; ') : 'nessuno rilevante'}`,
                `Opportunità: ${opportunities.join('; ')}`,
                `Priorità d'azione: ${priorities.join('; ')}`,
                `Prossima decisione attesa: il giocatore deve affrontare ${priorities[0].toLowerCase()}.`
            ].join('\n');
        }

        if (mode === MANAGEMENT_MODE.BUSINESS) {
            const businesses = asArray(memory?.management?.businesses).filter(b => b?.status !== 'closed');
            if (!businesses.length) return '';

            const assessments = businesses.map(business => {
                const name = clean(business.name || business.propertyName || 'Attività', 80);
                const cash = number(business.cash, 0);
                const satisfaction = number(business.customerSatisfaction, 60);
                const reputation = number(business.reputation, 50);
                const report = business.lastReport || {};
                const profit = number(report.netProfit);
                const revenue = number(report.revenue);
                const margin = number(report.margin);
                const lowStock = asArray(report.lowStock).length ||
                    asArray(business.products).filter(p => p?.active !== false && number(p.stock) <= Math.max(0, number(p.reorderPoint))).length;
                const pendingOrders = asArray(business.pendingOrders).filter(o => o?.status === 'pending').length;

                const kpis = [
                    `Cassa ${Math.round(cash)}`,
                    `Reputazione ${Math.round(reputation)}/100`,
                    `Soddisfazione clienti ${Math.round(satisfaction)}/100`,
                    profit !== 0 ? `Utile ultimo periodo ${Math.round(profit)}` : '',
                    margin !== 0 ? `Margine ${Math.round(margin)}%` : '',
                    lowStock > 0 ? `Sotto scorta: ${lowStock} prodotti` : '',
                    pendingOrders > 0 ? `Ordini pendenti: ${pendingOrders}` : ''
                ].filter(Boolean);

                const risks = [];
                const opportunities = [];
                const priorities = [];

                if (cash < 0) {
                    risks.push('cassa negativa');
                    priorities.push('Coprire il deficit con credito o riduzione dei costi');
                }
                if (profit < 0) {
                    risks.push('perdita nel periodo');
                    priorities.push('Rivedere prezzi, costi o mix prodotti');
                }
                if (lowStock > 0) {
                    risks.push(`${lowStock} prodotti sotto scorta`);
                    priorities.push(`Riordinare i prodotti in esaurimento`);
                }
                if (satisfaction < 40) {
                    risks.push('clienti insoddisfatti');
                    priorities.push('Migliorare qualità del servizio e ascoltare i reclami');
                }
                if (reputation < 40) {
                    risks.push('reputazione debole');
                    priorities.push('Investire in marketing e relazioni pubbliche');
                }
                if (pendingOrders > 3) {
                    risks.push('troppi ordini in sospeso');
                    priorities.push('Sbloccare la filiera fornitori');
                }

                if (cash > 300 && profit >= 0) opportunities.push('risorse per espandere o diversificare');
                if (satisfaction >= 70) opportunities.push('base clienti fedele da valorizzare');
                if (reputation >= 65) opportunities.push('brand forte per partnership o nuove filiali');
                if (profit > 100 && margin > 20) opportunities.push('margine sano per reinvestire');

                if (!priorities.length) priorities.push('Consolidare posizione di mercato e ottimizzare operazioni');
                if (!opportunities.length) opportunities.push('nessuna opportunità evidente al momento');

                const threatLevel = risks.length >= 4 ? 'CRITICO' : risks.length >= 2 ? 'ELEVATO' : risks.length >= 1 ? 'MODERATO' : 'BASSO';

                return [
                    `ANALISI STRATEGICA — ${name}`,
                    `Livello minaccia: ${threatLevel}`,
                    `KPI: ${kpis.join(' | ')}`,
                    `Rischi: ${risks.length ? risks.join('; ') : 'nessuno rilevante'}`,
                    `Opportunità: ${opportunities.join('; ')}`,
                    `Priorità d'azione: ${priorities.join('; ')}`,
                    `Prossima decisione attesa: il giocatore deve affrontare ${priorities[0].toLowerCase()}.`
                ].join('\n');
            });

            return assessments.join('\n\n');
        }

        return '';
    }

    function buildNarrativeModeInstruction(mode, management, memory) {
        if (mode === MANAGEMENT_MODE.KINGDOM) {
            return [
                'MODALITÀ NARRATIVA: GESTIONE DEL REGNO — PRIORITÀ STRATEGICA',
                '- Il giocatore sta agendo come sovrano/governante: narra soprattutto sistemi, decisioni pubbliche e risultati, non micro-azioni da avventura.',
                '- Struttura il turno come: situazione iniziale -> decisione -> attuazione -> reazioni degli stakeholder -> effetti misurabili -> nuova scelta/problema.',
                '- Mostra conseguenze su almeno 2-3 assi pertinenti tra tesoro/economia, popolo e classi sociali, stabilità, territori, istituzioni/fazioni, esercito, diplomazia.',
                '- Se una misura richiede tempo, NON trattarla come completata all’istante: distingui ordine, implementazione e risultati nel tempo.',
                '- Fai reagire ministri, nobili, popolo, categorie economiche, territori e potenze esterne quando pertinenti.',
                '- Usa scene RPG dettagliate solo se il giocatore entra personalmente in un incontro, viaggio, duello, ispezione o dialogo decisivo.',
                '- Evita riempitivi tipo "attraversi il corridoio / osservi la stanza" quando il cuore dell\'azione è amministrativo.',
                '- Apri il turno con una SINTESI STRATEGICA concisa (2-4 righe) che valuta la situazione attuale: KPI principali, rischi, opportunità e priorità. Non elencare tutti i numeri: scegli i 3-4 più rilevanti e spiega perché contano ora.',
                '- Dopo la sintesi strategica, procedi con la narrazione del turno (decisione -> attuazione -> reazioni -> effetti).',
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
                "- Evita di trasformare una scelta aziendale in una quest o in una scena d'avventura se non nasce logicamente dalla situazione.",
                '- Apri il turno con una SINTESI STRATEGICA concisa (2-4 righe) che valuta la situazione attuale: KPI principali (cassa, utili, soddisfazione, scorte), rischi, opportunità e priorità. Non elencare tutti i numeri: scegli i 3-4 più rilevanti e spiega perché contano ora.',
                '- Dopo la sintesi strategica, procedi con la narrazione del turno (dato/problema -> decisione -> esecuzione -> reazioni -> impatto).',
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
        const modeInstruction = buildNarrativeModeInstruction(mode, management, memory);
        const strategicAssessment = buildStrategicAssessment(mode, memory);
        const strategicBlock = strategicAssessment ? `\n\n${strategicAssessment}` : '';
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
            prompt: `${basePlan?.prompt || ''}${managementInstruction}${strategicBlock}\n\n${modeInstruction}`
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

        const strategicAssessment = buildStrategicAssessment(mode, memory);
        const strategicBlock = strategicAssessment ? `\n\n${strategicAssessment}` : '';
        return {
            ...baseDecision,
            compass,
            decision,
            narrativeMode: mode,
            prompt: `${baseDecision.prompt || ''}${strategicBlock}\n\n${buildNarrativeModeInstruction(mode, management, memory)}`
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
        buildStrategicAssessment,
        augmentPlan,
        augmentNarrativeDecision,
        install,
        installGameDirectorPatch,
        installNarrativeMasterPatch
    };
});
