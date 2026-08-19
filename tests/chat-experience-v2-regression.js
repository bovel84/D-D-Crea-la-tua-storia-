'use strict';

const assert = require('assert');
const chatUx = require('../js/chat-experience-v2.js');

const css = chatUx.cssText();
assert.match(css, /#modal-world-chat \.chat-thread-list\s*\{[\s\S]*display:flex/i, 'le conversazioni devono diventare una striscia orizzontale compatta');
assert.match(css, /#modal-world-chat \.chat-avatar\s*\{[\s\S]*58px/i, 'i ritratti nelle chat devono essere ben leggibili');
assert.match(css, /#modal-world-chat \.chat-message\.player \.chat-bubble/i, 'il protagonista deve avere una bolla visivamente distinta');
assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/i, 'i tre comandi della chat devono restare compatti sulla stessa riga');
assert.match(css, /@media \(max-width:620px\)/i, 'la chat deve avere una resa mobile dedicata');
assert.match(css, /position:sticky; bottom:0/i, 'il campo messaggio deve restare comodo durante lo scroll');

const state = {
    character: { name: 'Andrea' },
    worldMemory: {
        chats: [{
            messages: [
                { speaker: "Lorenzo de' Medici", speakerType: 'npc' },
                { speaker: 'Signoria di Firenze', speakerType: 'fazione' }
            ]
        }]
    }
};
const lorenzo = chatUx.speakerRecord("Lorenzo de' Medici", state);
assert.ok(lorenzo?.entity, 'un parlante umano presente solo nella chat deve poter ricevere una foto contestuale');
assert.strictEqual(lorenzo.speakerType, 'npc');
const signoria = chatUx.speakerRecord('Signoria di Firenze', state);
assert.strictEqual(chatUx.isLikelyHuman(signoria?.entity, 'Signoria di Firenze', signoria?.speakerType), false, 'fazioni e organizzazioni non devono ricevere facce umane casuali');

console.log('chat-experience-v2-regression: ok');
