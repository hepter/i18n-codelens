#!/usr/bin/env node
/**
 * MCP server entry point for the i18n CodeLens VS Code extension.
 * Delegates entirely to the i18n-codelens-mcp npm package so that
 * the server logic lives in one place and can be published independently.
 */

// Calling startServer starts the MCP stdio server.
import { startServer } from 'i18n-codelens-mcp';

startServer().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  try {
    process.stderr.write(`[i18n-codelens MCP] fatal: ${message}\n`);
  } catch {
    // ignore stderr failures
  }
  process.exitCode = 1;
});
