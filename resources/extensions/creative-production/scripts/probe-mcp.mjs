import { fileURLToPath } from "node:url";
import path from "node:path";

export const MCP_SERVER_NAME = "creative_production_mcp";

export const REQUIRED_MCP_TOOLS = [
  "append_moodboard_board_items",
  "get_moodboard_board_page",
  "get_moodboard_board_status",
  "render_moodboard_board_widget",
];

export const CURRENT_MCP_TOOLS = [
  ...REQUIRED_MCP_TOOLS,
  "render_shot_intake_widget",
  "render_style_intake_widget",
];

export function pluginRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function mcpServerPath(root = pluginRoot()) {
  return path.join(root, "mcp", "server.bundle.mjs");
}

export async function probeMcpTools({
  expectedTools = REQUIRED_MCP_TOOLS,
  root = pluginRoot(),
} = {}) {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/client/stdio.js"),
  ]);

  const transport = new StdioClientTransport({
    command: "node",
    args: [mcpServerPath(root)],
    cwd: root,
  });
  const client = new Client({
    name: "creative-production-mcp-probe",
    version: "0.0.0",
  });

  try {
    await client.connect(transport);
    const response = await client.listTools();
    const toolNames = response.tools.map((tool) => tool.name).sort();
    const missing = expectedTools.filter((toolName) => !toolNames.includes(toolName));
    if (missing.length) {
      throw new Error(`Missing ${MCP_SERVER_NAME} tool(s): ${missing.join(", ")}`);
    }
    return toolNames;
  } finally {
    await client.close().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const toolNames = await probeMcpTools({ expectedTools: REQUIRED_MCP_TOOLS });
  console.log(toolNames.join("\n"));
}
