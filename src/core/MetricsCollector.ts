export class MetricsCollector {
  private messagesReceived = 0;
  private messagesSent = 0;
  private connectionsOpened = 0;
  private connectionsClosed = 0;
  private errors = 0;
  private rateLimitHits = 0;

  private readonly startedAt = Date.now();

  // Counters
  incrementMessagesReceived(): void {
    this.messagesReceived++;
  }

  incrementMessagesSent(count: number = 1): void {
    this.messagesSent += count;
  }

  incrementConnectionsOpened(): void {
    this.connectionsOpened++;
  }

  incrementConnectionsClosed(): void {
    this.connectionsClosed++;
  }

  incrementErrors(): void {
    this.errors++;
  }

  incrementRateLimitHits(): void {
    this.rateLimitHits++;
  }

  // Snapshot for internal use
  getSnapshot(): MetricsSnapshot {
    return {
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      connectionsOpened: this.connectionsOpened,
      connectionsClosed: this.connectionsClosed,
      errors: this.errors,
      rateLimitHits: this.rateLimitHits,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  /**
   * Prometheus text format output.
   * activeConnections and activeRooms must be passed in since they are gauge values
   * tracked by ConnectionManager and RoomManager.
   */
  toPrometheus(activeConnections: number, activeRooms: number): string {
    const lines: string[] = [];

    const gauge = (name: string, help: string, value: number): void => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    };

    const counter = (name: string, help: string, value: number): void => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    };

    gauge('liverelay_connections_active', 'Current active WebSocket connections', activeConnections);
    gauge('liverelay_rooms_active', 'Current active rooms', activeRooms);
    gauge('liverelay_uptime_seconds', 'Server uptime in seconds', Math.floor((Date.now() - this.startedAt) / 1000));

    counter('liverelay_connections_opened_total', 'Total WebSocket connections opened', this.connectionsOpened);
    counter('liverelay_connections_closed_total', 'Total WebSocket connections closed', this.connectionsClosed);
    counter('liverelay_messages_received_total', 'Total messages received from clients', this.messagesReceived);
    counter('liverelay_messages_sent_total', 'Total messages sent to clients', this.messagesSent);
    counter('liverelay_errors_total', 'Total errors', this.errors);
    counter('liverelay_rate_limit_hits_total', 'Total rate limit hits', this.rateLimitHits);

    return lines.join('\n') + '\n';
  }
}

export interface MetricsSnapshot {
  messagesReceived: number;
  messagesSent: number;
  connectionsOpened: number;
  connectionsClosed: number;
  errors: number;
  rateLimitHits: number;
  uptimeSeconds: number;
}
