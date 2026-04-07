import { ipcMain } from 'electron'
import type { GitService } from '../services/GitService'

export function registerGitHandlers(getGit: () => GitService): void {
  ipcMain.handle('git:commit', (_event, message: string) => getGit().commitAll(message))
  ipcMain.handle('git:revert', (_event, hash: string) => getGit().revert(hash))
  ipcMain.handle('git:log', (_event, count?: number) => getGit().log(count))
  ipcMain.handle('git:status', () => getGit().status())
}
