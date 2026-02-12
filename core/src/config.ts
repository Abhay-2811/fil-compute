/**
 * Resolve nodeid to base URL for Core → Node calls.
 * v0: env NODES = JSON object e.g. {"node-001":"http://localhost:4000"}
 * Or with payout for EVM: {"node-001":{"url":"http://...","payout_address":"0x..."}}
 */
const NODES_JSON = process.env.NODES ?? "{}";
type NodeEntry = string | { url: string; payout_address?: string };
let nodeRegistry: Record<string, NodeEntry> = {};

try {
  nodeRegistry = JSON.parse(NODES_JSON) as Record<string, NodeEntry>;
} catch {
  nodeRegistry = { "node-001": "http://localhost:4000" };
}

export function getNodeBaseUrl(nodeid: string): string | null {
  const entry = nodeRegistry[nodeid];
  if (!entry) return null;
  const url = typeof entry === "string" ? entry : entry.url;
  return url && url.length > 0 ? url : null;
}

/** Node payout address for EVM escrow. From NODES (payout_address) or env NODE_PAYOUT_ADDRESSES. */
const NODE_PAYOUT_JSON = process.env.NODE_PAYOUT_ADDRESSES ?? "{}";
let nodePayoutRegistry: Record<string, string> = {};
try {
  nodePayoutRegistry = JSON.parse(NODE_PAYOUT_JSON) as Record<string, string>;
} catch {
  // ignore
}

export function getNodePayoutAddress(nodeid: string): string | null {
  const entry = nodeRegistry[nodeid];
  if (entry && typeof entry === "object" && entry.payout_address) {
    return entry.payout_address;
  }
  const addr = nodePayoutRegistry[nodeid];
  return addr && addr.length > 0 ? addr : null;
}
