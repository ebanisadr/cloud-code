import * as fs from 'fs';
import * as path from 'path';

export interface SessionState {
  id: string;
  issueNumber: number;
  prNumber: number;
  branchName: string;
  model: string;
  maxContext: number;
  status: 'starting' | 'active' | 'waiting' | 'done' | 'error' | 'compacted';
  turnCount: number;
  contextUsage: {
    used: number;
    available: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SessionConfig {
  model: string;
  maxContext: number;
  dangerouslySkipPermissions: boolean;
}

const CLOUD_CODE_DIR = '.cloud-code';

export function cloudCodeDir(): string {
  return CLOUD_CODE_DIR;
}

export function sessionJsonPath(): string {
  return path.join(CLOUD_CODE_DIR, 'session.json');
}

export function configJsonPath(): string {
  return path.join(CLOUD_CODE_DIR, 'config.json');
}

export function promptMdPath(): string {
  return path.join(CLOUD_CODE_DIR, 'prompt.md');
}

export function turnsDir(): string {
  return path.join(CLOUD_CODE_DIR, 'turns');
}

export function initCloudCodeDir(
  issueNumber: number,
  branchName: string,
  model: string,
  maxContext: number,
  renderedPrompt: string,
  config: SessionConfig
): SessionState {
  fs.mkdirSync(turnsDir(), { recursive: true });

  const session: SessionState = {
    id: '',
    issueNumber,
    prNumber: 0,
    branchName,
    model,
    maxContext,
    status: 'starting',
    turnCount: 0,
    contextUsage: { used: 0, available: maxContext },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(sessionJsonPath(), JSON.stringify(session, null, 2));
  fs.writeFileSync(promptMdPath(), renderedPrompt);
  fs.writeFileSync(configJsonPath(), JSON.stringify(config, null, 2));

  return session;
}

export function readSession(): SessionState {
  const raw = fs.readFileSync(sessionJsonPath(), 'utf-8');
  return JSON.parse(raw) as SessionState;
}

export function writeSession(session: SessionState): void {
  session.updatedAt = new Date().toISOString();
  fs.writeFileSync(sessionJsonPath(), JSON.stringify(session, null, 2));
}

export function updateSessionAfterTurn(
  session: SessionState,
  sessionId: string,
  contextUsed: number,
  isDone: boolean,
  isError: boolean
): SessionState {
  session.id = sessionId || session.id;
  session.turnCount += 2; // human + assistant
  session.contextUsage.used = contextUsed;
  session.updatedAt = new Date().toISOString();

  if (isError) {
    session.status = 'error';
  } else if (isDone) {
    session.status = 'done';
  } else {
    session.status = 'waiting';
  }

  writeSession(session);
  return session;
}

export function sessionBackupPath(): string {
  return path.join(CLOUD_CODE_DIR, 'claude-session.tar.gz');
}
