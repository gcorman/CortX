// ============================================================
// Shared KB directory constants — single source of truth.
// Import from here; never hard-code directory names elsewhere.
// ============================================================

/** Top-level directories that make up the knowledge-base structure. */
export const BASE_DIRS = [
  'Reseau',
  'Entreprises',
  'Domaines',
  'Projets',
  'Journal',
  'Fiches',
  '_Templates',
  '_System',
] as const

/** All user-facing routable directories (excludes system/template dirs). */
export const KNOWN_DIRS: string[] = [
  'Reseau',
  'Entreprises',
  'Domaines',
  'Projets',
  'Journal',
  'Fiches',
]

/**
 * Maps entity types (from frontmatter `type:` field) to their canonical
 * KB directory. Used by both FileService and AgentPipeline.
 */
export const TYPE_TO_DIR: Record<string, string> = {
  personne:   'Reseau',
  entreprise: 'Entreprises',
  domaine:    'Domaines',
  projet:     'Projets',
  journal:    'Journal',
  note:       'Journal',
  fiche:      'Fiches',
}

/**
 * Maps every accent / casing / language variant that an LLM might emit for a
 * directory name back to its canonical form.  Keeps ghost directories from
 * being created when the model hallucinates "Réseau/" instead of "Reseau/".
 */
export const DIR_ALIASES: Record<string, string> = {
  // Reseau
  reseau:    'Reseau',
  réseau:    'Reseau',
  network:   'Reseau',
  people:    'Reseau',
  persons:   'Reseau',
  contacts:  'Reseau',

  // Entreprises
  entreprises:   'Entreprises',
  entreprise:    'Entreprises',
  companies:     'Entreprises',
  company:       'Entreprises',
  organisations: 'Entreprises',
  organizations: 'Entreprises',

  // Domaines
  domaines: 'Domaines',
  domaine:  'Domaines',
  domains:  'Domaines',
  domain:   'Domaines',
  topics:   'Domaines',
  subjects: 'Domaines',

  // Projets
  projets:  'Projets',
  projet:   'Projets',
  projects: 'Projets',
  project:  'Projets',

  // Journal
  journal: 'Journal',
  daily:   'Journal',
  logs:    'Journal',
  log:     'Journal',
  notes:   'Journal',

  // Fiches
  fiches:   'Fiches',
  fiche:    'Fiches',
  briefs:   'Fiches',
  brief:    'Fiches',
  insights: 'Fiches',
}
