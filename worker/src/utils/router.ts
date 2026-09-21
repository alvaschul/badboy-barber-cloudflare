export interface Context {
  params: Record<string, string>;
  env: any;
}

export class Router {
  private routes: Array<{
    method: string;
    path: string;
    pattern: RegExp;
    handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response;
  }> = [];

  private compilePattern(path: string): RegExp {
    // Normalize multiple slashes
    let normalized = path.replace(/\/+/g, '/');
    // Escape regex special characters manually
    let escaped = '';
    for (let i = 0; i < normalized.length; i++) {
      const c = normalized[i];
      if (c === '.' || c === '*' || c === '+' || c === '?' || c === '^' ||
          c === '$' || c === '{' || c === '}' || c === '(' || c === ')' ||
          c === '|' || c === '[' || c === ']' || c === '\\') {
        escaped += '\\' + c;
      } else {
        escaped += c;
      }
    }
    // Replace :param with capture group - find : and replace with ([^/]+)
    // First escape the colon in escaped string
    const escapedColon = escaped.replace(/:/g, '\\:');
    // Now replace \: with capture group
    const withParams = escapedColon.replace(/\\:([A-Za-z0-9_]+)/g, '([^/]+)');
    return new RegExp('^' + withParams + '$');
  }

  private extractParams(path: string, match: RegExpMatchArray): Record<string, string> {
    const params: Record<string, string> = {};
    const names = Array.from(path.matchAll(/:([A-Za-z0-9_]+)/g), m => m[1]);
    names.forEach((name, index) => {
      params[name] = match[index + 1] ?? '';
    });
    return params;
  }

  use(prefix: string, routes?: Router): void {
    if (!routes) return;
    const base = prefix.replace(/\/+$/, '');
    routes.routes.forEach(r => {
      let routePath = r.path;
      if (routePath === '/') routePath = '';
      const fullPath = routePath ? base + '/' + routePath : base;
      this.routes.push({
        method: r.method,
        path: fullPath,
        pattern: this.compilePattern(fullPath),
        handler: r.handler
      });
    });
  }

  get(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response): void {
    this.routes.push({ method: 'GET', path, pattern: this.compilePattern(path), handler });
  }

  post(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response): void {
    this.routes.push({ method: 'POST', path, pattern: this.compilePattern(path), handler });
  }

  patch(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response): void {
    this.routes.push({ method: 'PATCH', path, pattern: this.compilePattern(path), handler });
  }

  delete(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response): void {
    this.routes.push({ method: 'DELETE', path, pattern: this.compilePattern(path), handler });
  }

  async handle(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    for (const route of this.routes) {
      const match = path.match(route.pattern);
      if (match && method === route.method) {
        const params = this.extractParams(route.path, match);
        try {
          return await route.handler(request, env, { params, env });
        } catch (e) {
          console.error('Handler error:', e);
          return new Response(JSON.stringify({ detail: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    return new Response(JSON.stringify({ detail: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
