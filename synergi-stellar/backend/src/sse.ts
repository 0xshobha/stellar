import type { Response } from 'express';
import { logDebug, logInfo } from './lib/logger.js';

interface SSEClient {
  id: string;
  response: Response;
}

class SSEHub {
  private clients = new Map<string, SSEClient>();

  addClient(id: string, response: Response): void {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    response.write(`data: ${JSON.stringify({ type: 'connected', sessionId: id })}\n\n`);
    this.clients.set(id, { id, response });
    logInfo('SSE client connected', {
      sessionId: id,
      activeClients: this.clients.size
    });
  }

  emit(id: string, type: string, data: Record<string, unknown>): void {
    const client = this.clients.get(id);
    if (!client) return;
    const payload = JSON.stringify({ type, ...data, at: new Date().toISOString() });
    client.response.write(`data: ${payload}\n\n`);
    logDebug('SSE event emitted', {
      sessionId: id,
      type
    });
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (!client) return;
    client.response.end();
    this.clients.delete(id);
    logInfo('SSE client disconnected', {
      sessionId: id,
      activeClients: this.clients.size
    });
  }
}

export const sseHub = new SSEHub();
