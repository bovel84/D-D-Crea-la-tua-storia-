(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheCharacter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const GENERIC_ERAS = new Set(['fantasy', 'contemporary', 'historical']);

    const SETTING_SIGNALS = [
        ['sport', /sport|calcio|football|basket|tennis|atletica/i],
        ['business', /business|finanza|borsa|azienda|impresa|corporate|broker/i],
        ['crime', /crime|mafia|gang|criminal|noir|malavita/i],
        ['military', /militare|guerra|war|esercito|conflitto armato/i],
        ['diplomatic', /diplomatic|ambasci|geopolit|nazioni unite/i],
        ['rural', /rurale|agricol|contadin|fattoria|allevamento/i],
        ['pirate', /pirata|piratesco|corsar|bucaniere/i],
        ['spy', /spia|spionaggio|intelligence|servizi segreti|spy/i],
        ['contemporary', /contemporane[oaie]|modern[oaie]|giorni nostri|XXI secolo|21.? secolo/i],
        ['historical', /storico|antica roma|romano|rinascimento|medioevo|medieval|vittoriano|ottocento/i],
        ['fantasy', /fantasy|magia|draghi|medioevo fantastico/i]
    ];

    const EXTRA_OPTIONS = {
        fantasy: {
            origins: {
                acolyte: { name: 'Accolito', icon: '🕯️', desc: 'Cresciuto tra riti, fede e misteri', bonuses: { wis: 2, cha: 1 }, kit: ['holy_symbol', 'ration'] },
                artisan: { name: 'Artigiano', icon: '🔨', desc: 'Conosce materiali, botteghe e corporazioni', bonuses: { dex: 1, int: 2 }, kit: ['artisan_tools', 'tonic'] },
                wanderer: { name: 'Viandante', icon: '🥾', desc: 'Ha imparato a sopravvivere sulle strade', bonuses: { con: 1, wis: 2 }, kit: ['torch', 'ration'] },
                courtier: { name: 'Cortigiano', icon: '🎭', desc: 'Intrighi, etichetta e favori di palazzo', bonuses: { cha: 2, int: 1 }, kit: ['fine_clothes', 'tonic'] }
            },
            archetypes: {
                ranger: { name: 'Ramingo', icon: '🏹', desc: 'Esploratore e cacciatore delle terre selvagge', stat: 'wis', hp: 11, mp: 5, skills: ['Sopravvivenza', 'Tiro'], kit: ['short_bow'] },
                alchemist: { name: 'Alchimista', icon: '⚗️', desc: 'Trasforma reagenti in soluzioni imprevedibili', stat: 'int', hp: 9, mp: 9, skills: ['Alchimia', 'Analisi'], kit: ['alchemy_kit'] },
                diplomat: { name: 'Emissario', icon: '🕊️', desc: 'Ottiene risultati con parole, accordi e favori', stat: 'cha', hp: 9, mp: 7, skills: ['Diplomazia', 'Intuizione'], kit: ['sealed_letter'] }
            },
            items: {
                torch: { name: 'Torcia', icon: '🔥', type: 'utility', desc: 'Illumina luoghi oscuri e segnala la posizione.' },
                artisan_tools: { name: 'Attrezzi da Artigiano', icon: '🧰', type: 'tool', desc: 'Strumenti robusti per riparare e costruire.' },
                holy_symbol: { name: 'Simbolo Sacro', icon: '📿', type: 'utility', desc: 'Un segno di fede riconosciuto dalla comunità.' },
                fine_clothes: { name: 'Abiti di Corte', icon: '🧥', type: 'clothing', desc: 'Vestiti adatti alle sale del potere.' },
                short_bow: { name: 'Arco Corto', icon: '🏹', type: 'weapon', desc: 'Arma leggera per colpire a distanza.' },
                alchemy_kit: { name: 'Borsa Alchemica', icon: '⚗️', type: 'tool', desc: 'Fiale, reagenti e piccoli strumenti da laboratorio.' },
                sealed_letter: { name: 'Lettera Sigillata', icon: '✉️', type: 'quest', desc: 'Una credenziale che apre porte importanti.' }
            }
        },
        contemporary: {
            origins: {
                graduate: { name: 'Neolaureato', icon: '🎓', desc: 'Formazione recente e una rete ancora da costruire', bonuses: { int: 2, car: 1 }, kit: ['laptop', 'smartphone'] },
                entrepreneur: { name: 'Imprenditore', icon: '📈', desc: 'Abituato a rischiare, negoziare e decidere', bonuses: { car: 2, int: 1 }, kit: ['smartphone', 'bank_card'] },
                public_servant: { name: 'Dipendente pubblico', icon: '🏛️', desc: 'Conosce procedure, istituzioni e responsabilità', bonuses: { int: 1, car: 2 }, kit: ['documents', 'smartphone'] },
                caregiver: { name: 'Caregiver', icon: '🤲', desc: 'Pragmatico, empatico e resistente alla pressione', bonuses: { for: 1, int: 1, car: 1 }, kit: ['medkit', 'smartphone'] },
                athlete: { name: 'Sportivo', icon: '🏃', desc: 'Disciplina, energia e spirito competitivo', bonuses: { for: 2, dex: 1 }, kit: ['sports_bag', 'snack'] }
            },
            archetypes: {
                investigator: { name: 'Investigatore', icon: '🔎', desc: 'Collega indizi e scopre ciò che gli altri nascondono', stat: 'int', hp: 10, mp: 6, skills: ['Indagine', 'Percezione'], kit: ['notebook'] },
                medic: { name: 'Medico', icon: '🩺', desc: 'Gestisce emergenze, diagnosi e persone vulnerabili', stat: 'int', hp: 10, mp: 7, skills: ['Medicina', 'Empatia'], kit: ['medkit'] },
                journalist: { name: 'Giornalista', icon: '📰', desc: 'Cerca fonti, verifica fatti e racconta il presente', stat: 'car', hp: 9, mp: 7, skills: ['Intervista', 'Ricerca'], kit: ['recorder'] },
                technician: { name: 'Tecnico', icon: '🧰', desc: 'Ripara sistemi e trova soluzioni concrete', stat: 'dex', hp: 11, mp: 4, skills: ['Riparazione', 'Elettronica'], kit: ['toolkit'] },
                negotiator: { name: 'Negoziatore', icon: '🤝', desc: 'Media conflitti e costruisce accordi sostenibili', stat: 'car', hp: 10, mp: 8, skills: ['Negoziazione', 'Psicologia'], kit: ['documents'] },
                manager: { name: 'Manager', icon: '📊', desc: 'Coordina persone, budget e obiettivi complessi', stat: 'car', hp: 10, mp: 6, skills: ['Leadership', 'Organizzazione'], kit: ['laptop'] }
            },
            items: {
                smartphone: { name: 'Smartphone', icon: '📱', type: 'tool', desc: 'Comunicazioni, mappe, foto e accesso ai servizi digitali.' },
                laptop: { name: 'Computer Portatile', icon: '💻', type: 'tool', desc: 'Lavoro, ricerca, analisi e comunicazione.' },
                bank_card: { name: 'Carta di Pagamento', icon: '💳', type: 'utility', desc: 'Accesso ai fondi personali e ai pagamenti elettronici.' },
                documents: { name: 'Documenti Personali', icon: '🪪', type: 'utility', desc: 'Identità, abilitazioni e credenziali.' },
                sports_bag: { name: 'Borsa Sportiva', icon: '🎒', type: 'container', desc: 'Abbigliamento tecnico e accessori essenziali.' },
                notebook: { name: 'Taccuino', icon: '📓', type: 'tool', desc: 'Appunti, piste e informazioni raccolte.' },
                recorder: { name: 'Registratore Digitale', icon: '🎙️', type: 'tool', desc: 'Registra interviste e prove sonore.' },
                toolkit: { name: 'Kit Tecnico', icon: '🧰', type: 'tool', desc: 'Strumenti per diagnosi e riparazioni rapide.' },
                medkit: { name: 'Kit di Pronto Soccorso', icon: '🩹', type: 'consumable', desc: 'Bende, disinfettante e strumenti per le emergenze.', effect: { health: 20 } },
                snack: { name: 'Snack', icon: '🍫', type: 'consumable', desc: 'Una riserva rapida di energia.', effect: { hunger: 20, stamina: 10 } }
            }
        },
        sport: {
            origins: {
                academy: { name: 'Settore Giovanile', icon: '🏫', desc: 'Cresciuto in un vivaio competitivo', bonuses: { tec: 2, men: 1 }, kit: ['training_kit'] },
                street: { name: 'Talento di Strada', icon: '🏙️', desc: 'Creatività affinata lontano dalle accademie', bonuses: { tec: 1, vel: 2 }, kit: ['worn_ball'] },
                university: { name: 'College', icon: '🎓', desc: 'Sport e studio sotto la stessa pressione', bonuses: { tac: 2, men: 1 }, kit: ['tablet'] }
            },
            archetypes: {
                playmaker: { name: 'Regista', icon: '🎯', desc: 'Legge il gioco e detta i tempi', stat: 'tac', hp: 10, mp: 7, skills: ['Visione', 'Passaggio'], kit: ['match_notes'] },
                finisher: { name: 'Finalizzatore', icon: '🥅', desc: 'Trasforma poche occasioni in punti', stat: 'tec', hp: 11, mp: 4, skills: ['Tiro', 'Freddezza'], kit: ['boots'] },
                coach: { name: 'Allenatore', icon: '📋', desc: 'Sviluppa persone, tattiche e motivazione', stat: 'men', hp: 10, mp: 8, skills: ['Leadership', 'Tattica'], kit: ['whistle'] }
            },
            items: {
                training_kit: { name: 'Kit Allenamento', icon: '🎽', type: 'equipment', desc: 'Abbigliamento e accessori per la preparazione.' },
                worn_ball: { name: 'Pallone Consumato', icon: '⚽', type: 'equipment', desc: 'Ha accompagnato centinaia di ore di pratica.' },
                tablet: { name: 'Tablet Tattico', icon: '📱', type: 'tool', desc: 'Video, statistiche e schemi di gioco.' },
                match_notes: { name: 'Appunti Partita', icon: '📒', type: 'tool', desc: 'Movimenti, avversari e soluzioni preparate.' },
                boots: { name: 'Scarpe da Gara', icon: '👟', type: 'equipment', desc: 'Calzature scelte per prestazione e terreno.' },
                whistle: { name: 'Fischietto', icon: '📣', type: 'tool', desc: 'Segna tempi, richiama attenzione e guida il gruppo.' }
            }
        },
        business: {
            origins: {
                intern: { name: 'Tirocinante', icon: '🪪', desc: 'Parte dal basso e osserva tutto', bonuses: { int: 1, net: 1, car: 1 }, kit: ['company_badge'] },
                family_business: { name: 'Impresa di famiglia', icon: '🏪', desc: 'Conosce clienti, sacrifici e continuità', bonuses: { net: 2, car: 1 }, kit: ['ledger'] },
                self_taught: { name: 'Autodidatta', icon: '📚', desc: 'Competenze costruite fuori dai percorsi tradizionali', bonuses: { int: 2, luck: 1 }, kit: ['laptop'] }
            },
            archetypes: {
                analyst: { name: 'Analista', icon: '📊', desc: 'Trasforma dati in decisioni', stat: 'int', hp: 9, mp: 7, skills: ['Analisi', 'Valutazione'], kit: ['spreadsheet'] },
                founder: { name: 'Fondatore', icon: '🚀', desc: 'Costruisce un’impresa dal nulla', stat: 'car', hp: 10, mp: 8, skills: ['Strategia', 'Raccolta fondi'], kit: ['pitch_deck'] },
                controller: { name: 'Controller', icon: '🧮', desc: 'Sorveglia costi, margini e obiettivi', stat: 'int', hp: 10, mp: 6, skills: ['Budget', 'Controllo'], kit: ['ledger'] }
            },
            items: {
                company_badge: { name: 'Badge Aziendale', icon: '🪪', type: 'utility', desc: 'Accesso agli uffici e identità professionale.' },
                ledger: { name: 'Libro Contabile', icon: '📘', type: 'tool', desc: 'Conti, scadenze e registrazioni economiche.' },
                laptop: { name: 'Notebook Aziendale', icon: '💻', type: 'tool', desc: 'Strumento principale per analisi e lavoro.' },
                spreadsheet: { name: 'Modello Finanziario', icon: '📈', type: 'tool', desc: 'Previsioni, scenari e valutazioni.' },
                pitch_deck: { name: 'Pitch Deck', icon: '🖥️', type: 'tool', desc: 'Presentazione per partner e investitori.' }
            }
        },
        crime: {
            origins: {
                neighborhood: { name: 'Quartiere difficile', icon: '🏚️', desc: 'Conosce strade, silenzi e gerarchie', bonuses: { ast: 2, resp: 1 }, kit: ['burner_phone'] },
                ex_convict: { name: 'Ex detenuto', icon: '⛓️', desc: 'Porta addosso reputazione e contatti', bonuses: { vio: 1, resp: 2 }, kit: ['contact_book'] },
                respectable: { name: 'Facciata rispettabile', icon: '🎩', desc: 'Una vita pulita che nasconde altro', bonuses: { conn: 2, ast: 1 }, kit: ['clean_documents'] }
            },
            archetypes: {
                fixer: { name: 'Facilitatore', icon: '☎️', desc: 'Conosce la persona giusta per ogni problema', stat: 'conn', hp: 10, mp: 7, skills: ['Contatti', 'Mediazione'], kit: ['contact_book'] },
                infiltrator: { name: 'Infiltrato', icon: '🎭', desc: 'Cambia identità e conquista fiducia', stat: 'ast', hp: 9, mp: 8, skills: ['Copertura', 'Inganno'], kit: ['clean_documents'] },
                wheelman: { name: 'Pilota', icon: '🚘', desc: 'Porta tutti fuori prima che sia tardi', stat: 'ast', hp: 11, mp: 4, skills: ['Guida', 'Fuga'], kit: ['car_keys'] }
            },
            items: {
                burner_phone: { name: 'Telefono usa e getta', icon: '📱', type: 'tool', desc: 'Comunicazioni difficili da collegare al proprietario.' },
                contact_book: { name: 'Rubrica Cifrata', icon: '📓', type: 'tool', desc: 'Nomi, favori e debiti annotati in codice.' },
                clean_documents: { name: 'Documenti di Copertura', icon: '🪪', type: 'utility', desc: 'Un’identità coerente per passare controlli superficiali.' },
                car_keys: { name: 'Chiavi di un’Auto', icon: '🔑', type: 'utility', desc: 'Accesso a un veicolo senza troppe domande.' }
            }
        },
        military: {
            origins: {
                academy: { name: 'Accademia', icon: '🎓', desc: 'Dottrina, disciplina e comando', bonuses: { tac: 2, mor: 1 }, kit: ['field_manual'] },
                reservist: { name: 'Riservista', icon: '🪖', desc: 'Vita civile e addestramento operativo', bonuses: { res: 1, tac: 1, mor: 1 }, kit: ['field_pack'] },
                specialist: { name: 'Specialista tecnico', icon: '📡', desc: 'Sistemi, comunicazioni e logistica', bonuses: { tac: 2, res: 1 }, kit: ['radio'] }
            },
            archetypes: {
                medic: { name: 'Medico da campo', icon: '⛑️', desc: 'Salva vite sotto pressione', stat: 'mor', hp: 11, mp: 7, skills: ['Medicina', 'Sangue freddo'], kit: ['field_medkit'] },
                scout: { name: 'Ricognitore', icon: '🔭', desc: 'Vede prima e si muove senza farsi notare', stat: 'tac', hp: 10, mp: 5, skills: ['Ricognizione', 'Furtività'], kit: ['binoculars'] },
                logistician: { name: 'Logistico', icon: '📦', desc: 'Fa arrivare uomini e risorse dove servono', stat: 'tac', hp: 10, mp: 6, skills: ['Logistica', 'Pianificazione'], kit: ['field_manual'] }
            },
            items: {
                field_manual: { name: 'Manuale Operativo', icon: '📕', type: 'tool', desc: 'Procedure, mappe e protocolli essenziali.' },
                field_pack: { name: 'Zaino da Campo', icon: '🎒', type: 'container', desc: 'Equipaggiamento essenziale per una missione.' },
                radio: { name: 'Radio Tattica', icon: '📻', type: 'tool', desc: 'Comunicazioni coordinate sul terreno.' },
                field_medkit: { name: 'Kit Medico da Campo', icon: '⛑️', type: 'consumable', desc: 'Materiale per stabilizzare ferite gravi.', effect: { health: 25 } },
                binoculars: { name: 'Binocolo', icon: '🔭', type: 'tool', desc: 'Osservazione a lunga distanza.' }
            }
        },
        diplomatic: {
            origins: {
                civil_service: { name: 'Servizio pubblico', icon: '🏛️', desc: 'Procedure, istituzioni e responsabilità', bonuses: { ret: 2, int: 1 }, kit: ['credentials'] },
                diaspora: { name: 'Diaspora', icon: '🌍', desc: 'Vive tra lingue, culture e identità', bonuses: { car: 2, ret: 1 }, kit: ['phrasebook'] },
                think_tank: { name: 'Centro studi', icon: '🧠', desc: 'Analisi, scenari e reti di influenza', bonuses: { int: 2, ret: 1 }, kit: ['briefing'] }
            },
            archetypes: {
                mediator: { name: 'Mediatore', icon: '🕊️', desc: 'Riduce la distanza tra posizioni incompatibili', stat: 'ret', hp: 9, mp: 9, skills: ['Mediazione', 'Ascolto'], kit: ['credentials'] },
                attaché: { name: 'Addetto diplomatico', icon: '🎖️', desc: 'Gestisce dossier, relazioni e protocollo', stat: 'int', hp: 10, mp: 7, skills: ['Protocollo', 'Analisi'], kit: ['briefing'] },
                envoy: { name: 'Inviato speciale', icon: '✈️', desc: 'Opera dove il tempo e la fiducia scarseggiano', stat: 'car', hp: 10, mp: 8, skills: ['Negoziazione', 'Crisi'], kit: ['secure_phone'] }
            },
            items: {
                credentials: { name: 'Credenziali Diplomatiche', icon: '🪪', type: 'utility', desc: 'Identità e autorizzazioni ufficiali.' },
                phrasebook: { name: 'Taccuino Linguistico', icon: '📗', type: 'tool', desc: 'Espressioni, usi e riferimenti culturali.' },
                briefing: { name: 'Dossier Riservato', icon: '📁', type: 'quest', desc: 'Analisi e obiettivi della missione.' },
                secure_phone: { name: 'Telefono Sicuro', icon: '📱', type: 'tool', desc: 'Comunicazioni protette con la delegazione.' }
            }
        },
        rural: {
            origins: {
                tenant: { name: 'Mezzadro', icon: '🌾', desc: 'Lavora terre che non possiede', bonuses: { res: 2, agr: 1 }, kit: ['hand_tools'] },
                cooperative: { name: 'Cooperativa', icon: '🤝', desc: 'Condivide rischi, lavoro e risultati', bonuses: { res: 1, agr: 2 }, kit: ['ledger'] },
                agronomist: { name: 'Tecnico agrario', icon: '🧪', desc: 'Unisce scienza e conoscenza del territorio', bonuses: { agr: 3 }, kit: ['soil_kit'] }
            },
            archetypes: {
                breeder: { name: 'Allevatore', icon: '🐑', desc: 'Cura animali, pascoli e cicli produttivi', stat: 'res', hp: 12, mp: 4, skills: ['Allevamento', 'Veterinaria'], kit: ['feed_bag'] },
                winemaker: { name: 'Viticoltore', icon: '🍇', desc: 'Trasforma territorio e tempo in valore', stat: 'agr', hp: 10, mp: 6, skills: ['Viticoltura', 'Commercio'], kit: ['pruning_tools'] },
                cooperative_leader: { name: 'Presidente di cooperativa', icon: '🗳️', desc: 'Media interessi e costruisce sviluppo locale', stat: 'agr', hp: 10, mp: 7, skills: ['Leadership', 'Negoziazione'], kit: ['ledger'] }
            },
            items: {
                hand_tools: { name: 'Attrezzi Agricoli', icon: '🧰', type: 'tool', desc: 'Strumenti essenziali per il lavoro quotidiano.' },
                ledger: { name: 'Registro della Cooperativa', icon: '📘', type: 'tool', desc: 'Conferimenti, spese e accordi tra soci.' },
                soil_kit: { name: 'Kit Analisi Terreno', icon: '🧪', type: 'tool', desc: 'Misura condizioni e fertilità del suolo.' },
                feed_bag: { name: 'Mangime', icon: '🌾', type: 'consumable', desc: 'Scorta per il bestiame.' },
                pruning_tools: { name: 'Attrezzi da Potatura', icon: '✂️', type: 'tool', desc: 'Lame e legacci per la cura delle piante.' }
            }
        },
        pirate: {
            origins: {
                dock_rat: { name: 'Figlio del porto', icon: '⚓', desc: 'Conosce moli, equipaggi e traffici', bonuses: { nav: 1, ast: 2 }, kit: ['rope'] },
                navy_deserter: { name: 'Disertore della marina', icon: '🎖️', desc: 'Addestramento ufficiale, fedeltà spezzata', bonuses: { nav: 2, for: 1 }, kit: ['naval_chart'] },
                islander: { name: 'Isolano', icon: '🏝️', desc: 'Mare, tempeste e sopravvivenza', bonuses: { nav: 2, for: 1 }, kit: ['fishing_kit'] }
            },
            archetypes: {
                navigator: { name: 'Navigatore', icon: '🧭', desc: 'Legge stelle, correnti e mappe', stat: 'nav', hp: 10, mp: 7, skills: ['Navigazione', 'Meteorologia'], kit: ['sextant'] },
                quartermaster: { name: 'Quartiermastro', icon: '📦', desc: 'Gestisce scorte, bottino e disciplina', stat: 'ast', hp: 11, mp: 6, skills: ['Logistica', 'Autorità'], kit: ['ledger'] },
                privateer: { name: 'Corsaro', icon: '📜', desc: 'Combatte con una patente e molti nemici', stat: 'for', hp: 12, mp: 4, skills: ['Duello', 'Comando'], kit: ['letter_of_marque'] }
            },
            items: {
                rope: { name: 'Corda da Marinaio', icon: '🪢', type: 'tool', desc: 'Indispensabile a bordo e negli abbordaggi.' },
                naval_chart: { name: 'Carta Nautica', icon: '🗺️', type: 'tool', desc: 'Rotte, fondali e pericoli conosciuti.' },
                fishing_kit: { name: 'Kit da Pesca', icon: '🎣', type: 'tool', desc: 'Lenze, ami e piccoli attrezzi.' },
                sextant: { name: 'Sestante', icon: '🧭', type: 'tool', desc: 'Calcola la posizione osservando gli astri.' },
                ledger: { name: 'Registro di Bordo', icon: '📘', type: 'tool', desc: 'Scorte, turni e quote del bottino.' },
                letter_of_marque: { name: 'Patente di Corsa', icon: '📜', type: 'quest', desc: 'Autorizzazione ufficiale a predare navi nemiche.' }
            }
        },
        spy: {
            origins: {
                military_intel: { name: 'Intelligence militare', icon: '🎖️', desc: 'Analisi operativa e catena di comando', bonuses: { tec: 2, ast: 1 }, kit: ['secure_phone'] },
                police: { name: 'Polizia investigativa', icon: '🕵️', desc: 'Indagini, fonti e procedure', bonuses: { ast: 1, fur: 2 }, kit: ['credentials'] },
                civilian_asset: { name: 'Risorsa civile', icon: '👤', desc: 'Accesso unico senza profilo operativo', bonuses: { cop: 2, ast: 1 }, kit: ['cover_documents'] }
            },
            archetypes: {
                handler: { name: 'Ufficiale di collegamento', icon: '☎️', desc: 'Recluta e gestisce fonti umane', stat: 'ast', hp: 9, mp: 9, skills: ['Reclutamento', 'Psicologia'], kit: ['secure_phone'] },
                surveillance: { name: 'Specialista sorveglianza', icon: '📷', desc: 'Osserva senza lasciare tracce', stat: 'fur', hp: 10, mp: 6, skills: ['Sorveglianza', 'Pedinamento'], kit: ['camera'] },
                cyber_operator: { name: 'Operatore cyber', icon: '💻', desc: 'Penetra reti e protegge operazioni', stat: 'tec', hp: 9, mp: 8, skills: ['Cyber', 'Crittografia'], kit: ['encrypted_laptop'] }
            },
            items: {
                secure_phone: { name: 'Telefono Cifrato', icon: '📱', type: 'tool', desc: 'Comunicazioni protette con la centrale.' },
                credentials: { name: 'Tesserino di Servizio', icon: '🪪', type: 'utility', desc: 'Credenziale ufficiale da usare con cautela.' },
                cover_documents: { name: 'Identità di Copertura', icon: '🗂️', type: 'utility', desc: 'Documenti coerenti con una vita costruita.' },
                camera: { name: 'Microcamera', icon: '📷', type: 'tool', desc: 'Raccoglie prove con discrezione.' },
                encrypted_laptop: { name: 'Laptop Cifrato', icon: '💻', type: 'tool', desc: 'Analisi e operazioni digitali protette.' }
            }
        }
    };

    const HISTORICAL_ERAS = {
        ancient: {
            label: 'Età antica',
            origins: {
                citizen: { name: 'Cittadino', icon: '🏛️', desc: 'Diritti, doveri e reti della città', bonuses: { car: 2, int: 1 }, kit: ['wax_tablet'] },
                legionary: { name: 'Legionario', icon: '🛡️', desc: 'Disciplina, marce e vita di guarnigione', bonuses: { for: 2, dex: 1 }, kit: ['pilum'] },
                freedman: { name: 'Liberto', icon: '🔓', desc: 'Una nuova vita costruita con prudenza', bonuses: { dex: 1, car: 2 }, kit: ['trade_token'] },
                artisan: { name: 'Artigiano', icon: '⚒️', desc: 'Bottega, corporazione e abilità manuale', bonuses: { dex: 2, int: 1 }, kit: ['ancient_tools'] },
                scholar: { name: 'Erudito', icon: '📜', desc: 'Filosofia, diritto e memoria scritta', bonuses: { int: 3 }, kit: ['scrolls'] }
            },
            archetypes: {
                centurion: { name: 'Centurione', icon: '🏺', desc: 'Comanda uomini e mantiene la disciplina', stat: 'for', hp: 13, mp: 3, skills: ['Comando', 'Tattica'], kit: ['gladius'] },
                merchant: { name: 'Mercante', icon: '🧺', desc: 'Muove merci tra città e province', stat: 'car', hp: 10, mp: 5, skills: ['Contratto', 'Valutazione'], kit: ['trade_token'] },
                physician: { name: 'Medico', icon: '⚕️', desc: 'Cura con esperienza, erbe e osservazione', stat: 'int', hp: 10, mp: 7, skills: ['Medicina', 'Erboristeria'], kit: ['medical_roll'] },
                advocate: { name: 'Oratore', icon: '⚖️', desc: 'Difende cause davanti a giudici e assemblee', stat: 'car', hp: 9, mp: 8, skills: ['Retorica', 'Diritto'], kit: ['wax_tablet'] },
                scout: { name: 'Esploratore', icon: '🧭', desc: 'Conosce sentieri, confini e pericoli', stat: 'dex', hp: 11, mp: 4, skills: ['Orientamento', 'Furtività'], kit: ['travel_cloak'] },
                priest: { name: 'Sacerdote', icon: '🔥', desc: 'Custodisce riti e influenza la comunità', stat: 'car', hp: 10, mp: 8, skills: ['Rituali', 'Persuasione'], kit: ['ritual_token'] }
            },
            items: {
                wax_tablet: { name: 'Tavoletta Cerata', icon: '📜', type: 'tool', desc: 'Appunti, conti e messaggi cancellabili.' },
                pilum: { name: 'Pilum', icon: '🗡️', type: 'weapon', desc: 'Giavellotto pesante da legionario.' },
                trade_token: { name: 'Tessera Commerciale', icon: '🪙', type: 'utility', desc: 'Riconoscimento presso mercanti e magazzini.' },
                ancient_tools: { name: 'Attrezzi di Bottega', icon: '🧰', type: 'tool', desc: 'Strumenti manuali del mestiere.' },
                scrolls: { name: 'Rotolo di Testi', icon: '📜', type: 'tool', desc: 'Conoscenze copiate a mano.' },
                gladius: { name: 'Gladio', icon: '🗡️', type: 'weapon', desc: 'Spada corta da combattimento ravvicinato.' },
                medical_roll: { name: 'Borsa del Medico', icon: '⚕️', type: 'tool', desc: 'Bende, ferri e preparati semplici.' },
                travel_cloak: { name: 'Mantello da Viaggio', icon: '🧥', type: 'clothing', desc: 'Protegge da polvere e intemperie.' },
                ritual_token: { name: 'Insegna del Culto', icon: '📿', type: 'utility', desc: 'Simbolo riconosciuto dai fedeli.' }
            }
        },
        medieval: {
            label: 'Medioevo',
            origins: {
                peasant: { name: 'Contadino', icon: '🌾', desc: 'Terra, stagioni e obblighi feudali', bonuses: { for: 1, dex: 1, car: 1 }, kit: ['farm_tools'] },
                guild: { name: 'Membro di corporazione', icon: '⚒️', desc: 'Mestiere, regole e protezione della gilda', bonuses: { dex: 2, int: 1 }, kit: ['guild_tools'] },
                court: { name: 'Cresciuto a corte', icon: '🏰', desc: 'Etichetta, alleanze e rivalità nobiliari', bonuses: { car: 2, int: 1 }, kit: ['court_clothes'] },
                monastery: { name: 'Educato in monastero', icon: '⛪', desc: 'Studio, disciplina e vita comunitaria', bonuses: { int: 3 }, kit: ['manuscript'] },
                borderland: { name: 'Terre di confine', icon: '🌲', desc: 'Sopravvivenza tra pericoli e culture diverse', bonuses: { for: 1, dex: 2 }, kit: ['hunting_knife'] }
            },
            archetypes: {
                knight: { name: 'Cavaliere', icon: '🐎', desc: 'Armi, prestigio e obblighi feudali', stat: 'for', hp: 13, mp: 3, skills: ['Cavalleria', 'Comando'], kit: ['sword'] },
                healer: { name: 'Guaritore', icon: '🌿', desc: 'Erbe, esperienza e fiducia della comunità', stat: 'int', hp: 10, mp: 7, skills: ['Medicina', 'Erboristeria'], kit: ['herb_pouch'] },
                bailiff: { name: 'Balivo', icon: '⚖️', desc: 'Amministra terre, tributi e controversie', stat: 'car', hp: 10, mp: 6, skills: ['Amministrazione', 'Autorità'], kit: ['seal'] },
                minstrel: { name: 'Menestrello', icon: '🎶', desc: 'Viaggia, intrattiene e raccoglie notizie', stat: 'car', hp: 9, mp: 8, skills: ['Musica', 'Persuasione'], kit: ['lute'] },
                scout: { name: 'Battistrada', icon: '🏹', desc: 'Guida gruppi attraverso territori insicuri', stat: 'dex', hp: 11, mp: 4, skills: ['Orientamento', 'Tiro'], kit: ['bow'] },
                merchant: { name: 'Mercante', icon: '🧺', desc: 'Collega fiere, città e rotte lontane', stat: 'car', hp: 10, mp: 5, skills: ['Commercio', 'Valutazione'], kit: ['scales'] }
            },
            items: {
                farm_tools: { name: 'Attrezzi Agricoli', icon: '🧰', type: 'tool', desc: 'Strumenti semplici per lavorare la terra.' },
                guild_tools: { name: 'Attrezzi di Corporazione', icon: '⚒️', type: 'tool', desc: 'Strumenti riconoscibili del mestiere.' },
                court_clothes: { name: 'Abiti di Corte', icon: '🧥', type: 'clothing', desc: 'Vestiti adatti a udienze e cerimonie.' },
                manuscript: { name: 'Manoscritto', icon: '📜', type: 'tool', desc: 'Testo raro copiato pazientemente.' },
                hunting_knife: { name: 'Coltello da Caccia', icon: '🔪', type: 'weapon', desc: 'Utile nel bosco e in viaggio.' },
                sword: { name: 'Spada', icon: '⚔️', type: 'weapon', desc: 'Arma e simbolo di rango.' },
                herb_pouch: { name: 'Borsa di Erbe', icon: '🌿', type: 'consumable', desc: 'Preparati per curare ferite minori.', effect: { health: 18 } },
                seal: { name: 'Sigillo d’Ufficio', icon: '🔏', type: 'utility', desc: 'Convalida ordini e documenti.' },
                lute: { name: 'Liuto', icon: '🎸', type: 'tool', desc: 'Musica, spettacolo e accesso alle corti.' },
                bow: { name: 'Arco', icon: '🏹', type: 'weapon', desc: 'Arma da caccia e da guerra.' },
                scales: { name: 'Bilancia Mercantile', icon: '⚖️', type: 'tool', desc: 'Verifica peso e valore delle merci.' }
            }
        },
        renaissance: {
            label: 'Rinascimento',
            origins: {
                workshop: { name: 'Bottega d’arte', icon: '🎨', desc: 'Apprendistato tra tecnica e creatività', bonuses: { dex: 2, int: 1 }, kit: ['drawing_tools'] },
                merchant_house: { name: 'Casa mercantile', icon: '🏦', desc: 'Credito, commercio e alleanze familiari', bonuses: { car: 2, int: 1 }, kit: ['account_book'] },
                university: { name: 'Università', icon: '🎓', desc: 'Diritto, medicina e filosofia naturale', bonuses: { int: 3 }, kit: ['printed_book'] },
                minor_nobility: { name: 'Piccola nobiltà', icon: '👑', desc: 'Prestigio senza ricchezza garantita', bonuses: { car: 2, dex: 1 }, kit: ['family_seal'] },
                traveler: { name: 'Viaggiatore', icon: '🗺️', desc: 'Lingue, porti e idee oltre confine', bonuses: { dex: 1, car: 2 }, kit: ['map_case'] }
            },
            archetypes: {
                inventor: { name: 'Inventore', icon: '⚙️', desc: 'Progetta macchine e soluzioni nuove', stat: 'int', hp: 9, mp: 8, skills: ['Ingegneria', 'Disegno'], kit: ['drawing_tools'] },
                artist: { name: 'Artista', icon: '🎨', desc: 'Trasforma committenza e talento in fama', stat: 'dex', hp: 9, mp: 8, skills: ['Arte', 'Osservazione'], kit: ['pigments'] },
                diplomat: { name: 'Diplomatico', icon: '🕊️', desc: 'Naviga tra corti, repubbliche e potenze', stat: 'car', hp: 10, mp: 8, skills: ['Diplomazia', 'Intrigo'], kit: ['cipher_letter'] },
                condottiero: { name: 'Condottiero', icon: '⚔️', desc: 'Comanda soldati per denaro e prestigio', stat: 'for', hp: 13, mp: 4, skills: ['Tattica', 'Comando'], kit: ['rapier'] },
                banker: { name: 'Banchiere', icon: '🏦', desc: 'Finanzia rischi, commerci e governi', stat: 'int', hp: 9, mp: 7, skills: ['Credito', 'Negoziazione'], kit: ['account_book'] },
                physician: { name: 'Medico umanista', icon: '⚕️', desc: 'Unisce testi antichi e osservazione diretta', stat: 'int', hp: 10, mp: 7, skills: ['Medicina', 'Anatomia'], kit: ['medical_case'] }
            },
            items: {
                drawing_tools: { name: 'Strumenti da Disegno', icon: '📐', type: 'tool', desc: 'Compassi, carboncini e righelli.' },
                account_book: { name: 'Libro dei Conti', icon: '📘', type: 'tool', desc: 'Crediti, debiti e operazioni commerciali.' },
                printed_book: { name: 'Libro Stampato', icon: '📖', type: 'tool', desc: 'Conoscenza riprodotta con la nuova stampa.' },
                family_seal: { name: 'Sigillo di Famiglia', icon: '🔏', type: 'utility', desc: 'Prova di identità e relazioni.' },
                map_case: { name: 'Custodia per Mappe', icon: '🗺️', type: 'tool', desc: 'Carte di viaggio e portolani.' },
                pigments: { name: 'Pigmenti Pregiati', icon: '🎨', type: 'tool', desc: 'Materiali costosi per opere importanti.' },
                cipher_letter: { name: 'Lettera Cifrata', icon: '✉️', type: 'quest', desc: 'Messaggio politico che richiede discrezione.' },
                rapier: { name: 'Stocco', icon: '🤺', type: 'weapon', desc: 'Arma elegante e letale.' },
                medical_case: { name: 'Cassetta Medica', icon: '⚕️', type: 'tool', desc: 'Ferri e preparati per la pratica medica.' }
            }
        },
        industrial: {
            label: 'Età industriale',
            origins: {
                factory: { name: 'Famiglia operaia', icon: '🏭', desc: 'Turni, solidarietà e condizioni dure', bonuses: { for: 1, dex: 1, car: 1 }, kit: ['work_tools'] },
                bourgeois: { name: 'Borghesia', icon: '🎩', desc: 'Istruzione, capitale e aspettative sociali', bonuses: { int: 2, car: 1 }, kit: ['pocket_watch'] },
                migrant: { name: 'Migrante', icon: '🧳', desc: 'Ha ricostruito reti e identità altrove', bonuses: { dex: 1, car: 2 }, kit: ['travel_case'] },
                railway: { name: 'Comunità ferroviaria', icon: '🚂', desc: 'Tempi, distanze e tecnologia in trasformazione', bonuses: { dex: 2, int: 1 }, kit: ['rail_pass'] },
                educated: { name: 'Istruzione tecnica', icon: '📐', desc: 'Scienza applicata e nuove professioni', bonuses: { int: 3 }, kit: ['technical_manual'] }
            },
            archetypes: {
                engineer: { name: 'Ingegnere', icon: '⚙️', desc: 'Progetta infrastrutture e macchine', stat: 'int', hp: 10, mp: 7, skills: ['Ingegneria', 'Progettazione'], kit: ['technical_manual'] },
                detective: { name: 'Investigatore', icon: '🔎', desc: 'Ricostruisce fatti in città che cambiano', stat: 'int', hp: 10, mp: 6, skills: ['Indagine', 'Osservazione'], kit: ['case_notes'] },
                unionist: { name: 'Organizzatore sindacale', icon: '✊', desc: 'Unisce lavoratori e affronta il potere', stat: 'car', hp: 11, mp: 7, skills: ['Oratoria', 'Organizzazione'], kit: ['pamphlets'] },
                entrepreneur: { name: 'Industriale', icon: '🏭', desc: 'Investe capitale e costruisce imprese', stat: 'car', hp: 10, mp: 7, skills: ['Impresa', 'Negoziazione'], kit: ['account_book'] },
                reporter: { name: 'Cronista', icon: '📰', desc: 'Racconta scandali e trasformazioni sociali', stat: 'car', hp: 9, mp: 7, skills: ['Intervista', 'Ricerca'], kit: ['press_card'] },
                doctor: { name: 'Medico', icon: '⚕️', desc: 'Affronta epidemie e medicina in evoluzione', stat: 'int', hp: 10, mp: 7, skills: ['Medicina', 'Scienza'], kit: ['medical_case'] }
            },
            items: {
                work_tools: { name: 'Attrezzi da Lavoro', icon: '🧰', type: 'tool', desc: 'Strumenti robusti per fabbrica e officina.' },
                pocket_watch: { name: 'Orologio da Tasca', icon: '⌚', type: 'utility', desc: 'Tempo, puntualità e status.' },
                travel_case: { name: 'Valigia', icon: '🧳', type: 'container', desc: 'Pochi beni scelti per ricominciare.' },
                rail_pass: { name: 'Biglietto Ferroviario', icon: '🎫', type: 'utility', desc: 'Accesso alla nuova rete di trasporto.' },
                technical_manual: { name: 'Manuale Tecnico', icon: '📕', type: 'tool', desc: 'Disegni, formule e procedure.' },
                case_notes: { name: 'Taccuino dei Casi', icon: '📓', type: 'tool', desc: 'Indizi, testimonianze e collegamenti.' },
                pamphlets: { name: 'Opuscoli', icon: '📄', type: 'utility', desc: 'Idee e richieste diffuse tra i lavoratori.' },
                account_book: { name: 'Libro Mastro', icon: '📘', type: 'tool', desc: 'Capitale, costi e ricavi.' },
                press_card: { name: 'Tessera Stampa', icon: '🪪', type: 'utility', desc: 'Accesso e identità professionale.' },
                medical_case: { name: 'Borsa Medica', icon: '⚕️', type: 'tool', desc: 'Strumenti della medicina moderna nascente.' }
            }
        }
    };

    function clean(value) {
        return String(value == null ? '' : value).trim();
    }

    function detectSettingGenre(setting) {
        const text = clean(setting);
        const match = SETTING_SIGNALS.find(([, pattern]) => pattern.test(text));
        return match ? match[0] : null;
    }

    function detectHistoricalEra(setting) {
        const text = clean(setting).toLowerCase();
        if (/roma|romano|grec|antich|impero|repubblica romana|egitt/.test(text)) return 'ancient';
        if (/medioevo|medieval|feud|crociat|viching/.test(text)) return 'medieval';
        if (/rinasc|umanesimo|medici|1500|cinquecento|1400|quattrocento/.test(text)) return 'renaissance';
        if (/industr|vittorian|ottocento|1800|rivoluzione industriale/.test(text)) return 'industrial';
        return 'renaissance';
    }

    function resolveGenreKey(story, genres) {
        const available = genres || {};
        const raw = clean(story && story.genre).toLowerCase();
        const detected = detectSettingGenre(story && story.setting);
        const rawValid = Boolean(raw && available[raw]);
        const detectedValid = Boolean(detected && available[detected]);

        if (!rawValid) return detectedValid ? detected : (available.fantasy ? 'fantasy' : Object.keys(available)[0]);
        if (!detectedValid || detected === raw) return raw;

        // Le ambientazioni specialistiche scelte esplicitamente restano autorevoli.
        if (!GENERIC_ERAS.has(raw)) return raw;
        // Corregge salvataggi legacy incoerenti (es. storico/centurione in un mondo moderno).
        return detected;
    }

    function mergeConfig(base, extra) {
        return {
            ...base,
            origins: { ...(base.origins || {}), ...(extra.origins || {}) },
            archetypes: { ...(base.archetypes || {}), ...(extra.archetypes || {}) },
            items: { ...(base.items || {}), ...(extra.items || {}) }
        };
    }

    function getGenreConfig(genres, story) {
        const key = resolveGenreKey(story, genres);
        const base = genres[key] || genres.fantasy || {};
        if (key === 'historical') {
            const eraKey = detectHistoricalEra(story && story.setting);
            const era = HISTORICAL_ERAS[eraKey];
            return {
                ...base,
                eraKey,
                eraLabel: era.label,
                origins: { ...era.origins },
                archetypes: { ...era.archetypes },
                items: { ...(base.items || {}), ...era.items }
            };
        }
        return mergeConfig(base, EXTRA_OPTIONS[key] || {});
    }

    function collectKitIds(config, originKey, archetypeKey) {
        const origin = config.origins && config.origins[originKey];
        const archetype = config.archetypes && config.archetypes[archetypeKey];
        const ids = [
            ...((origin && origin.kit) || []),
            ...((archetype && archetype.kit) || [])
        ];
        return Array.from(new Set(ids));
    }

    function getStarterInventory(config, originKey, archetypeKey) {
        const base = Array.isArray(config.starterInventory) ? config.starterInventory : [];
        const selected = collectKitIds(config, originKey, archetypeKey)
            .map(id => config.items && config.items[id])
            .filter(Boolean)
            .map(item => ({ ...item, count: Math.max(1, Number(item.count) || 1) }));
        const seen = new Set();
        return [...base, ...selected].filter(item => {
            const key = clean(item && item.name).toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).map(item => ({ ...item }));
    }

    function getChoiceSummary(config) {
        return {
            origins: Object.keys(config.origins || {}).length,
            archetypes: Object.keys(config.archetypes || {}).length,
            items: Object.keys(config.items || {}).length,
            eraLabel: config.eraLabel || null
        };
    }

    return {
        EXTRA_OPTIONS,
        HISTORICAL_ERAS,
        detectSettingGenre,
        detectHistoricalEra,
        resolveGenreKey,
        getGenreConfig,
        collectKitIds,
        getStarterInventory,
        getChoiceSummary
    };
});
