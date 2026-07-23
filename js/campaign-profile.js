(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheCampaign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 1;

    const OPTIONS = {
        tone: {
            heroic: {
                label: 'Eroico',
                directive: 'Tono epico e luminoso: il coraggio conta, senza rendere facili le vittorie.'
            },
            dark: {
                label: 'Oscuro',
                directive: 'Tono cupo e teso: conseguenze dure, speranza rara ma significativa.'
            },
            realistic: {
                label: 'Realistico',
                directive: 'Tono credibile e concreto: niente protezione narrativa, causalità rigorosa.'
            },
            adventurous: {
                label: 'Avventuroso',
                directive: 'Tono dinamico e meraviglioso: scoperta, ritmo e pericoli leggibili.'
            },
            light: {
                label: 'Leggero',
                directive: 'Tono brillante e umano: spazio a ironia, amicizia e momenti di sollievo.'
            }
        },
        focus: {
            balanced: {
                label: 'Bilanciato',
                directive: 'Alterna dialogo, esplorazione, conflitto e gestione secondo la storia.'
            },
            roleplay: {
                label: 'Interpretazione',
                directive: 'Dai priorità a dialoghi, relazioni, dilemmi e crescita dei personaggi.'
            },
            exploration: {
                label: 'Esplorazione',
                directive: 'Dai priorità a luoghi, scoperte, misteri, viaggio e senso di meraviglia.'
            },
            tactical: {
                label: 'Tattico',
                directive: 'Dai priorità a sfide, risorse, posizionamento, rischio e decisioni tattiche.'
            },
            management: {
                label: 'Gestionale',
                directive: 'Dai priorità a economia, proprietà, organizzazioni, personale e conseguenze sistemiche.'
            }
        },
        freedom: {
            guided: {
                label: 'Guidata',
                directive: 'Offri obiettivi chiari e indizi forti, lasciando al giocatore la decisione finale.'
            },
            balanced: {
                label: 'Equilibrata',
                directive: 'Mantieni trame riconoscibili ma accetta deviazioni e soluzioni impreviste.'
            },
            sandbox: {
                label: 'Sandbox',
                directive: 'Non forzare una trama principale: il mondo evolve e reagisce alle priorità del giocatore.'
            }
        },
        intensity: {
            gentle: {
                label: 'Morbida',
                directive: 'Evita dettagli grafici; usa dissolvenza narrativa per violenza, paura e intimità.'
            },
            standard: {
                label: 'Standard',
                directive: 'Mostra pericolo e conseguenze senza compiacimento o dettagli gratuitamente grafici.'
            },
            intense: {
                label: 'Intensa',
                directive: 'Consenti tensione e conseguenze forti, rispettando sempre i limiti espliciti del giocatore.'
            }
        }
    };

    function clean(value, maxLength) {
        const text = String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const limit = Number.isFinite(maxLength) ? maxLength : 500;
        return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
    }

    function validOption(group, value, fallback) {
        return Object.prototype.hasOwnProperty.call(OPTIONS[group], value) ? value : fallback;
    }

    function createDefaultProfile() {
        return {
            schemaVersion: SCHEMA_VERSION,
            tone: 'adventurous',
            focus: 'balanced',
            freedom: 'balanced',
            intensity: 'standard',
            premise: '',
            boundaries: '',
            createdAt: null
        };
    }

    function migrateProfile(input) {
        const source = input && typeof input === 'object' ? input : {};
        const defaults = createDefaultProfile();
        return {
            ...defaults,
            ...source,
            schemaVersion: SCHEMA_VERSION,
            tone: validOption('tone', source.tone, defaults.tone),
            focus: validOption('focus', source.focus, defaults.focus),
            freedom: validOption('freedom', source.freedom, defaults.freedom),
            intensity: validOption('intensity', source.intensity, defaults.intensity),
            premise: clean(source.premise, 1200),
            boundaries: clean(source.boundaries, 600),
            createdAt: source.createdAt || null
        };
    }

    function createProfile(input) {
        return migrateProfile({
            ...(input || {}),
            createdAt: input?.createdAt || new Date().toISOString()
        });
    }

    function profileSummary(input) {
        const profile = migrateProfile(input);
        return {
            tone: OPTIONS.tone[profile.tone].label,
            focus: OPTIONS.focus[profile.focus].label,
            freedom: OPTIONS.freedom[profile.freedom].label,
            intensity: OPTIONS.intensity[profile.intensity].label,
            premise: profile.premise,
            boundaries: profile.boundaries
        };
    }

    function buildPrompt(input) {
        const profile = migrateProfile(input);
        const boundaries = profile.boundaries
            ? `LIMITI ESPLICITI DEL GIOCATORE: ${profile.boundaries}. Non introdurre questi contenuti, neppure come sorpresa o retroscena.`
            : 'Il giocatore non ha indicato limiti aggiuntivi; mantieni comunque il contenuto coerente con l’intensità scelta.';
        const premise = profile.premise
            ? `PREMESSA PERSONALE: ${profile.premise}. Integrala come direzione iniziale, non come esito già deciso.`
            : 'Nessuna premessa personale aggiuntiva.';

        return `🎭 SESSIONE ZERO — CONTRATTO DELLA CAMPAGNA
- TONO: ${OPTIONS.tone[profile.tone].label}. ${OPTIONS.tone[profile.tone].directive}
- FOCUS: ${OPTIONS.focus[profile.focus].label}. ${OPTIONS.focus[profile.focus].directive}
- LIBERTÀ: ${OPTIONS.freedom[profile.freedom].label}. ${OPTIONS.freedom[profile.freedom].directive}
- INTENSITÀ: ${OPTIONS.intensity[profile.intensity].label}. ${OPTIONS.intensity[profile.intensity].directive}
- ${premise}
- ${boundaries}

Queste preferenze persistono per tutta la campagna. Non citarle direttamente nella narrazione e non usarle per togliere libertà decisionale al giocatore.`;
    }

    function listOptions(group) {
        if (!OPTIONS[group]) return [];
        return Object.entries(OPTIONS[group]).map(([value, item]) => ({
            value,
            label: item.label,
            directive: item.directive
        }));
    }

    return {
        SCHEMA_VERSION,
        OPTIONS,
        clean,
        createDefaultProfile,
        migrateProfile,
        createProfile,
        profileSummary,
        buildPrompt,
        listOptions
    };
});
