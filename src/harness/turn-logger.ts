import * as fs from 'fs';
import * as path from 'path';
import { turnsDir } from './session';
import { ToolCall } from '../utils/format-comment';

function turnFileName(turnNumber: number, role: 'human' | 'assistant'): string {
  const padded = String(turnNumber).padStart(3, '0');
  return `${padded}-${role}.md`;
}

function toolsFileName(turnNumber: number): string {
  const padded = String(turnNumber).padStart(3, '0');
  return `${padded}-tools.json`;
}

export function writeTurn(
  turnNumber: number,
  role: 'human' | 'assistant',
  content: string,
  toolCalls?: ToolCall[]
): void {
  const dir = turnsDir();
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, turnFileName(turnNumber, role));
  fs.writeFileSync(filePath, content);

  if (role === 'assistant' && toolCalls && toolCalls.length > 0) {
    const toolsPath = path.join(dir, toolsFileName(turnNumber));
    fs.writeFileSync(toolsPath, JSON.stringify(toolCalls, null, 2));
  }
}

export function getNextTurnNumber(): number {
  const dir = turnsDir();
  if (!fs.existsSync(dir)) return 1;

  const files = fs.readdirSync(dir);
  let maxTurn = 0;
  for (const file of files) {
    const match = file.match(/^(\d+)-/);
    if (match) {
      maxTurn = Math.max(maxTurn, parseInt(match[1], 10));
    }
  }
  return maxTurn + 1;
}

export function readAllTurns(): Array<{ turnNumber: number; role: string; content: string }> {
  const dir = turnsDir();
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  const turns: Array<{ turnNumber: number; role: string; content: string }> = [];

  for (const file of files) {
    const match = file.match(/^(\d+)-(human|assistant)\.md$/);
    if (match) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      turns.push({
        turnNumber: parseInt(match[1], 10),
        role: match[2],
        content,
      });
    }
  }

  return turns;
}

export function buildSessionLog(): string {
  const turns = readAllTurns();
  const lines: string[] = [];

  for (const turn of turns) {
    const roleLabel = turn.role === 'human' ? 'Human' : 'Assistant';
    lines.push(`### Turn ${turn.turnNumber} (${roleLabel})`);
    lines.push('');
    lines.push(turn.content);
    lines.push('');
  }

  return lines.join('\n');
}
