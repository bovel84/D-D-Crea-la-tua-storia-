# Cronache del Destino

Gioco di ruolo narrativo con memoria persistente e provider AI configurabili.

## Pubblicazione con Ollama Cloud

L'app usa il proxy Vercel `https://storia-app.vercel.app/api/ollama`, necessario perché le WebView Android e gli hosting statici non possono leggere direttamente le risposte di `https://ollama.com/api` per le restrizioni CORS. Il giocatore deve inserire soltanto la propria API key e scegliere il modello.

Il proxy accetta richieste CORS senza cookie e inoltra la chiave esclusivamente all'API ufficiale Ollama Cloud. Un proxy alternativo può essere impostato esplicitamente tramite `nativeProxy`.

## Verifica locale

```bash
npm test
npm run check
```
