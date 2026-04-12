# CortX

<img width="300" height="400" alt="CortX_logo" src="https://github.com/user-attachments/assets/111a3923-a2d0-47ea-8e2f-50ff7c3aaa50" />

### Du vibe coding au vibe learning.

> Un second cerveau piloté par IA. Tu parles, l'IA range. Tu cherches, l'IA connecte. Tu oublies, l'IA se souvient.

CortX est une application desktop qui applique le paradigme de Claude Code à la gestion de connaissances personnelles. L'utilisateur parle en langage naturel — une info apprise, un contact rencontré, une idée — et un agent IA structure tout dans des fichiers Markdown sur sa machine. Pas de dossiers à créer, pas de tags à inventer. L'agent décide où ranger, crée les liens entre les notes, et suggère des connexions inattendues.

Tout tourne **en local** avec un modèle open source (Ollama, llama.cpp, LM Studio), ou via une **API** (Claude, OpenAI) pour plus de puissance. Les données restent chez l'utilisateur.

---

## Fonctionnalités

### Agent IA structurant

L'agent ne se contente pas de répondre — il **écrit et modifie les fichiers** de la base de connaissances :

- **Capture au fil de l'eau** — tapez du texte brut, l'agent identifie les entités (personnes, entreprises, concepts), crée ou met à jour les fichiers Markdown correspondants, ajoute les liens croisés
- **Questions sur la base** — interrogez votre base sans la modifier, l'agent cite les sources
- **Réflexion** — pensez à voix haute, l'agent propose des actions sans les exécuter
- **Commandes** — `/ask`, `/brief [sujet]`, `/synthese`, `/digest`

Chaque action proposée par l'agent est prévisualisable (diff avant/après) et soumise à validation. Rien ne s'écrit sans votre accord.

### Graphe de connaissances interactif

Visualisation en temps réel des relations entre toutes les entités de la base. Nœuds colorés par type (personne, entreprise, domaine, projet), filtrage, recherche, exploration par double-clic.

### Recherche hybride (RAG)

Recherche combinant indexation textuelle (FTS5) et recherche sémantique par embeddings. L'agent retrouve les fichiers pertinents avant chaque réponse.

### Bibliothèque de documents

Import et indexation de fichiers PDF, DOCX, PPTX et XLSX. Les documents sont découpés en chunks, vectorisés, et intégrés au contexte de l'agent.

### Versioning automatique

Chaque action acceptée = un commit Git. Historique complet, annulation en un clic (`git revert`), journal d'audit intégré.

### Mode Idle — Insights passifs

En arrière-plan, l'agent explore la base et génère des insights : connexions cachées, contradictions, lacunes, patterns.

### Interface bilingue

Interface complète en français et en anglais.

---

## Démo

<!-- TODO: Ajouter des captures d'écran ou un GIF de démo -->

```
Utilisateur :
  Déjeuner avec Sophie Martin. Elle quitte Thales pour rejoindre
  Dassault Aviation comme directrice technique. Elle m'a parlé du
  programme SCAF, apparemment le calendrier glisse de 6 mois.

Agent :
  ~ Réseau/Sophie_Martin.md
    ✏️  Poste mis à jour : Thales → Dassault Aviation
    ➕  Interaction ajoutée : déjeuner du 06/04/2026

  + Entreprises/Dassault_Aviation.md  [NOUVEAU]
    📄  Créé avec : secteur aéronautique, contact Sophie Martin

  ~ Domaines/Aéronautique.md
    ➕  Actualité : retard de 6 mois sur le programme SCAF

  [✓ Valider]  [↩ Annuler]
```

En un seul input de texte brut, l'agent identifie 1 personne, 2 entreprises et 1 programme, modifie 3 fichiers, crée 1 nouveau fichier, et maintient les liens croisés.

---

## Installation

### Prérequis

- **Node.js** 20+
- **Git**
- Un LLM au choix :
  - **Local** : [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), ou llama.cpp avec un endpoint OpenAI-compatible
  - **API** : une clé API [Anthropic](https://console.anthropic.com) (Claude) ou OpenAI

### Lancer en développement

```bash
git clone https://github.com/gcorman/CortX.git
cd CortX
npm install
npm run dev
```

### Builder pour Windows

```bash
npm run build     # Compile TypeScript
npm run dist      # Génère l'installeur NSIS dans dist/
```

> **Note :** Si `better-sqlite3` échoue au chargement, lancer `npm run rebuild` pour recompiler les bindings natifs.

### Configuration

Au premier lancement, configurer dans les paramètres :

1. **Chemin de la base** — dossier où seront stockés les fichiers Markdown (défaut : `~/Documents/CortX-Base/`)
2. **Fournisseur LLM** — Anthropic (clé API requise) ou OpenAI-compatible (Ollama, llama.cpp — pas de clé nécessaire)
3. **Modèle** — le modèle à utiliser pour l'agent

---

## Architecture

### Stack technique

| Composant | Techno |
|---|---|
| App desktop | Electron 41 |
| Frontend | React 19 + Tailwind CSS |
| État | Zustand |
| Base de données | SQLite (better-sqlite3) + FTS5 + embeddings |
| Versioning | isomorphic-git |
| Graphe | Cytoscape.js (fcose + cose-bilkent) |
| LLM | Anthropic SDK + OpenAI-compatible (fetch) |
| Documents | Python sidecar (docling, openpyxl, python-pptx) |

### Le pipeline agent — propose-then-execute

Architecture **proposer-puis-exécuter** : l'agent ne modifie jamais de fichiers sans validation explicite.

```
INPUT UTILISATEUR
      │
      ▼
┌─────────────────┐
│  RECHERCHE DE   │  ← FTS5 + embeddings + multi-hop
│  CONTEXTE (RAG) │
└────────┬────────┘
         ▼
┌─────────────────┐
│  APPEL LLM      │  ← Prompt système + contexte + input
│  (streaming)    │
└────────┬────────┘
         ▼
┌─────────────────┐
│  PARSING JSON   │  ← Multi-fallback (strict → code block → regex)
│  + NORMALISATION│
└────────┬────────┘
         ▼
┌─────────────────┐
│  PROPOSITION    │  ← Actions avec status: 'proposed'
│  (preview diff) │    Aucun fichier écrit
└────────┬────────┘
         ▼
    Utilisateur
   valide / refuse
         │
         ▼
┌─────────────────┐
│  EXÉCUTION      │  ← Écriture fichiers + git commit
│  + RÉINDEXATION │    + mise à jour SQLite
└─────────────────┘
```

### Structure des données utilisateur

```
CortX-Base/
├── Reseau/              ← Fiches de personnes
├── Entreprises/         ← Fiches d'organisations
├── Domaines/            ← Domaines de connaissance
├── Projets/             ← Projets en cours ou passés
├── Journal/             ← Entrées quotidiennes
├── Fiches/              ← Briefs et synthèses générés
├── Bibliotheque/        ← Documents importés (PDF, DOCX…)
├── _System/
│   └── cortx.db         ← SQLite (index, embeddings, relations, logs)
└── .git/                ← Versioning automatique
```

Chaque fichier Markdown suit un format standardisé avec frontmatter YAML (type, tags, dates, relations) et wikilinks `[[Entité]]` pour les liens croisés.

### Trois modes LLM

| Mode | Description |
|---|---|
| **100% local** | Ollama / llama.cpp / LM Studio — confidentialité totale, aucune donnée ne quitte la machine |
| **API** | Claude (Anthropic) ou OpenAI — meilleure qualité, requiert une clé API |
| **Hybride** | Local pour les tâches simples, API pour les tâches complexes *(prévu)* |

---

## État du projet

### Ce qui fonctionne (avril 2026)

| Fonctionnalité | État |
|---|---|
| Pipeline agent (capture / question / réflexion) | ✅ Complet |
| Intégration LLM (Anthropic + OpenAI-compatible) | ✅ Complet |
| Graphe de connaissances interactif | ✅ Complet |
| Recherche hybride FTS5 + embeddings | ✅ Complet |
| Versioning Git automatique + undo | ✅ Complet |
| Interface 3 panneaux redimensionnables | ✅ Complet |
| Import de documents (PDF, DOCX, XLSX, PPTX) | ✅ Complet |
| Mode Idle (insights passifs) | ✅ Complet |
| Internationalisation FR / EN | ✅ Complet |
| Paramètres (LLM, chemin, validation, langue) | ✅ Complet |
| Routeur LLM hybride (local/API auto) | 🔜 Prévu |
| Capture rapide globale (raccourci système) | 🔜 Prévu |
| Export PDF / Markdown | 🔜 Prévu |
| Import vocal | 🔜 Prévu |
| Packaging macOS / Linux | 🔜 Prévu |

### Modèles locaux recommandés

**Pour l'agent (classification + planification) :**
- Gemma 3 4B ou Qwen 3 4B — tourne sur 8 GB RAM
- Gemma 3 12B ou Qwen 3 14B — meilleure qualité, 16 GB RAM
- Mistral Small 24B — excellent, 32 GB RAM ou GPU

**Pour les embeddings (recherche sémantique) :**
- nomic-embed-text (137M params) — tourne partout
- snowflake-arctic-embed-m — alternative solide

---

## Positionnement

### Pourquoi CortX ?

Les outils de prise de notes (Obsidian, Notion, Logseq) partent du principe que l'utilisateur structure lui-même sa pensée. Le frein n° 1 au "second cerveau" n'est pas le manque d'outils — c'est la **charge cognitive de maintenance**.

CortX réduit le coût d'entrée à **zéro**. L'utilisateur tape du texte brut. L'agent fait le reste.

### Ce qui nous différencie

| | Mem.ai | Khoj | Obsidian + IA | CortX |
|---|---|---|---|---|
| L'agent **écrit** les fichiers | ❌ | ❌ | ❌ | ✅ |
| Fichiers **Markdown local** | ❌ | ❌ | ✅ | ✅ |
| LLM **100% local** possible | ❌ | ✅ | ❌ | ✅ |
| Graphe de connaissances | ❌ | ❌ | ✅ (plugin) | ✅ |
| Propose-then-execute | ❌ | ❌ | ❌ | ✅ |

---

## Contribuer

Le projet est en développement actif. Contributions bienvenues :

- **Bug reports** — ouvrir une issue avec les étapes de reproduction
- **Test avec différents LLMs** — retours sur la qualité de l'agent avec différents modèles locaux
- **Suggestions UX** — propositions d'amélioration de l'interface
- **Architecture technique** — suggestions sur le RAG, la gestion des embeddings, les performances

### Développement

```bash
npm run dev       # Electron en mode dev avec HMR
npm run build     # Compile main/preload/renderer
npm run dist      # Build + installeur Windows (NSIS)
npm run rebuild   # Recompile better-sqlite3
```

Pas de test runner configuré pour l'instant.

---

## Licence

ISC

---

*CortX — Du vibe coding au vibe learning.*
