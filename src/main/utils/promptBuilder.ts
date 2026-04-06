import * as fs from 'fs'
import * as path from 'path'
import { DatabaseService } from '../services/DatabaseService'
import { FileService } from '../services/FileService'

// Extract the raw prompt template from the CortX_Agent_Prompt_V1.md file
// The prompt is between the first ``` and the last ``` in the "Prompt complet" section
function loadPromptTemplate(basePath: string): string {
  // Look for prompt file in various locations
  const locations = [
    path.join(basePath, '..', 'prompts', 'agent_v1.txt'),
    path.join(basePath, '..', 'CortX_Agent_Prompt_V1.md'),
    path.join(__dirname, '..', '..', '..', 'prompts', 'agent_v1.txt'),
    path.join(__dirname, '..', '..', '..', 'CortX_Agent_Prompt_V1.md')
  ]

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      const raw = fs.readFileSync(loc, 'utf-8')

      // If it's the .md file, extract the prompt between ``` markers
      if (loc.endsWith('.md')) {
        const match = raw.match(/## Prompt complet\s*\n\s*```\n([\s\S]*?)```/)
        if (match) return match[1]
      }

      return raw
    }
  }

  // Fallback: embedded minimal prompt
  return getMinimalPrompt()
}

function getMinimalPrompt(): string {
  return `Tu es l'agent de CortX, un systeme de gestion de connaissances personnelles.

Ton role : l'utilisateur te parle en langage naturel. Tu analyses ce qu'il dit, tu decides quels fichiers Markdown creer ou modifier dans sa base de connaissances, et tu retournes un plan d'actions structure en JSON.

ETAT ACTUEL DE LA BASE
======================
Arborescence :
{{tree}}

Nombre de fichiers : {{file_count}}
Derniere modification : {{last_modified}}

Entites connues :
{{entities_summary}}

Tags les plus utilises : {{top_tags}}

FICHIERS PERTINENTS POUR CET INPUT
===================================
{{context_files}}

REGLES :
1. Detecte le type d'input : capture / question / commande / reflexion
2. Pour "capture" : extrais les entites, modifie/cree des fichiers
3. Pour "question" : ne modifie RIEN, reponds avec les sources
4. Pour "reflexion" : propose des actions sans les executer
5. Ne cree JAMAIS de doublon
6. Ajoute des wikilinks [[Nom]] entre entites
7. Signale les contradictions sans les resoudre
8. Reponds UNIQUEMENT en JSON valide

FORMAT DE REPONSE :
Pour capture/commande : { "input_type": "capture", "actions": [...], "summary": "...", "conflicts": [], "ambiguities": [], "suggestions": [] }
Pour question : { "input_type": "question", "actions": [], "response": "...", "sources": [...], "suggestions": [] }
Pour reflexion : { "input_type": "reflexion", "actions": [], "response": "...", "proposed_actions": [...], "suggestions": [] }

Actions possibles : "create" (file + content complet) ou "modify" (file + section + operation + content)

La date du jour est : {{today}}
L'heure actuelle est : {{now}}`
}

export function buildSystemPrompt(
  dbService: DatabaseService,
  fileService: FileService,
  contextFiles: string,
  basePath: string
): string {
  const template = loadPromptTemplate(basePath)

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  const variables: Record<string, string> = {
    '{{tree}}': fileService.getTree(),
    '{{file_count}}': String(dbService.getFileCount()),
    '{{last_modified}}': dbService.getLastModified(),
    '{{entities_summary}}': dbService.getEntitySummary(),
    '{{top_tags}}': dbService.getTopTags(),
    '{{context_files}}': contextFiles,
    '{{today}}': today,
    '{{now}}': time
  }

  let prompt = template
  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.replaceAll(key, value)
  }

  return prompt
}
