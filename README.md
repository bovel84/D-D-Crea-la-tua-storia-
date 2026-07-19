# Cronache del Destino

Gioco di ruolo narrativo con memoria persistente e provider AI configurabili.

## Pubblicazione con Ollama Cloud

Ollama Cloud usa un collegamento serverless interno: nell'app il giocatore deve inserire soltanto la propria API key e scegliere il modello. Per eseguire la rotta serverless `/api/ollama`, pubblica l'intero repository su Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbovel84%2FD-D-Crea-la-tua-storia-)

Non servono variabili d'ambiente: la chiave inserita dall'utente viene inviata alla rotta dello stesso sito e inoltrata a Ollama Cloud. La versione GitHub Pages resta statica e non può eseguire questa rotta.

## Verifica locale

```bash
npm test
npm run check
```
