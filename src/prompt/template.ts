export interface TemplateVars {
  issue: {
    number: number;
    title: string;
    body: string;
    labels: string;
    author: string;
  };
  repo: {
    name: string;
    full_name: string;
  };
  comment: {
    body: string;
  };
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
    const value = resolvePath(vars, path);
    return value !== undefined ? String(value) : '';
  });
}

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
