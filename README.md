# CortX
<img width="300" height="400" alt="CortX_logo" src="https://github.com/user-attachments/assets/111a3923-a2d0-47ea-8e2f-50ff7c3aaa50" />

### Du vibe coding au vibe learning.

> Un second cerveau piloté par IA. Tu parles, l'IA range. Tu cherches, l'IA connecte. Tu oublies, l'IA se souvient.

CortX applique le paradigme de Claude Code à la gestion de connaissances personnelles. L'utilisateur parle en langage naturel — une info apprise, un contact rencontré, une idée — et un agent IA structure tout dans des fichiers Markdown sur sa machine. Pas de dossiers à créer, pas de tags à inventer. L'agent décide où ranger, crée les liens entre les notes, et suggère des connexions que l'utilisateur n'avait pas vues.

Tout peut tourner **en local** avec llama.cpp et un modèle open source, ou via une **API** (Claude, OpenAI) pour plus de puissance. Les données restent chez l'utilisateur.

---

## Table des matières

- [Concept](#concept)
- [Positionnement](#positionnement)
- [Architecture](#architecture)
- [L'agent — le cœur du produit](#lagent--le-cœur-du-produit)
- [Modèle de données](#modèle-de-données)
- [Workflows](#workflows)
- [Interface](#interface)
- [Roadmap](#roadmap)
- [Monétisation](#monétisation)
- [Lancement](#lancement)
- [Contribuer](#contribuer)

---

## Concept

### Le problème

Les outils de prise de notes (Obsidian, Notion, Logseq) partent du principe que l'utilisateur structure lui-même sa pensée. Le frein principal à l'adoption du "second cerveau" n'est pas le manque d'outils — c'est la **charge cognitive de maintenance**. Les gens commencent avec enthousiasme, puis abandonnent parce que ranger, lier, reformuler prend trop de temps.

### La solution

CortX réduit le coût d'entrée à **zéro**. L'utilisateur tape du texte brut en langage naturel. Un agent IA analyse l'input, identifie les entités (personnes, entreprises, concepts, faits), décide quels fichiers Markdown créer ou modifier, crée les liens entre eux, et maintient la cohérence de toute la base. L'utilisateur valide ou annule. C'est tout.

### L'analogie fondamentale

| Claude Code | CortX |
|---|---|
| L'utilisateur décrit ce qu'il veut en langage naturel | L'utilisateur rapporte une info en langage naturel |
| L'agent navigue dans la codebase | L'agent navigue dans la base de connaissances |
| L'agent modifie les bons fichiers de code | L'agent modifie les bons fichiers Markdown |
| L'utilisateur valide via le diff | L'utilisateur valide via le résumé d'actions |
| Git commit automatique | Git commit automatique |
| Vibe coding | **Vibe learning** |

---

## Positionnement

### Ce qui existe et pourquoi ça ne suffit pas

| Outil | Ce qu'il fait | Ce qu'il ne fait pas |
|---|---|---|
| **Mem.ai** | Organisation auto par IA, recherche sémantique, zéro dossiers | 100% cloud, pas de LLM local, format propriétaire, l'IA ne modifie pas de fichiers structurés |
| **Khoj** | Open source, self-hostable, LLMs locaux et distants | Moteur de recherche/chat — on pose des questions, l'agent ne restructure rien |
| **Second Brain** | Ingestion auto de contenus web, auto-organisation | SaaS fermé, pas de fichiers locaux, pas d'agent qui écrit |
| **Obsidian + plugins IA** | Chat IA dans Obsidian (Copilot, Smart Connections) | L'IA répond aux questions mais ne modifie pas les fichiers |
| **Reflect** | Chiffrement E2E, wikilinks, graphe | IA limitée au résumé et à la recherche, pas d'agent autonome |
| **Notion AI** | Q&A puissant sur la base, bon pour les équipes | Format propriétaire, pas de mode local, pas d'agent qui restructure |

### Le trou dans le marché

Aucun outil existant ne fait les trois choses suivantes en même temps :

1. **L'agent écrit et modifie les fichiers** — pas juste un chat qui répond
2. **Les fichiers sont en Markdown local** — portables, lisibles, durables
3. **Le LLM peut tourner en local** — confidentialité totale, zéro dépendance cloud

CortX occupe l'intersection de Claude Code (agent qui modifie des fichiers) + Obsidian (Markdown local) + llama.cpp (LLM local).

### Les 3 arguments de différenciation

**"L'agent ÉCRIT, il ne se contente pas de répondre."** Les concurrents proposent un chat au-dessus des notes. CortX a un agent qui modifie, crée, lie et restructure les fichiers. C'est la différence entre un assistant et un collaborateur.

**"Tes fichiers t'appartiennent, pour toujours."** Des `.md` sur le disque. Pas de format propriétaire, pas de lock-in, pas de serveur qui ferme. Compatibles avec Obsidian, VS Code, ou n'importe quel éditeur de texte dans 20 ans.

**"100% local si tu veux."** Avec llama.cpp embarqué, rien ne quitte la machine. Argument massif pour les professions réglementées (avocats, médecins, consultants stratégiques, défense).

---

## Architecture

### Stack technique

| Composant | Techno | Pourquoi |
|---|---|---|
| App desktop | Electron | Multi-plateforme, large communauté, embarque Node.js |
| Frontend | React + Tailwind CSS | Écosystème le plus documenté |
| Backend local | Node.js (intégré à Electron) | Gestion des fichiers, appels LLM, indexation |
| Stockage | Fichiers Markdown + SQLite | Simple, portable, pas de serveur de BDD |
| Recherche vectorielle | SQLite-vec ou Vectra | Embeddings stockés localement pour le RAG |
| Versioning | isomorphic-git | Chaque action = un commit. Annulation facile |
| Graphe | D3.js ou Cytoscape.js | Visualisation interactive des relations |
| LLM local | llama.cpp via node-llama-cpp | Embarqué dans l'app, API OpenAI-compatible |

### Le double moteur LLM

```
┌──────────────────────────────────────────────────┐
│                    CortX App                     │
│                                                  │
│  ┌───────────┐     ┌──────────────────────────┐  │
│  │ Interface │────▸│     Routeur LLM          │  │
│  │utilisateur│     │                          │  │
│  └───────────┘     │  Tâche simple ?          │  │
│                    │  ├─ OUI → LLM Local      │  │
│                    │  └─ NON → API distante   │  │
│                    └──────────┬───────────────┘  │
│                               │                  │
│              ┌────────────────┼────────────┐     │
│              ▼                ▼             │     │
│  ┌──────────────────┐ ┌──────────────┐     │     │
│  │   llama.cpp      │ │  API Claude  │     │     │
│  │  (llama-server   │ │  ou OpenAI   │     │     │
│  │   ou embarqué    │ │              │     │     │
│  │   via node-      │ │  Claude 4    │     │     │
│  │   llama-cpp)     │ │  Sonnet/Opus │     │     │
│  │                  │ │              │     │     │
│  │  Gemma 3, Qwen 3 │ │              │     │     │
│  │  Mistral, Llama  │ │              │     │     │
│  └──────────────────┘ └──────────────┘     │     │
│                                             │     │
│  ┌──────────────────────────────────────┐   │     │
│  │      Base de connaissances           │   │     │
│  │  📁 Markdown + 📊 SQLite index      │   │     │
│  │  🔀 Git auto-commit                 │   │     │
│  └──────────────────────────────────────┘   │     │
└──────────────────────────────────────────────────┘
```

**LLM local via llama.cpp :** L'app embarque `node-llama-cpp` et télécharge le modèle au premier lancement. L'utilisateur n'installe rien d'autre. Alternativement, l'app peut se connecter à un `llama-server` externe ou à Ollama/LM Studio déjà installé — tout est compatible via l'API OpenAI.

**API distante :** Claude API (Anthropic) ou OpenAI, appelée pour les tâches complexes (corrélations, suggestions, restructuration). L'utilisateur fournit sa propre clé API.

**Le routeur LLM** décide automatiquement :

| Tâche | LLM Local | API distante |
|---|---|---|
| Classifier le type d'input | ✅ | |
| Extraire les entités simples | ✅ | |
| Générer les embeddings | ✅ | |
| Petites éditions de fichiers | ✅ | |
| Créer un nouveau fichier structuré | ✅ Possible | ✅ Mieux |
| Planifier des actions complexes | | ✅ |
| Rédiger du contenu long | | ✅ |
| Détecter des contradictions | | ✅ |
| Générer des suggestions proactives | | ✅ |
| Préparer un briefing | | ✅ |

Trois modes configurables : **100% local** (confidentialité totale, qualité réduite), **hybride** (recommandé, ~5-15€/mois d'API), **API only** (meilleure qualité, plus simple).

### Modèles locaux recommandés (avril 2026)

Tâches légères (classification, extraction d'entités) :
- Gemma 3 4B — bon rapport qualité/taille, tourne sur 8 GB RAM
- Qwen 3 4B — excellent en multilingue

Tâches lourdes (planification d'actions, rédaction) :
- Gemma 3 12B ou Qwen 3 14B — nécessite 16 GB RAM
- Mistral Small 24B — excellent, nécessite 32 GB RAM ou GPU

Embeddings (recherche vectorielle) :
- nomic-embed-text — 137M paramètres, tourne partout
- snowflake-arctic-embed-m — alternative solide

### Comment l'agent "voit" la base

L'agent a besoin de contexte pour prendre les bonnes décisions. Le mécanisme fonctionne en 3 niveaux :

1. **Index structurel** — un fichier `_index.json` auto-généré (~2000 tokens) qui résume l'arborescence, les tags et les entités connues. Toujours injecté dans le prompt.
2. **RAG ciblé** — les 5-10 fichiers les plus pertinents pour l'input courant, récupérés par recherche vectorielle (~5000-10000 tokens).
3. **Le reste** — accessible si l'agent a besoin de creuser, mais pas injecté par défaut.

---

## L'agent — le cœur du produit

### Pipeline de traitement

Chaque message de l'utilisateur passe par 5 étapes :

```
INPUT UTILISATEUR
      │
      ▼
┌─────────────────┐
│ 1. CLASSIFICATION│  ← LLM local (rapide)
│                  │
│ capture / question / commande / réflexion
└────────┬────────┘
         ▼
┌─────────────────┐
│ 2. EXTRACTION    │  ← LLM local
│    D'ENTITÉS     │
│                  │
│ Personnes, organisations, concepts,
│ faits datés, relations
└────────┬────────┘
         ▼
┌─────────────────┐
│ 3. RECHERCHE     │  ← Embeddings + SQLite-vec
│    DE CONTEXTE   │
│                  │
│ Quels fichiers existants sont pertinents ?
│ → Top 5-10 injectés dans le prompt
└────────┬────────┘
         ▼
┌─────────────────┐
│ 4. PLANIFICATION │  ← LLM puissant (API recommandé)
│    D'ACTIONS     │
│                  │
│ Quels fichiers créer / modifier / lier ?
│ → Plan d'actions en JSON
└────────┬────────┘
         ▼
┌─────────────────┐
│ 5. EXÉCUTION     │  ← Code applicatif
│    + FEEDBACK    │
│                  │
│ Appliquer les modifications
│ Git commit auto
│ Afficher le diff à l'utilisateur
└─────────────────┘
```

### Les 4 types d'input

| Type | Déclencheur | Ce que l'agent fait |
|---|---|---|
| **Capture** | L'utilisateur rapporte une info, un fait, une rencontre | Modifie la base : crée/modifie des fichiers, ajoute des liens |
| **Question** | L'utilisateur interroge sa base | Ne modifie RIEN, répond en citant les fichiers pertinents |
| **Commande** | L'utilisateur demande une action explicite | Exécute l'action demandée (créer un domaine, fusionner, réorganiser) |
| **Réflexion** | L'utilisateur pense à voix haute | Ne modifie RIEN, propose des actions sans les exécuter |

### Les 10 règles de comportement de l'agent

1. **Détecter le type d'input** avant toute action
2. **Extraire systématiquement les entités** pour chaque capture (personnes, organisations, domaines, faits, relations)
3. **Vérifier avant de créer** — chercher si l'entité existe déjà, même sous un autre nom ou diminutif. Ne jamais créer de doublon.
4. **Enrichir, ne pas remplacer** — ajouter des informations, ne pas écraser. Signaler les contradictions sans les résoudre.
5. **Interconnecter systématiquement** — wikilinks dans le contenu, champ `related` dans le frontmatter, liens dans les deux sens.
6. **Journaliser** — chaque capture génère une entrée dans `Journal/{date}.md`.
7. **Être proportionnel** — un input simple = une modification. Un input riche = plusieurs actions. Ne pas sur-interpréter.
8. **Suggérer sans agir** — proposer des connexions, des domaines à créer, des lacunes à combler, mais ne pas exécuter sans accord.
9. **Ne jamais détruire** — aucune suppression de fichier ou de contenu sans instruction explicite.
10. **Écrire en français** — sauf termes techniques, noms propres et acronymes.

### Format de réponse de l'agent

L'agent retourne exclusivement du JSON structuré :

```json
{
  "input_type": "capture",
  "actions": [
    {
      "action": "create",
      "file": "Réseau/Sophie_Martin.md",
      "content": "---\ntype: personne\n..."
    },
    {
      "action": "modify",
      "file": "Domaines/Aéronautique.md",
      "section": "Actualités et tendances",
      "operation": "append",
      "content": "- **2026-04-06** — Le programme SCAF accumule 6 mois de retard."
    }
  ],
  "summary": "Résumé en français de ce qui a été fait.",
  "conflicts": [],
  "ambiguities": [],
  "suggestions": [
    "Tu as 3 contacts dans l'aéro. Veux-tu une vue consolidée ?"
  ]
}
```

Actions possibles :
- `create` — créer un nouveau fichier (contenu complet fourni)
- `modify` — modifier un fichier existant (section ciblée, opération `append`/`prepend`/`replace_line`/`add_item`)

### Mécanismes de sécurité

**Git automatique** — chaque action de l'agent = un commit avec message descriptif. Bouton "Annuler" = `git revert`.

**Mode validation** — configurable : "toujours valider", "valider les créations uniquement", ou "automatique". L'agent affiche son plan avant d'exécuter.

**Détection de conflits** — si un fichier a été modifié manuellement depuis la dernière action, l'agent signale le conflit.

**Journal d'audit** — `_System/agent_log.md` enregistre chaque action avec horodatage, input original, et actions effectuées.

---

## Modèle de données

### Le fichier Markdown enrichi

Chaque fichier suit un format standardisé avec frontmatter YAML :

```markdown
---
type: personne
tags: [aéronautique, dassault, SCAF]
created: 2026-04-06
modified: 2026-04-06
related:
  - "[[Dassault_Aviation]]"
  - "[[Aéronautique]]"
status: actif
---

# Sophie Martin

## Identité
- **Poste :** Directrice technique — [[Dassault_Aviation]]
- **Poste précédent :** Ingénieur systèmes — [[Thales]]
- **Email :** sophie.martin@dassault-aviation.com

## Historique des interactions
- **2026-04-06** — Déjeuner. Annonce de son arrivée chez Dassault.
  Évoque le retard du [[Programme_SCAF]].

## Notes
- Transition récente de [[Thales]] vers [[Dassault_Aviation]]
- Contact stratégique pour le secteur aéro
```

### Structure des dossiers

```
CortX-Base/
├── Réseau/              ← Fiches de personnes
├── Entreprises/         ← Fiches d'organisations
├── Domaines/            ← Domaines de connaissance
├── Projets/             ← Projets en cours ou passés
├── Journal/             ← Entrées quotidiennes (YYYY-MM-DD.md)
├── _Templates/          ← Modèles de fichiers
├── _System/
│   ├── _index.json      ← Index structurel auto-généré
│   ├── agent_log.md     ← Journal d'audit de l'agent
│   └── cortx.db         ← SQLite (index, embeddings, relations)
└── .git/                ← Versioning automatique
```

### L'index SQLite

En parallèle des fichiers Markdown (la source de vérité), une base SQLite maintient un index pour les opérations rapides :

| Table | Rôle |
|---|---|
| `files` | Chemin, type, titre, hash du contenu, date de modification |
| `entities` | Nom, type (personne/entreprise/concept), fichier principal |
| `relations` | Entité source, entité cible, type de relation, fichier source |
| `embeddings` | Fichier, position du chunk, vecteur, texte source |
| `agent_log` | Horodatage, input, actions, commit hash |

### Le graphe de relations

Construit à partir de la table `relations` et des wikilinks parsés dans les fichiers. Types de relations détectées automatiquement :

| Relation | Exemple |
|---|---|
| `travaille_chez` | Personne → Entreprise |
| `a_quitté` | Personne → Entreprise |
| `connaît` | Personne → Personne |
| `présenté_par` | Personne → Personne |
| `expert_en` | Personne → Domaine |
| `opère_dans` | Entreprise → Domaine |
| `participe_à` | Entreprise → Projet |
| `sous-domaine_de` | Domaine → Domaine |

---

## Workflows

### 1. Capture au fil de l'eau

L'utilisateur sort d'un déjeuner et tape :

```
Déjeuner avec Sophie Martin. Elle quitte Thales pour rejoindre Dassault Aviation 
comme directrice technique. Elle m'a parlé du programme SCAF, apparemment le 
calendrier glisse de 6 mois.
```

L'agent retourne :

```
~ Réseau/Sophie_Martin.md
  ✏️  Poste mis à jour : Thales → Dassault Aviation (Directrice technique)
  ➕  Interaction ajoutée : déjeuner du 06/04/2026

+ Entreprises/Dassault_Aviation.md  [NOUVEAU]
  📄  Créé avec : secteur aéronautique, contact Sophie Martin

~ Domaines/Aéronautique.md
  ➕  Actualité : retard de 6 mois sur le programme SCAF

~ Entreprises/Thales.md
  ✏️  Sophie Martin a quitté l'entreprise

+ Journal/2026-04-06.md
  ➕  Entrée : déjeuner Sophie Martin, transition Thales → Dassault

[✓ Validé]  [↩ Annuler]
```

En un seul input de texte brut, l'agent a identifié 1 personne, 2 entreprises et 1 programme, modifié 3 fichiers, créé 2 nouveaux fichiers, et maintenu les liens croisés.

### 2. Apprentissage structuré

```
Je veux ouvrir un nouveau domaine : l'hydrogène comme carburant aéronautique. 
Acteurs : Airbus (ZEROe), Universal Hydrogen, H2FLY. 
Enjeux : stockage cryogénique, certification, infrastructure.
```

L'agent crée `Domaines/Hydrogène_Aviation.md` avec une structure pré-remplie (vue d'ensemble, acteurs clés, enjeux techniques, questions ouvertes, sources), crée les fichiers entreprises manquants, et ajoute les liens depuis `Aéronautique.md`.

### 3. Interrogation de la base

```
Prépare-moi un brief pour ma réunion avec Sophie Martin demain.
```

L'agent ne modifie rien. Il lit la base, compile tout ce qui concerne Sophie et Dassault, et génère un briefing structuré dans le panneau de conversation : identité, historique des interactions, connexions possibles avec d'autres contacts, et points à creuser.

### 4. Suggestions proactives

L'agent analyse périodiquement la base et propose :
- Des **connexions** non encore formalisées entre entités
- Des **contradictions** entre notes de dates différentes
- Des **lacunes** dans un domaine (beaucoup de notes sur le hardware IoT mais rien sur les protocoles)
- Des **relances** sur des contacts non mis à jour depuis longtemps

### 5. Import initial

Au premier lancement, l'utilisateur décrit son profil professionnel. L'agent génère une base de départ avec les dossiers, les domaines pertinents, et des fichiers-squelettes prêts à être enrichis.

---

## Interface

### Principe directeur

Inspirée de Claude Code : une interface épurée centrée sur la conversation avec l'agent. Pas de menus complexes, pas de formulaires. Un champ de saisie permanent, une sidebar pour naviguer dans la base, et un panneau principal pour la conversation ou le graphe.

### Les 3 vues

**Vue Conversation** — le terminal de l'agent. L'utilisateur tape, l'agent répond avec des diffs lisibles. Chaque action a un bouton Valider/Annuler. Les suggestions proactives apparaissent dans un style distinct.

**Vue Graphe** — la carte de la base de connaissances. Nœuds colorés par type (personne, entreprise, domaine, projet). Survol pour voir les connexions, clic pour ouvrir le fichier. Filtrable par type, par date, par tag.

**Vue Fichier** — le contenu Markdown d'un fichier sélectionné, rendu proprement. Modifiable manuellement si besoin (les modifications manuelles sont détectées et ré-indexées).

### La barre d'input

Toujours visible en bas de l'écran. Mode par défaut : texte libre, l'agent classifie seul. Commandes optionnelles disponibles :

| Commande | Effet |
|---|---|
| `/ask` | Force le mode question (pas de modification) |
| `/raw` | Crée un fichier brut sans interprétation |
| `/undo` | Annule la dernière action |
| `/status` | Affiche l'état de la base |
| `/digest` | Génère le résumé quotidien |
| `/brief [sujet]` | Prépare un briefing sur un sujet |

### La capture rapide globale

Un raccourci clavier système (ex : `Ctrl+Shift+Space`) ouvre une petite fenêtre flottante par-dessus n'importe quelle application. L'utilisateur tape, appuie sur Entrée, la fenêtre se ferme. L'agent traite en arrière-plan. Notification discrète avec le résumé des actions.

### Le feedback de l'agent

Traduit en langage humain, pas en diff technique :

```
✅  Bon                                    ❌  Trop technique

~ Réseau/Sophie_Martin.md                 @@ -12,3 +12,5 @@
  ✏️  Poste : Thales → Dassault            - **Poste :** Ingénieur — Thales
  ➕  Email ajouté                          + **Poste :** Dir. tech — Dassault
                                            + **Email :** sophie@...
```

---

## Roadmap

### Phase 0 — Setup et apprentissage (semaines 1-3)

Mise en place de l'environnement de développement. Installer Node.js, VS Code/Cursor, git. Suivre un tuto Electron + React. Installer llama.cpp et faire tourner un modèle en mode serveur. Tester un appel API depuis Node.js. Créer le repo Git.

**Livrable :** une app Electron vide qui se lance, et un script qui appelle llama-server.

### Phase 1 — MVP "Capture + Agent" (semaines 4-9)

La coquille (semaines 4-5) : structure Electron + React, sidebar avec arborescence de fichiers, panneau central Markdown, barre d'input.

L'agent V1 (semaines 6-7) : module routeur LLM (local ou API), prompt système, exécuteur d'actions (JSON → modifications de fichiers), affichage du diff, git auto-commit.

L'utilisabilité (semaines 8-9) : bouton Annuler, mode validation, base de départ par défaut, settings (choix LLM, clé API, chemin du dossier).

**Livrable :** une app fonctionnelle où l'on tape "Pierre travaille chez Airbus", l'agent crée/modifie les bons fichiers.

### Phase 2 — Intelligence et graphe (semaines 10-17)

RAG (semaines 10-12) : embeddings via modèle local, stockage dans SQLite-vec, recherche sémantique avant chaque appel agent, recherche utilisateur dans la base.

Graphe (semaines 13-14) : parsing des wikilinks, extraction des tags et relations, graphe interactif D3.js/Cytoscape.js, filtres par type.

Agent V2 (semaines 15-17) : détection automatique des entités et création de liens, suggestions de connexions, daily digest, interrogation de la base ("résume tout ce que je sais sur X").

**Livrable :** graphe de connaissances interactif, recherche sémantique, suggestions de liens.

### Phase 3 — Expérience utilisateur avancée (semaines 18-23)

Capture rapide globale (raccourci clavier système), import presse-papier, templates de base par profil professionnel, mode conversation (discuter sans modifier), export PDF/Markdown, thèmes, compatibilité Obsidian.

### Phase 4 — Intelligence avancée (mois 7+)

Détection de contradictions, détection de lacunes, briefing automatique avant réunion, veille assistée, multi-base (pro/perso), import vocal, Knowledge Score (indicateur de profondeur par domaine), Decay Detector (signalement des notes obsolètes).

### Jalons clés

| Semaine | Jalon |
|---|---|
| ~12 | Landing page + waitlist (mesurer l'intérêt) |
| ~20 | Beta publique (premiers utilisateurs, feedback) |
| ~24 | Lancement sur Gumroad |

---

## Monétisation

### Modèle : licence one-shot via Gumroad

Pas d'abonnement. Pas de frais serveur (tout est local ou via la clé API de l'utilisateur). L'utilisateur paie une fois pour le logiciel.

| | Starter (gratuit) | Pro (39 €) | Lifetime (79 € early bird) |
|---|---|---|---|
| LLM local | ✅ | ✅ | ✅ |
| Support API Claude/OpenAI | ❌ | ✅ | ✅ |
| Nombre de fichiers | 50 max | Illimité | Illimité |
| Graphe interactif | Vue seule | Interactif + filtres | Interactif + filtres |
| Suggestions proactives | ❌ | ✅ | ✅ |
| Templates professionnels | 1 basique | Tous | Tous |
| Export PDF | ❌ | ✅ | ✅ |
| Capture rapide globale | ❌ | ✅ | ✅ |
| Mises à jour | 6 mois | 1 an | À vie |

Le Lifetime à 79 € est limité aux 500 premiers acheteurs (passe à 99 € ensuite). Crée de l'urgence et récompense les early adopters.

### Objectifs réalistes

- Phase 1 (lancement) : 100-200 ventes = 4 000-8 000 €
- 12 mois : 500-1 000 ventes = 20 000-40 000 €

### Implémentation Gumroad

Créer un produit "Software" sur Gumroad avec téléchargement (.dmg, .exe, .AppImage). Gumroad fournit une clé de licence. L'app la vérifie au premier lancement via l'API Gumroad (une seule requête HTTP). La version Starter ne nécessite pas de clé.

---

## Lancement

### Validation pré-développement (semaines 1-2)

Avant d'investir des mois : poster le concept sur r/ObsidianMD et r/LocalLLaMA avec la maquette pour mesurer l'intérêt. Enregistrer une vidéo démo de 90 secondes. Créer une landing page minimale (Carrd ou Framer) avec capture d'email. Objectif : 100+ emails = signal fort.

### Build in public (pendant tout le développement)

1 post par semaine sur Twitter/X montrant un progrès concret (screenshot, GIF). 1 post Reddit toutes les 2 semaines. L'audience se construit en même temps que le produit.

### Communautés cibles par priorité

1. **r/LocalLLaMA** — passionnés de LLMs locaux, très engagés
2. **r/ObsidianMD** — utilisateurs frustrés par le manque d'IA dans Obsidian
3. **r/selfhosted** — amoureux de la souveraineté des données
4. **r/productivity** — plus grand public, volume important
5. **Hacker News** — "Show HN: CortX" — une bonne démo peut générer 10 000 visites
6. **Product Hunt** — pour le lancement officiel

---

## Edge cases et risques

| Risque | Impact | Mitigation |
|---|---|---|
| L'agent casse des fichiers | Perte de confiance | Git auto-commit + mode validation avant écriture |
| Le LLM local est trop lent | UX dégradée | Routeur : local pour le simple, API pour le complexe |
| Le LLM local est trop bête | Mauvaise classification | Modèles 8B+ et prompt structuré avec few-shot examples |
| La base grossit trop pour le contexte | L'agent ne voit plus tout | RAG dès la Phase 2, index structurel compact |
| Doublons d'entités | Base incohérente | Fuzzy matching sur les noms, table `entities`, demande de clarification |
| Modification manuelle par l'utilisateur | Index désynchronisé | File watcher, ré-indexation automatique |
| Données sensibles envoyées à l'API | Fuite de confidentialité | Dossiers marqués "privés" (jamais envoyés), mode 100% local |
| Personne n'achète | Pas de revenus | Valider l'intérêt AVANT de coder (landing page, Reddit) |
| Un concurrent sort avant | Perte d'avantage | Itérer vite, beta dès le MVP, communauté early adopters |

---

## Les 10 fonctionnalités qui feront la différence

1. **Daily Digest** — résumé quotidien : ajouts récents, connexions, tâches à faire
2. **Knowledge Score** — indicateur visuel de profondeur par domaine (gamification)
3. **Decay Detector** — signale les fichiers obsolètes ("Ta note sur Marc date de 3 mois, est-elle toujours à jour ?")
4. **Import vocal** — dictée → transcription → traitement par l'agent
5. **Import presse-papier** — coller un texte ou lien, l'agent extrait et intègre
6. **Mode Préparation de réunion** — briefing automatique à partir des noms des participants
7. **Templates de capture** — raccourcis personnalisables (`/cr` pour compte-rendu de réunion)
8. **Export ciblé** — générer un rapport PDF/Markdown à partir d'un sous-ensemble de la base
9. **Mode Mentorship** — l'agent identifie les lacunes et pose des questions pour approfondir
10. **API / Webhook** — permettre à d'autres outils d'alimenter CortX (flux RSS, scripts, intégrations)

---

## Contribuer

Le projet est en phase de conception. Les contributions les plus utiles à ce stade :

- **Feedback sur le concept** — ouvrir une issue pour discuter du design
- **Test du prompt agent** — le fichier `prompts/agent_v1.md` contient le prompt système complet avec un guide de test. Testez-le dans Claude.ai ou avec un modèle local et reportez vos résultats.
- **Design d'interface** — propositions de maquettes, améliorations UX
- **Architecture technique** — suggestions sur la stack, le RAG, la gestion des embeddings

---

## Première action concrète

```bash
mkdir cortx && cd cortx && git init
npm init -y
npm install electron --save-dev
```

Ouvrir Claude Code dans ce dossier et dire :

> Crée-moi une app Electron avec React, une sidebar à gauche qui liste les fichiers .md d'un dossier, un panneau central qui affiche le contenu d'un fichier sélectionné, et une barre d'input en bas. Style sombre, police monospace.

La coquille sera prête en 30 minutes. Ensuite, étape par étape, ajouter l'intelligence.

---

## Licence

[À définir — MIT recommandé si open source, propriétaire si vente via Gumroad uniquement]

---

*CortX — Du vibe coding au vibe learning.*
