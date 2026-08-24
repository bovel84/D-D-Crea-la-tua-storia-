(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheAICredentialRecoveryV23 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const VERSION = 23;
    const PATCH_MARK = '__cronacheCredentialRecoveryV23';

    const clean = value => String(value == null ? '' : value).trim();

    function missingCredentialError(error) {
        const message = clean(error?.message || error).toLowerCase();
        return /api key/.test(message) && /(non configurat|mancant|inserisc|configura)/.test(message);
    }

    function providerCredential(doc) {
        const provider = clean(doc?.getElementById('set-model')?.value || 'groq');
        const ids = provider === 'ollama-cloud' ? ['set-ollama-key']
            : provider === 'openrouter' || provider === 'openrouter-free' ? ['set-openrouter-key']
                : provider === 'deepseek' ? ['set-kimera-key', 'set-openrouter-key']
                    : ['set-groq-key'];
        const input = ids.map(id => doc?.getElementById(id)).find(node => clean(node?.value));
        return { provider, input, apiKeyPresent: Boolean(input && clean(input.value)) };
    }

    async function syncSettingsFromUi(doc = root.document) {
        if (!doc) return false;
        const credential = providerCredential(doc);
        if (!credential.apiKeyPresent) return false;

        const saveButton = doc.getElementById('btn-save-settings');
        if (!saveButton) return false;
        const event = {
            type: 'click',
            target: saveButton,
            currentTarget: saveButton,
            preventDefault() {},
            stopPropagation() {}
        };

        if (typeof saveButton.onclick === 'function') {
            await Promise.resolve(saveButton.onclick.call(saveButton, event));
            return true;
        }
        if (typeof saveButton.click === 'function') {
            saveButton.click();
            return true;
        }
        return false;
    }

    function patchRequestConfiguredAI() {
        const current = root.requestConfiguredAI;
        if (typeof current !== 'function') return false;
        if (current[PATCH_MARK]) return true;

        const wrapped = async function credentialRecoveringRequest(...args) {
            try {
                return await current.apply(this, args);
            } catch (error) {
                if (!missingCredentialError(error)) throw error;
                const synced = await syncSettingsFromUi(root.document);
                if (!synced) throw error;
                console.info('[CredentialRecoveryV23] Credenziali sincronizzate dall’interfaccia; ripeto la richiesta AI.');
                return current.apply(this, args);
            }
        };
        wrapped[PATCH_MARK] = true;
        wrapped.__originalRequestConfiguredAI = current;
        root.requestConfiguredAI = wrapped;
        return true;
    }

    function install(doc = root.document, win = root) {
        const run = () => patchRequestConfiguredAI();
        run();
        if (doc?.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true });
        if (typeof win?.setTimeout === 'function') {
            win.setTimeout(run, 0);
            win.setTimeout(run, 250);
            win.setTimeout(run, 1000);
        }
        return true;
    }

    return {
        VERSION,
        missingCredentialError,
        providerCredential,
        syncSettingsFromUi,
        patchRequestConfiguredAI,
        install
    };
});