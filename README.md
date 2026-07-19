# Cronache del Destino

Gioco di ruolo narrativo con memoria persistente e provider AI configurabili.

## Pubblicazione con Ollama Cloud

L'app usa direttamente l'API ufficiale `https://ollama.com/api`: il giocatore deve inserire soltanto la propria API key e scegliere il modello. Questo collegamento funziona anche nell'APK e negli hosting statici, senza dipendere dalla rotta serverless relativa `/api/ollama`.

Un proxy same-origin può ancora essere usato impostando esplicitamente `nativeProxy` nella configurazione del client.

## Verifica locale

```bash
npm test
npm run check
```
