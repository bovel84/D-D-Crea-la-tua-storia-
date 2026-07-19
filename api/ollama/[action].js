const OLLAMA_CLOUD_BASE = 'https://ollama.com/api';
const ALLOWED_ACTIONS = new Set(['chat', 'tags']);

module.exports = async function handler(request, response) {
    const action = String(request.query?.action || '').toLowerCase();

    // Il frontend può essere eseguito da GitHub Pages o da una WebView Android,
    // mentre il proxy vive su Vercel: autorizza il preflight CORS senza cookie.
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Max-Age', '86400');

    if (!ALLOWED_ACTIONS.has(action)) {
        return response.status(404).json({ error: 'Endpoint Ollama non disponibile.' });
    }
    if (request.method === 'OPTIONS') {
        return response.status(204).send('');
    }

    const expectedMethod = action === 'tags' ? 'GET' : 'POST';
    if (request.method !== expectedMethod) {
        response.setHeader('Allow', expectedMethod);
        return response.status(405).json({ error: `Usa il metodo ${expectedMethod}.` });
    }

    const authorization = String(request.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) {
        return response.status(401).json({ error: 'API key Ollama mancante.' });
    }

    try {
        const upstream = await fetch(`${OLLAMA_CLOUD_BASE}/${action}`, {
            method: expectedMethod,
            headers: {
                Authorization: authorization,
                ...(action === 'chat' ? { 'Content-Type': 'application/json; charset=utf-8' } : {})
            },
            ...(action === 'chat' ? { body: JSON.stringify(request.body || {}) } : {})
        });
        const payload = await upstream.text();
        response.status(upstream.status);
        response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
        return response.send(payload);
    } catch (error) {
        return response.status(502).json({ error: `Ollama Cloud non raggiungibile: ${error.message}` });
    }
};
