# NFO Generator Web

Application web pour generer un NFO complet depuis un fichier video (drag-and-drop).
https://app.asilisk.fr/nfo
## Fonctionnalites

- Drag-and-drop ou selection de fichier video (`mkv`, `mp4`, `avi`, etc.)
- Deux moteurs d'analyse:
  - `Navigateur (WASM)` avec `mediainfo.js` (aucun upload)
  - `MediaInfo complet (serveur)` via binaire officiel `mediainfo`
- Rendu NFO immediat (General, Video, Audio, Text, Menu, etc.)
- Ajout d'une ligne `Source : <Team>` optionnelle
- Bouton `Selection La-Cale` pour suggerer les cases a cocher a partir du fichier analyse
- Copie presse-papiers du NFO et d'un resume BBCode preformate
- Telechargement du fichier `.nfo`
- Interface epuree, responsive, style premium

## Architecture

- Frontend: `React + Vite + TypeScript`
- Backend optionnel: `Express + multer` + binaire `mediainfo`
- Endpoint: `POST /api/mediainfo/full`
- Fichier de langue FR fourni: `resources/mediainfo-fr.csv` (utilise automatiquement par l'API)

## Demarrage local (mode navigateur uniquement)

```bash
npm install
npm run dev
```

Ce mode n'utilise pas le moteur complet CLI, uniquement `mediainfo.js` en local navigateur.

## Demarrage local (moteur MediaInfo complet)

Prerequis:
- Installer le binaire `mediainfo` sur la machine
- Verifier avec `mediainfo --Version`

Installation Windows recommandee (Winget):

```bash
winget install --id MediaArea.MediaInfo --exact --source winget --accept-package-agreements --accept-source-agreements --silent
```

Lien officiel binaire CLI Windows:
- https://mediaarea.net/en/MediaInfo/Download/Windows

Emplacement habituel apres installation Winget:
- `C:\Users\<TonUser>\AppData\Local\Microsoft\WinGet\Links\MediaInfo.exe`

Lancer deux terminaux:

```bash
# Terminal 1
npm run api:dev

# Terminal 2
npm run dev
```

Le front Vite proxy automatiquement `/api` vers `http://localhost:8787`.

Variables d'environnement backend utiles:
- `MEDIAINFO_BINARY` (defaut: `mediainfo`)
- `MEDIAINFO_LANGUAGE` (defaut: `file://<projet>/resources/mediainfo-fr.csv`, mettre `auto` pour la langue systeme, ou `raw`)
- `MEDIAINFO_OUTPUT_PROFILE` (defaut: `standard`, option: `full`)
- `MEDIAINFO_TIMEOUT_MS` (defaut: `120000`)
- `MAX_UPLOAD_SIZE_BYTES` (defaut: `26843545600` = 25 Gio)

Important:
- `standard` = rendu propre sans doublons (recommande)
- `full` = sortie verbeuse avec champs techniques en doublon

Apres modification de la config, redemarrer `npm run api:dev`.

## Build production

```bash
npm run build
npm run start
```

`npm run start` lance l'API + le service des fichiers statiques `dist/`.

## Deploiement

Pour utiliser le moteur complet MediaInfo, deployer sur une plateforme qui accepte:
- un process Node persistant
- le binaire `mediainfo` (installe systeme ou image Docker)

Exemples: Railway, Render, Fly.io, VPS Docker.

Si tu veux un hebergement statique pur (Vercel/Netlify sans backend), reste en mode `Navigateur (WASM)`.

### Docker (recommande pour moteur complet)

```bash
docker build -t nfo-generator .
docker run --rm -p 8787:8787 nfo-generator
```

ou avec compose:

```bash
docker compose up --build
```

## Debian 13 (production systemd)

### 1) Installer les prerequis systeme

```bash
sudo ./scripts/bootstrap-debian13.sh
```

Ce script installe:
- `Node.js 22.x`
- `mediainfo`
- outils de build/deploiement (`git`, `rsync`, `build-essential`)

### 2) Deployer l'application en service

```bash
sudo ./scripts/deploy-debian13.sh
```

Le script:
- synchronise le projet vers `/opt/La-Cale-Compatible-NFO-Generator`
- installe les dependances, build le frontend, puis retire les dev dependencies
- installe le service `systemd` `la-cale-compatible-nfo-generator.service`
- cree `/etc/la-cale-compatible-nfo-generator.env` (si absent)
- active et redemarre le service

Au redemarrage du service, un `git fetch/pull` est tente automatiquement avant le lancement de l'app,
suivi d'un `npm ci && npm run build && npm prune --omit=dev` si un nouveau commit est detecte.

### 3) Configurer l'environnement

Fichier par defaut:
- `/etc/la-cale-compatible-nfo-generator.env`

Exemple fourni:
- `deploy/env/la-cale-compatible-nfo-generator.env.example`

Variables importantes:
- `PORT` (defaut: `8787`)
- `MEDIAINFO_BINARY` (defaut: `mediainfo`)
- `MEDIAINFO_LANGUAGE` (defaut recommande: `file:///opt/La-Cale-Compatible-NFO-Generator/resources/mediainfo-fr.csv`)
- `MEDIAINFO_OUTPUT_PROFILE` (`standard` ou `full`)
- `MEDIAINFO_TIMEOUT_MS`
- `MAX_UPLOAD_SIZE_BYTES`
- `AUTO_UPDATE_GITHUB` (`true`/`false`, defaut: `true`)
- `AUTO_UPDATE_BRANCH` (optionnel, defaut: branche courante puis `main`)

Apres modification du `.env`:

```bash
sudo systemctl restart la-cale-compatible-nfo-generator.service
```

### 4) Verification et logs

```bash
sudo systemctl status la-cale-compatible-nfo-generator.service
sudo journalctl -u la-cale-compatible-nfo-generator.service -f
```

Logs de mise a jour Git (au restart):

```bash
sudo journalctl -u la-cale-compatible-nfo-generator.service -g auto-update
```

## API

### `GET /api/health`
- Check disponibilite du binaire `mediainfo`
- Retourne aussi `language`, `outputProfile` et `frenchLanguageEnabled`

### `POST /api/mediainfo/full`
- `multipart/form-data` avec champ `video`
- Retour: `{ "text": "..." }`
