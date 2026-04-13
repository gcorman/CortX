export type Language = 'fr' | 'en'

export interface T {
  settings: {
    title: string
    language: string
    langFr: string
    langEn: string
    appearance: string
    dark: string
    light: string
    knowledgeBasePath: string
    pathPlaceholder: string
    pathDescription: string
    browse: string
    llmProvider: string
    active: string
    anthropicDesc: string
    localDesc: string
    anthropicApiKey: string
    serverUrl: string
    quickPresets: string
    apiKeyOptional: string
    apiKeyLocalPlaceholder: string
    model: string
    anthropicModelsHint: string
    localModelHint: string
    dangerZone: string
    resetTitle: string
    resetDesc: string
    resetAreYouSure: string
    confirmDelete: string
    resetting: string
    cancel: string
    testConnection: string
    testing: string
    connectionOk: string
    connectionFail: string
    save: string
    saving: string
    configSaved: string
    saveError: string
    folderError: string
    resetDone: string
  }
  statusBar: {
    noCommit: string
    llmConnected: string
    llmNotConfigured: string
    file: string
    files: string
    idleSelecting: string
    idleExamining: string
    idleThinking: string
    idleInsight: string
    idleResting: string
    idle: string
    settings: string
  }
  centerPanel: {
    graph: string
    tags: string
    library: string
    disableIdle: string
    enableIdle: string
    idle: string
    newFile: string
    newShort: string
    searchPlaceholder: string
  }
  chat: {
    dropToAnalyze: string
    readOnly: string
    importMd: string
    placeholder: string
    sendTooltip: string
    commands: string
    citeFile: string
    importMdShort: string
    ctrlEnter: string
    copy: string
    pending: string
    inProgress: string
    applied: string
    rejected: string
    cancelled: string
    applyTooltip: string
    accept: string
    ignoreSuggestion: string
    dropMd: string
    dropMdHint: string
    writingResponse: string
    agentAnalyzing: string
    welcome: string
    welcomeHint: string
  }
  actionButtons: {
    accept: string
    reject: string
    applying: string
    cancel: string
    acceptAll: string
    rejectAll: string
    acceptSelected: (n: number, total: number) => string
    editTitle: string
    editType: string
  }

  actionPreview: {
    loading: string
    newFile: string
    modification: string
    newContent: string
    currentContent: string
    afterEdit: string
    emptyFile: string
  }
  actionCard: {
    pending: string
    inProgress: string
    applied: string
    rejected: string
    cancelled: string
    accept: string
    reject: string
    preview: string
  }
  activityFeed: {
    empty: string
    conflicts: string
    suggestions: string
    recentActions: string
  }
  fichePanel: {
    title: string
    empty: string
    briefHint: string
    ficheHintBefore: string
    ficheHintAfter: string
    ficheDeleted: (subject: string) => string
    openPreview: string
    clickAgain: string
    delete: string
  }
  insightPanel: {
    title: string
    accumulating: string
    draft: string
    drafts: string
    synthesizing: string
    activateIdle: string
    selecting: string
    examining: string
    analyzing: string
    insightFound: string
    resting: string
  }
  insightCard: {
    opportunity: string
    development: string
    hiddenConnection: string
    pattern: string
    contradiction: string
    gap: string
    cluster: string
    ignore: string
    explore: string
    saveAsFiche: string
    fiche: string
    saved: string
    savedToast: string
    saveError: string
    justNow: string
    minutesAgo: (n: number) => string
    hoursAgo: (n: number) => string
    daysAgo: (n: number) => string
    exploreMessage: (entities: string, content: string) => string
    entityJoin: string
  }
  filePreview: {
    libraryReadOnly: string
    rewrite: string
    delete: string
    deleteConfirm: string
    yes: string
    no: string
    edit: string
    saveShortcut: string
    saving: string
    save: string
    cancelShortcut: string
    cancel: string
    close: string
    unsavedWarning: string
    saved: string
    saveError: string
    rewritten: string
    rewriteError: string
    deleted: string
    deleteError: string
    titleUpdated: string
    titleError: string
    undone: string
    undoError: string
    loading: string
    placeholder: string
    loadError: string
    wikilinkNotFound: (name: string) => string
    graphTitleLabel: string
    graphTitleFromFrontmatter: string
    graphTitleFromH1: string
    graphTitleFromFilename: string
    titleUpdatedWithLinks: (n: number) => string
  }
  graph: {
    zoomIn: string
    zoomOut: string
    fitAll: string
    rewrite: string
    rewriting: string
    delete: string
    deleteForever: string
    libDocDeleted: string
    draftsInMemory: (n: number) => string
    loading: string
    empty: string
    emptyHint: string
    hint: string
    createFile: string
    openOriginal: string
    viewTranscription: string
    deleteFromLibrary: string
  }
  tags: {
    noTags: string
    noTagsHint: string
  }
  createFile: {
    title: string
    personne: string
    entreprise: string
    domaine: string
    projet: string
    journal: string
    note: string
    selectType: string
    cancel: string
    titleLabel: (type: string) => string
    titlePlaceholder: string
    back: string
    creating: string
    create: string
    created: (title: string) => string
    createError: string
  }
  library: {
    searchPlaceholder: string
    import: string
    reindex: string
    sidecarUnavailable: string
    degradedMode: string
    doc: string
    docs: string
    processing: string
    dropToImport: string
    noResults: string
    loading: string
    noDocuments: string
    dropHint: string
    copying: string
    extracting: string
    chunking: string
    embedding: string
    linking: string
    done: string
    error: string
    selectDocument: string
    open: string
    openWith: string
  }
  libraryItem: {
    error: string
    extracting: string
    embedding: string
    pending: string
    openOriginal: string
    delete: string
  }
  leftPanel: {
    conversation: string
  }
  rightPanel: {
    agentActivity: string
    collapse: string
  }
  appShell: {
    openAgentPanel: string
  }
}

const fr: T = {
  settings: {
    title: 'Configuration',
    language: 'Langue',
    langFr: 'Français',
    langEn: 'English',
    appearance: 'Apparence',
    dark: 'Sombre',
    light: 'Clair',
    knowledgeBasePath: 'Emplacement de la base de connaissances',
    pathPlaceholder: 'C:\\Users\\...\\CortX-Base',
    pathDescription: 'Dossier où seront stockés les fichiers Markdown, la base SQLite et le dépôt Git',
    browse: 'Parcourir',
    llmProvider: 'Fournisseur LLM',
    active: 'actif',
    anthropicDesc: 'API Anthropic — modèles Claude Sonnet, Opus, Haiku',
    localDesc: 'llama.cpp, Ollama, LM Studio, ou toute API compatible OpenAI',
    anthropicApiKey: 'Clé API Anthropic',
    serverUrl: 'URL du serveur',
    quickPresets: 'Presets rapides :',
    apiKeyOptional: 'Clé API',
    apiKeyLocalPlaceholder: 'Laisser vide pour les serveurs locaux',
    model: 'Modèle',
    anthropicModelsHint: 'claude-sonnet-4-20250514, claude-opus-4-20250514, claude-haiku-4-5-20251001',
    localModelHint: 'Nom du modèle chargé sur le serveur (ex: mistral, llama3, gemma3, qwen3)',
    dangerZone: 'Zone dangereuse',
    resetTitle: 'Réinitialiser la base de connaissances',
    resetDesc: 'Supprime tous les fichiers Markdown, l\'index SQLite et l\'historique Git. Cette action est irréversible.',
    resetAreYouSure: 'Êtes-vous certain ? Toutes les données seront perdues.',
    confirmDelete: 'Confirmer la suppression',
    resetting: 'Réinitialisation...',
    cancel: 'Annuler',
    testConnection: 'Tester la connexion',
    testing: 'Test en cours...',
    connectionOk: 'Connexion OK',
    connectionFail: 'Échec',
    save: 'Sauvegarder',
    saving: 'Sauvegarde...',
    configSaved: 'Configuration sauvegardée',
    saveError: 'Erreur lors de la sauvegarde',
    folderError: 'Erreur lors de la sélection du dossier',
    resetDone: 'Base de connaissances réinitialisée'
  },
  statusBar: {
    noCommit: 'Aucun commit',
    llmConnected: 'LLM connecté',
    llmNotConfigured: 'LLM non configuré',
    file: 'fichier',
    files: 'fichiers',
    idleSelecting: 'Idle · Sélection',
    idleExamining: 'Idle · Examen',
    idleThinking: 'Idle · Analyse...',
    idleInsight: 'Idle · Insight !',
    idleResting: 'Idle · Pause',
    idle: 'Idle',
    settings: 'Settings'
  },
  centerPanel: {
    graph: 'Graphe',
    tags: 'Tags',
    library: 'Bibliothèque',
    disableIdle: 'Désactiver le mode Idle',
    enableIdle: "Activer le mode Idle — l'agent médite sur le graphe",
    idle: 'Idle',
    newFile: 'Créer une nouvelle fiche',
    newShort: 'Nouveau',
    searchPlaceholder: 'Rechercher dans la base...'
  },
  chat: {
    dropToAnalyze: 'Déposer pour analyser et intégrer',
    readOnly: 'lecture seule',
    importMd: 'Importer un fichier .md dans la base',
    placeholder: 'Tape une info, pose une question, ou /commande... (@fichier pour citer)',
    sendTooltip: 'Envoyer (Ctrl+Enter)',
    commands: 'ask, brief, undo, status, digest',
    citeFile: 'citer un fichier',
    importMdShort: 'importer .md',
    ctrlEnter: 'Ctrl+Enter',
    copy: 'Copier',
    pending: 'en attente',
    inProgress: 'en cours...',
    applied: 'appliqué',
    rejected: 'refusé',
    cancelled: 'annulé',
    applyTooltip: "Demander à l'agent d'appliquer cette suggestion",
    accept: 'Accepter',
    ignoreSuggestion: 'Ignorer cette suggestion',
    dropMd: 'Déposer le fichier .md',
    dropMdHint: "L'agent va l'analyser et proposer son intégration",
    writingResponse: 'Rédaction de la réponse',
    agentAnalyzing: "L'agent analyse...",
    welcome: 'Bienvenue dans CortX',
    welcomeHint: 'Tape une info, pose une question, ou utilise une commande pour commencer.'
  },
  actionButtons: {
    accept: 'Accepter',
    reject: 'Refuser',
    applying: 'Application en cours...',
    cancel: 'Annuler',
    acceptAll: 'Tout valider',
    rejectAll: 'Tout refuser',
    acceptSelected: (n, total) => `Valider ${n < total ? `(${n}/${total})` : 'tout'}`,
    editTitle: 'Modifier le titre',
    editType: 'Type'
  },
  actionPreview: {
    loading: "Chargement de l'aperçu...",
    newFile: 'Nouveau fichier',
    modification: 'Modification',
    newContent: 'Nouveau contenu',
    currentContent: 'Contenu actuel',
    afterEdit: 'Après modification',
    emptyFile: '(fichier vide)'
  },
  actionCard: {
    pending: 'en attente',
    inProgress: 'en cours',
    applied: 'appliqué',
    rejected: 'refusé',
    cancelled: 'annulé',
    accept: 'Valider',
    reject: 'Refuser',
    preview: 'Aperçu'
  },
  activityFeed: {
    empty: "Les actions de l'agent apparaîtront ici.",
    conflicts: 'Conflits',
    suggestions: 'Suggestions',
    recentActions: 'Actions récentes'
  },
  fichePanel: {
    title: 'Fiches générées',
    empty: 'Aucune fiche pour le moment.',
    briefHint: '/brief sujet',
    ficheHintBefore: 'Tape ',
    ficheHintAfter: ' pour en générer une.',
    ficheDeleted: (subject) => `Fiche "${subject}" supprimée`,
    openPreview: "Ouvrir dans l'aperçu",
    clickAgain: 'Cliquer à nouveau pour confirmer',
    delete: 'Supprimer'
  },
  insightPanel: {
    title: 'Insights',
    accumulating: "L'agent accumule des intuitions en silence…",
    draft: 'brouillon',
    drafts: 'brouillons',
    synthesizing: 'en cours de synthèse',
    activateIdle: "Activez le mode Idle pour lancer l'exploration du graphe.",
    selecting: 'Sélection...',
    examining: 'Examen...',
    analyzing: 'Analyse...',
    insightFound: 'Insight trouvé !',
    resting: 'En pause...'
  },
  insightCard: {
    opportunity: 'Opportunité',
    development: 'À développer',
    hiddenConnection: 'Connexion cachée',
    pattern: 'Pattern',
    contradiction: 'Contradiction',
    gap: 'Lacune',
    cluster: 'Cluster',
    ignore: 'Ignorer',
    explore: 'Explorer',
    saveAsFiche: 'Sauvegarder en fiche',
    fiche: 'Fiche',
    saved: 'Sauvegardé',
    savedToast: 'Insight sauvegardé en fiche',
    saveError: 'Erreur lors de la sauvegarde',
    justNow: 'à l\'instant',
    minutesAgo: (n) => `il y a ${n}min`,
    hoursAgo: (n) => `il y a ${n}h`,
    daysAgo: (n) => `il y a ${n}j`,
    exploreMessage: (entities, content) => `Peux-tu développer cet insight concernant ${entities} : "${content}"`,
    entityJoin: ' et '
  },
  filePreview: {
    libraryReadOnly: 'Fichier de la bibliothèque (lecture seule)',
    rewrite: 'Reprendre la rédaction (réorganise sans perdre d\'information)',
    delete: 'Supprimer ce fichier',
    deleteConfirm: 'Supprimer ?',
    yes: 'Oui',
    no: 'Non',
    edit: 'Modifier ce fichier',
    saveShortcut: 'Enregistrer (Ctrl+S)',
    saving: 'Sauvegarde...',
    save: 'Enregistrer',
    cancelShortcut: 'Annuler (Échap)',
    cancel: 'Annuler',
    close: 'Fermer',
    unsavedWarning: 'Enregistre ou annule avant de fermer',
    saved: 'Fichier enregistré',
    saveError: "Erreur lors de l'enregistrement",
    rewritten: 'Rédaction réorganisée',
    rewriteError: 'Erreur lors de la réorganisation',
    deleted: 'Fichier supprimé',
    deleteError: 'Erreur lors de la suppression',
    titleUpdated: 'Titre mis à jour',
    titleError: 'Erreur lors de la mise à jour du titre',
    undone: 'Annulé',
    undoError: "Erreur lors de l'annulation",
    loading: 'Chargement...',
    placeholder: 'Contenu Markdown...',
    loadError: 'Impossible de charger le fichier.',
    wikilinkNotFound: (name) => `Fichier "${name}" introuvable`,
    graphTitleLabel: 'Titre graphe',
    graphTitleFromFrontmatter: 'frontmatter',
    graphTitleFromH1: 'titre H1',
    graphTitleFromFilename: 'nom du fichier',
    titleUpdatedWithLinks: (n) => n > 0 ? `Titre mis à jour · ${n} lien${n > 1 ? 's' : ''} mis à jour` : 'Titre mis à jour'
  },
  graph: {
    zoomIn: 'Zoom +',
    zoomOut: 'Zoom -',
    fitAll: 'Tout afficher',
    rewrite: 'Reprendre la rédaction',
    rewriting: 'Réorganisation...',
    delete: 'Supprimer',
    deleteForever: 'Supprimer définitivement ?',
    libDocDeleted: 'Document supprimé de la bibliothèque',
    draftsInMemory: (n) => `${n} brouillon${n > 1 ? 's' : ''} en mémoire`,
    loading: 'Chargement du graphe...',
    empty: 'Graphe vide',
    emptyHint: 'Commence par capturer des informations via la conversation.',
    hint: 'Clic = sélectionner · Double-clic = ouvrir · Clic droit = menu · Glisser = déplacer',
    createFile: 'Créer un nouveau fichier',
    openOriginal: 'Ouvrir le fichier original',
    viewTranscription: 'Voir la transcription Markdown',
    deleteFromLibrary: 'Supprimer de la bibliothèque'
  },
  tags: {
    noTags: 'Aucun tag',
    noTagsHint: 'Les tags apparaîtront ici au fur et à mesure que tu enrichis ta base de connaissances.'
  },
  createFile: {
    title: 'Créer une nouvelle fiche',
    personne: 'Personne',
    entreprise: 'Entreprise',
    domaine: 'Domaine',
    projet: 'Projet',
    journal: 'Journal',
    note: 'Note',
    selectType: 'Quel type d\'entité voulez-vous créer ?',
    cancel: 'Annuler',
    titleLabel: (type) => `Titre de la nouvelle ${type}`,
    titlePlaceholder: 'Entrez un titre...',
    back: 'Retour',
    creating: 'Création...',
    create: 'Créer',
    created: (title) => `Fiche créée : ${title}`,
    createError: 'Erreur lors de la création de la fiche'
  },
  library: {
    searchPlaceholder: 'Rechercher dans la bibliothèque…',
    import: 'Importer',
    reindex: 'Réindexer tous les documents',
    sidecarUnavailable: 'Le sidecar Python n\'est pas disponible. Seuls les .md/.txt peuvent être importés.',
    degradedMode: 'Mode dégradé',
    doc: 'doc',
    docs: 'docs',
    processing: 'En cours',
    dropToImport: 'Déposer pour importer',
    noResults: 'Aucun résultat',
    loading: 'Chargement…',
    noDocuments: 'Aucun document',
    dropHint: 'Glissez des fichiers ici ou cliquez sur Importer',
    copying: 'copie…',
    extracting: 'extraction…',
    chunking: 'découpage…',
    embedding: 'embeddings…',
    linking: 'liens…',
    done: 'terminé',
    error: 'erreur',
    selectDocument: 'Sélectionnez un document',
    open: 'Ouvrir',
    openWith: 'Ouvrir avec le logiciel système'
  },
  libraryItem: {
    error: 'erreur',
    extracting: 'extraction…',
    embedding: 'embeddings…',
    pending: 'en attente…',
    openOriginal: "Ouvrir l'original",
    delete: 'Supprimer'
  },
  leftPanel: {
    conversation: 'Conversation'
  },
  rightPanel: {
    agentActivity: 'Activité Agent',
    collapse: 'Replier le panneau'
  },
  appShell: {
    openAgentPanel: 'Ouvrir le panneau agent'
  }
}

const en: T = {
  settings: {
    title: 'Configuration',
    language: 'Language',
    langFr: 'Français',
    langEn: 'English',
    appearance: 'Appearance',
    dark: 'Dark',
    light: 'Light',
    knowledgeBasePath: 'Knowledge base location',
    pathPlaceholder: 'C:\\Users\\...\\CortX-Base',
    pathDescription: 'Folder where Markdown files, the SQLite database and the Git repository will be stored',
    browse: 'Browse',
    llmProvider: 'LLM Provider',
    active: 'active',
    anthropicDesc: 'Anthropic API — Claude Sonnet, Opus, Haiku models',
    localDesc: 'llama.cpp, Ollama, LM Studio, or any OpenAI-compatible API',
    anthropicApiKey: 'Anthropic API Key',
    serverUrl: 'Server URL',
    quickPresets: 'Quick presets:',
    apiKeyOptional: 'API Key',
    apiKeyLocalPlaceholder: 'Leave empty for local servers',
    model: 'Model',
    anthropicModelsHint: 'claude-sonnet-4-20250514, claude-opus-4-20250514, claude-haiku-4-5-20251001',
    localModelHint: 'Name of the model loaded on the server (e.g. mistral, llama3, gemma3, qwen3)',
    dangerZone: 'Danger zone',
    resetTitle: 'Reset knowledge base',
    resetDesc: 'Deletes all Markdown files, the SQLite index and Git history. This action is irreversible.',
    resetAreYouSure: 'Are you sure? All data will be lost.',
    confirmDelete: 'Confirm deletion',
    resetting: 'Resetting...',
    cancel: 'Cancel',
    testConnection: 'Test connection',
    testing: 'Testing...',
    connectionOk: 'Connection OK',
    connectionFail: 'Failed',
    save: 'Save',
    saving: 'Saving...',
    configSaved: 'Configuration saved',
    saveError: 'Error saving configuration',
    folderError: 'Error selecting folder',
    resetDone: 'Knowledge base reset'
  },
  statusBar: {
    noCommit: 'No commit',
    llmConnected: 'LLM connected',
    llmNotConfigured: 'LLM not configured',
    file: 'file',
    files: 'files',
    idleSelecting: 'Idle · Selecting',
    idleExamining: 'Idle · Examining',
    idleThinking: 'Idle · Thinking...',
    idleInsight: 'Idle · Insight!',
    idleResting: 'Idle · Resting',
    idle: 'Idle',
    settings: 'Settings'
  },
  centerPanel: {
    graph: 'Graph',
    tags: 'Tags',
    library: 'Library',
    disableIdle: 'Disable Idle mode',
    enableIdle: 'Enable Idle mode — agent meditates on the graph',
    idle: 'Idle',
    newFile: 'Create a new card',
    newShort: 'New',
    searchPlaceholder: 'Search the base...'
  },
  chat: {
    dropToAnalyze: 'Drop to analyze and integrate',
    readOnly: 'read only',
    importMd: 'Import a .md file into the base',
    placeholder: 'Type info, ask a question, or /command... (@file to cite)',
    sendTooltip: 'Send (Ctrl+Enter)',
    commands: 'ask, brief, undo, status, digest',
    citeFile: 'cite a file',
    importMdShort: 'import .md',
    ctrlEnter: 'Ctrl+Enter',
    copy: 'Copy',
    pending: 'pending',
    inProgress: 'processing...',
    applied: 'applied',
    rejected: 'rejected',
    cancelled: 'cancelled',
    applyTooltip: 'Ask the agent to apply this suggestion',
    accept: 'Accept',
    ignoreSuggestion: 'Ignore this suggestion',
    dropMd: 'Drop the .md file',
    dropMdHint: 'The agent will analyze it and propose its integration',
    writingResponse: 'Writing response',
    agentAnalyzing: 'Agent analyzing...',
    welcome: 'Welcome to CortX',
    welcomeHint: 'Type info, ask a question, or use a command to get started.'
  },
  actionButtons: {
    accept: 'Accept',
    reject: 'Reject',
    applying: 'Applying...',
    cancel: 'Cancel',
    acceptAll: 'Accept all',
    rejectAll: 'Reject all',
    acceptSelected: (n, total) => `Accept ${n < total ? `(${n}/${total})` : 'all'}`,
    editTitle: 'Edit title',
    editType: 'Type'
  },
  actionPreview: {
    loading: 'Loading preview...',
    newFile: 'New file',
    modification: 'Modification',
    newContent: 'New content',
    currentContent: 'Current content',
    afterEdit: 'After edit',
    emptyFile: '(empty file)'
  },
  actionCard: {
    pending: 'pending',
    inProgress: 'processing',
    applied: 'applied',
    rejected: 'rejected',
    cancelled: 'cancelled',
    accept: 'Accept',
    reject: 'Reject',
    preview: 'Preview'
  },
  activityFeed: {
    empty: 'Agent actions will appear here.',
    conflicts: 'Conflicts',
    suggestions: 'Suggestions',
    recentActions: 'Recent actions'
  },
  fichePanel: {
    title: 'Generated cards',
    empty: 'No cards yet.',
    briefHint: '/brief subject',
    ficheHintBefore: 'Type ',
    ficheHintAfter: ' to generate one.',
    ficheDeleted: (subject) => `Card "${subject}" deleted`,
    openPreview: 'Open in preview',
    clickAgain: 'Click again to confirm',
    delete: 'Delete'
  },
  insightPanel: {
    title: 'Insights',
    accumulating: 'Agent quietly accumulating insights…',
    draft: 'draft',
    drafts: 'drafts',
    synthesizing: 'being synthesized',
    activateIdle: 'Enable Idle mode to start graph exploration.',
    selecting: 'Selecting...',
    examining: 'Examining...',
    analyzing: 'Analyzing...',
    insightFound: 'Insight found!',
    resting: 'Resting...'
  },
  insightCard: {
    opportunity: 'Opportunity',
    development: 'To develop',
    hiddenConnection: 'Hidden connection',
    pattern: 'Pattern',
    contradiction: 'Contradiction',
    gap: 'Gap',
    cluster: 'Cluster',
    ignore: 'Ignore',
    explore: 'Explore',
    saveAsFiche: 'Save as card',
    fiche: 'Card',
    saved: 'Saved',
    savedToast: 'Insight saved as card',
    saveError: 'Error saving insight',
    justNow: 'just now',
    minutesAgo: (n) => `${n}min ago`,
    hoursAgo: (n) => `${n}h ago`,
    daysAgo: (n) => `${n}d ago`,
    exploreMessage: (entities, content) => `Can you expand on this insight about ${entities}: "${content}"`,
    entityJoin: ' and '
  },
  filePreview: {
    libraryReadOnly: 'Library file (read only)',
    rewrite: 'Rewrite (reorganizes without losing information)',
    delete: 'Delete this file',
    deleteConfirm: 'Delete?',
    yes: 'Yes',
    no: 'No',
    edit: 'Edit this file',
    saveShortcut: 'Save (Ctrl+S)',
    saving: 'Saving...',
    save: 'Save',
    cancelShortcut: 'Cancel (Esc)',
    cancel: 'Cancel',
    close: 'Close',
    unsavedWarning: 'Save or cancel before closing',
    saved: 'File saved',
    saveError: 'Error saving file',
    rewritten: 'Content reorganized',
    rewriteError: 'Error reorganizing content',
    deleted: 'File deleted',
    deleteError: 'Error deleting file',
    titleUpdated: 'Title updated',
    titleError: 'Error updating title',
    undone: 'Undone',
    undoError: 'Error undoing change',
    loading: 'Loading...',
    placeholder: 'Markdown content...',
    loadError: 'Cannot load file.',
    wikilinkNotFound: (name) => `File "${name}" not found`,
    graphTitleLabel: 'Graph title',
    graphTitleFromFrontmatter: 'frontmatter',
    graphTitleFromH1: 'H1 heading',
    graphTitleFromFilename: 'filename',
    titleUpdatedWithLinks: (n) => n > 0 ? `Title updated · ${n} link${n > 1 ? 's' : ''} updated` : 'Title updated'
  },
  graph: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fitAll: 'Fit all',
    rewrite: 'Rewrite',
    rewriting: 'Reorganizing...',
    delete: 'Delete',
    deleteForever: 'Delete permanently?',
    libDocDeleted: 'Document removed from library',
    draftsInMemory: (n) => `${n} draft${n > 1 ? 's' : ''} in memory`,
    loading: 'Loading graph...',
    empty: 'Empty graph',
    emptyHint: 'Start by capturing information through the conversation.',
    hint: 'Click = select · Double-click = open · Right-click = menu · Drag = move',
    createFile: 'Create new file',
    openOriginal: 'Open original file',
    viewTranscription: 'View Markdown transcription',
    deleteFromLibrary: 'Remove from library'
  },
  tags: {
    noTags: 'No tags',
    noTagsHint: 'Tags will appear here as you enrich your knowledge base.'
  },
  createFile: {
    title: 'Create a new card',
    personne: 'Person',
    entreprise: 'Company',
    domaine: 'Domain',
    projet: 'Project',
    journal: 'Journal',
    note: 'Note',
    selectType: 'What type of entity do you want to create?',
    cancel: 'Cancel',
    titleLabel: (type) => `Title of the new ${type}`,
    titlePlaceholder: 'Enter a title...',
    back: 'Back',
    creating: 'Creating...',
    create: 'Create',
    created: (title) => `Card created: ${title}`,
    createError: 'Error creating card'
  },
  library: {
    searchPlaceholder: 'Search the library…',
    import: 'Import',
    reindex: 'Reindex all documents',
    sidecarUnavailable: 'Python sidecar not available. Only .md/.txt files can be imported.',
    degradedMode: 'Degraded mode',
    doc: 'doc',
    docs: 'docs',
    processing: 'Processing',
    dropToImport: 'Drop to import',
    noResults: 'No results',
    loading: 'Loading…',
    noDocuments: 'No documents',
    dropHint: 'Drag files here or click Import',
    copying: 'copying…',
    extracting: 'extracting…',
    chunking: 'chunking…',
    embedding: 'embedding…',
    linking: 'linking…',
    done: 'done',
    error: 'error',
    selectDocument: 'Select a document',
    open: 'Open',
    openWith: 'Open with system application'
  },
  libraryItem: {
    error: 'error',
    extracting: 'extracting…',
    embedding: 'embedding…',
    pending: 'pending…',
    openOriginal: 'Open original',
    delete: 'Delete'
  },
  leftPanel: {
    conversation: 'Conversation'
  },
  rightPanel: {
    agentActivity: 'Agent Activity',
    collapse: 'Collapse panel'
  },
  appShell: {
    openAgentPanel: 'Open agent panel'
  }
}

export const translations: Record<Language, T> = { fr, en }
