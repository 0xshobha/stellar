import type { Response } from 'express';

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
  }

  emit(id: string, type: string, data: Record<string, unknown>): void {
    const client = this.clients.get(id);
    if (!client) return;
    const payload = JSON.stringify({ type, ...data, at: new Date().toISOString() });
    client.response.write(`data: ${payload}\n\n`);
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (!client) return;
    client.response.end();
    this.clients.delete(id);
  }
}

export const sseHub = new SSEHub();
