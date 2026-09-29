/** MSW-style fake fetch: routes requests to recorded GURS fixtures by URL predicate. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const fixture = (name: string) => readFileSync(resolve(process.cwd(), "src/gurs/__fixtures__", name), "utf8");

export type Route = [match: (u: URL) => boolean, body: string | (() => Response)];

export function fakeFetch(routes: Route[]) {
  const calls: URL[] = [];
  const fn = async (input: RequestInfo | URL): Promise<Response> => {
    const u = new URL(String(input));
    calls.push(u);
    for (const [m, b] of routes) {
      if (m(u)) {
        if (typeof b === "function") return b();
        const xml = b.trimStart().startsWith("<");
        return new Response(b, { status: 200, headers: { "content-type": xml ? "text/xml" : "application/json" } });
      }
    }
    return new Response("not routed: " + u, { status: 404 });
  };
  return Object.assign(fn as typeof fetch, { calls });
}

export const q = (u: URL, k: string) => u.searchParams.get(k) ?? "";
export const typeIs = (t: string) => (u: URL) => q(u, "typeNames") === t;
