const API_PREFIXES = ["/cases", "/fields", "/status"];

/** The API path a request is for, or undefined when it is not an API call (other origin, sample file, asset). */
export function apiPath(url: string, origin: string, base: string): string | undefined {
  const u = new URL(url, origin);
  if (u.origin !== origin) return undefined;
  const root = base.replace(/\/$/, "");
  const path = root && u.pathname.startsWith(root) ? u.pathname.slice(root.length) || "/" : u.pathname;
  return API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ? path + u.search : undefined;
}

/** Wraps fetch so API calls are answered by `handle` inside the page; anything else goes to the network. */
export function interceptFetch(
  realFetch: typeof fetch,
  handle: (request: Request) => Promise<Response>,
  origin: string,
  base: string,
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(String(input), origin), init);
    const path = apiPath(request.url, origin, base);
    if (path === undefined) return realFetch(input, init);
    return handle(new Request(new URL(path, origin), request));
  };
}
