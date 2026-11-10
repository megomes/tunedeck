import { NextResponse } from "next/server";
import { callTool, SERVER_INSTRUCTIONS, TOOLS } from "@/lib/server/connector";
import { checkConnectorToken } from "@/lib/server/feed";

// MCP server (Streamable HTTP, stateless, JSON responses) for Claude's custom connectors.
// The secret token in the path is the only credential, like the AI agent feed.

export const maxDuration = 60;

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

interface Rpc {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(msg: Rpc, origin: string) {
  const { id, method, params = {} } = msg;
  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "tunedeck", title: "TuneDeck", version: "1.0.0" },
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = String(params.name ?? "");
      try {
        const data = await callTool(name, (params.arguments ?? {}) as Record<string, unknown>, origin);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (err) {
        // Tool errors go back to the model as results it can read and fix.
        return ok(id, { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true });
      }
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/mcp/[token]">) {
  const { token } = await ctx.params;
  if (!(await checkConnectorToken(token))) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400, headers });
  }
  const origin = new URL(req.url).origin;
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as Rpc[];
  // Notifications and responses (no method or no id) get no reply.
  const replies = await Promise.all(msgs.filter((m) => m.method && m.id !== undefined).map((m) => handle(m, origin)));
  if (!replies.length) return new NextResponse(null, { status: 202, headers });
  return NextResponse.json(batch ? replies : replies[0], { headers });
}

/** No server-initiated stream: this server only answers requests. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { ...headers, Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { ...headers, Allow: "POST" } });
}
