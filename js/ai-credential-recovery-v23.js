(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.CronacheAICredentialRecoveryV23 = api;
        root.CronacheAICredentialRecoveryV24 = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const VERSION = 24;
    const PATCH_MARK = '__cronacheCredentialRecoveryV24';
    const STORAGE_KEY = 'dnd_v4';
    const STORY_SCRIPT = 'js/story-generation-v26.js?v=20260824-story-generation-v26-1';
    const installState = { preSynced: false, intervalId: null, attempts: 0 };

    const clean = value => String(value == null ? '' : value).trim();

    function missingCredentialError(error) {
        const message = clean(error?.message || error).toLowerCase();
        return /api key|chiave api/.test(message) && /(non configurat|mancant|inserisc|configura|assente|missing)/.test(message);
    }

    function readSavedSettings(storage = root.localStorage) {
        try {
            const raw = storage?.getItem?.(STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed?.settings && typeof parsed.settings === 'object' ? parsed.settings : {};
        } catch (_error) {
            return {};
        }
    }

    function credentialIds(provider) {
        if (provider === 'ollama-cloud') return ['set-ollama-key'];
        if (provider === 'openrouter' || provider === 'openrouter-free') return ['set-openrouter-key'];
        if (provider === 'deepseek') return ['set-kimera-key', 'set-openrouter-key'];
        return ['set-groq-key'];
    }

    function savedCredential(settings, provider) {
        if (provider === 'ollama-cloud') return clean(settings?.ollama?.apiKey);
        if (provider === 'openrouter' || provider === 'openrouter-free') return clean(settings?.openrouterKey);
        if (provider === 'deepseek') return clean(settings?.kimeraKey || settings?.openrouterKey);
        return clean(settings?.groqKey);
    }

    function providerCredential(doc = root.document, storage = root.localStorage) {
        const saved = readSavedSettings(storage);
        const select = doc?.getElementById('set-model');
        const domProvider = clean(select?.value);
        const savedProvider = clean(saved?.model);
        const providerCandidates = [domProvider, savedProvider, 'ollama-cloud', 'openrouter', 'deepseek', 'groq']
            .filter((value, index, list) => value && list.indexOf(value) === index);

        for (const provider of providerCandidates) {
            const ids = credentialIds(provider);
            const inputs = ids.map(id => doc?.getElementById(id)).filter(Boolean);
            const populatedInput = inputs.find(node => clean(node?.value));
            const uiKey = clean(populatedInput?.value);
            const storedKey = savedCredential(saved, provider);
            const apiKey = uiKey || storedKey;
            if (!apiKey) continue;
            return {
                provider,
                select,
                input: populatedInput || inputs[0] || null,
                apiKey,
                apiKeyPresent: true,
                source: uiKey ? 'ui' : 'storage',
                saved
            };
        }

        return {
            provider: domProvider || savedProvider || 'groq',
            select,
            input: null,
            apiKey: '',
            apiKeyPresent: false,
            source: 'none',
            saved
        };
    }

    function hydrateProviderFields(doc, credential) {
        if (!doc || !credential?.apiKeyPresent) return false;
        const provider = credential.provider;
        const select = credential.select || doc.getElementById('set-model');
        if (select && provider && select.value !== provider) {
            select.value = provider;
            try { select.dispatchEvent(new Event('change', { bubbles: true })); } catch (_error) { }
        }

        const ids = credentialIds(provider);
        const input = credential.input || ids.map(id => doc.getElementById(id)).find(Boolean);
        if (input && !clean(input.value)) input.value = credential.apiKey;

        if (provider === 'ollama-cloud') {
            const model = doc.getElementById('set-ollama-model');
            const storedModel = clean(credential.saved?.ollama?.primaryModel);
            if (model && !clean(model.value) && storedModel) model.value = storedModel;
        }
        return true;
    }

    async function syncSettingsFromUi(doc = root.document, storage = root.localStorage) {
        if (!doc) return false;
        const credential = providerCredential(doc, storage);
        if (!credential.apiKeyPresent) return false;
        hydrateProviderFields(doc, credential);

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
            installState.preSynced = true;
            return true;
        }
        if (typeof saveButton.click === 'function') {
            saveButton.click();
            installState.preSynced = true;
            return true;
        }
        return false;
    }

    function patchRequestConfiguredAI() {
        const current = root.requestConfiguredAI;
        if (typeof current !== 'function') return false;
        if (current[PATCH_MARK]) return true;

        const wrapped = async function credentialRecoveringRequest(...args) {
            if (!installState.preSynced) {
                try { await syncSettingsFromUi(root.document, root.localStorage); } catch (_error) { }
            }
            try {
                return await current.apply(this, args);
            } catch (error) {
                if (!missingCredentialError(error)) throw error;
                installState.preSynced = false;
                const synced = await syncSettingsFromUi(root.document, root.localStorage);
                if (!synced) throw error;
                console.info('[CredentialRecoveryV24] Credenziali recuperate e sincronizzate; ripeto la richiesta AI.');
                return current.apply(this, args);
            }
        };
        wrapped[PATCH_MARK] = true;
        wrapped.__originalRequestConfiguredAI = current;
        root.requestConfiguredAI = wrapped;
        return true;
    }

    function ensureStoryGenerationV26(doc = root.document) {
        if (!doc) return false;
        if (root.CronacheStoryGenerationV26?.install) {
            root.CronacheStoryGenerationV26.install(doc, root);
            return true;
        }
        if (doc.querySelector('script[data-story-generation-v26]')) return false;
        const script = doc.createElement('script');
        script.src = STORY_SCRIPT;
        script.async = false;
        script.dataset.storyGenerationV26 = '1';
        script.onload = () => root.CronacheStoryGenerationV26?.install?.(doc, root);
        script.onerror = error => console.error('[CredentialRecoveryV24] Impossibile caricare StoryGenerationV26:', error);
        (doc.head || doc.documentElement).appendChild(script);
        return true;
    }

    function install(doc = root.document, win = root) {
        ensureStoryGenerationV26(doc);
        const run = () => {
            installState.attempts++;
            const patched = patchRequestConfiguredAI();
            ensureStoryGenerationV26(doc);
            if (patched && root.CronacheStoryGenerationV26 && installState.intervalId && installState.attempts >= 4) {
                try { win.clearInterval(installState.intervalId); } catch (_error) { }
                installState.intervalId = null;
            }
            return patched;
        };

        run();
        if (doc?.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true });
        if (typeof win?.setTimeout === 'function') {
            [0, 250, 1000, 2500].forEach(delay => win.setTimeout(run, delay));
        }
        if (typeof win?.setInterval === 'function' && !installState.intervalId) {
            installState.intervalId = win.setInterval(() => {
                if (installState.attempts >= 30) {
                    try { win.clearInterval(installState.intervalId); } catch (_error) { }
                    installState.intervalId = null;
                    return;
                }
                run();
            }, 500);
        }
        return true;
    }

    return {
        VERSION,
        STORAGE_KEY,
        STORY_SCRIPT,
        missingCredentialError,
        readSavedSettings,
        providerCredential,
        hydrateProviderFields,
        syncSettingsFromUi,
        patchRequestConfiguredAI,
        ensureStoryGenerationV26,
        install
    };
});