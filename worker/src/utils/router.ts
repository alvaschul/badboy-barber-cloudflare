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
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withParams = escaped.replace(/\\:([A-Za-z0-9_]+)/g, '([^/]+)');
    return new RegExp(`^${withParams}$`);
  }

  private extractParams(path: string, match: RegExpMatchArray): Record<string, string> {
    const params: Record<string, string> = {};
    const names = Array.from(path.matchAll(/:([A-Za-z0-9_]+)/g), m => m[1]);
    names.forEach((name, index) => {
      params[name] = match[index + 1] ?? '';
    });
    return params;
  }

  use(prefix: string, routes?: Router) {
    if (!routes) return;

    routes.routes.forEach(r => {
      const fullPath = `${prefix}${r.path}`;
      this.routes.push({
        method: r.method,
        path: fullPath,
        pattern: this.compilePattern(fullPath),
        handler: r.handler
      });
    });
  }

  get(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response) {
    this.routes.push({ method: 'GET', path, pattern: this.compilePattern(path), handler });
  }

  post(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response) {
    this.routes.push({ method: 'POST', path, pattern: this.compilePattern(path), handler });
  }

  patch(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response) {
    this.routes.push({ method: 'PATCH', path, pattern: this.compilePattern(path), handler });
  }

  delete(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response) {
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
