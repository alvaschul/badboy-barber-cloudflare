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
    let s = path;
    while (s.includes('//')) s = s.replace('//', '/');
    
    // Replace :param with capture group FIRST
    let withParams = s.replace(/:([A-Za-z0-9_]+)/g, '([^/]+)');
    
    // Escape only the truly dangerous regex characters
    // NOT: ( ) [ ] ^ + - (these are standard regex syntax we might use)
    let escaped = '';
    for (let i = 0; i < withParams.length; i++) {
      const c = withParams[i];
      if (c === '.' || c === '*' || c === '?' || c === '|' || c === '\\') {
        escaped += '\\' + c;
      } else {
        escaped += c;
      }
    }
    
    return new RegExp('^' + escaped + '$');
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
    let base = prefix;
    while (base.endsWith('/')) base = base.slice(0, -1);
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
