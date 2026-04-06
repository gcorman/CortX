import { ipcMain } from 'electron'
import type { GitService } from '../services/GitService'

export function registerGitHandlers(git: GitService): void {
  ipcMain.handle('git:commit', (_event, message: string) => git.commitAll(message))
  ipcMain.handle('git:revert', (_event, hash: string) => git.revert(hash))
  ipcMain.handle('git:log', (_event, count?: number) => git.log(count))
  ipcMain.handle('git:status', () => git.status())
}
