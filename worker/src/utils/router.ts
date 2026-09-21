export interface Context {
  params: Record<string, string>;
  env: any;
}

export class Router {
  private routes: Array<{
    method: string;
    pattern: RegExp;
    handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response;
  }> = [];

  use(_prefix: string, routes?: Router) {
    if (routes) {
      routes.routes.forEach(r => {
        this.routes.push(r);
      });
    }
  }

  get(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response) {
    this.routes.push({ method: 'GET', pattern: new RegExp(`^${path}$`), handler });
  }

  post(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response) {
    this.routes.push({ method: 'POST', pattern: new RegExp(`^${path}$`), handler });
  }

  patch(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response) {
    this.routes.push({ method: 'PATCH', pattern: new RegExp(`^${path}$`), handler });
  }

  delete(path: string, handler: (req: Request, env: any, ctx: Context) => Promise<Response> | Response) {
    this.routes.push({ method: 'DELETE', pattern: new RegExp(`^${path}$`), handler });
  }

  async handle(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    for (const route of this.routes) {
      const match = path.match(route.pattern);
      if (match && method === route.method) {
        const params: Record<string, string> = {};
        const regex = /:([^\/]+)/g;
        let match2;
        while ((match2 = regex.exec(route.pattern.source)) !== null) {
          params[match2[1]] = match[parseInt(match2[1]) + 1] || '';
        }
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
