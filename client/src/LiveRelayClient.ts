/**
 * LiveRelay Client SDK
 * Browser & Node.js compatible WebSocket client with auto-reconnection.
 */

export interface LiveRelayConfig {
  url: string;
  token: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

type EventHandler = (data: unknown, message: ServerMessage) => void;

export class LiveRelayClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly eventHandlers = new Map<string, Set<EventHandler>>();
  private readonly onceHandlers = new Map<string, Set<EventHandler>>();
  private connected = false;

  private readonly config: Required<LiveRelayConfig>;

  constructor(config: LiveRelayConfig) {
    this.config = {
      url: config.url,
      token: config.token,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      reconnectDelay: config.reconnectDelay ?? 1000,
    };
  }

  // --- Connection ---

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const separator = this.config.url.includes('?') ? '&' : '?';
      const wsUrl = `${this.config.url}${separator}token=${this.config.token}`;

      this.ws = new WebSocket(wsUrl);

      const onOpen = (): void => {
        this.connected = true;
        this.reconnectAttempts = 0;
        cleanup();
      };

      const onMessage = (event: MessageEvent): void => {
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : '') as ServerMessage;

          if (msg.type === 'welcome') {
            this.emit('connected', msg);
            resolve();
          }

          this.handleServerMessage(msg);
        } catch {
          // Ignore parse errors during handshake
        }
      };

      const onError = (err: Event): void => {
        cleanup();
        reject(err);
      };

      const onClose = (): void => {
        cleanup();
        reject(new Error('Connection closed before welcome'));
      };

      const cleanup = (): void => {
        if (this.ws) {
          this.ws.removeEventListener('open', onOpen);
          this.ws.removeEventListener('error', onError);
          this.ws.removeEventListener('close', onClose);
          // Keep message handler for ongoing communication
          this.ws.removeEventListener('message', onMessage);
          this.setupMessageHandler();
          this.setupCloseHandler();
        }
      };

      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('message', onMessage);
      this.ws.addEventListener('error', onError);
      this.ws.addEventListener('close', onClose);
    });
  }

  disconnect(): void {
    this.config.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  // --- Rooms ---

  subscribe(room: string): void {
    this.send({ type: 'subscribe', room });
  }

  unsubscribe(room: string): void {
    this.send({ type: 'unsubscribe', room });
  }

  // --- Messaging ---

  publish(room: string, event: string, data: unknown): void {
    this.send({ type: 'publish', room, event, data });
  }

  // --- Events ---

  on(event: string, handler: EventHandler): void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  once(event: string, handler: EventHandler): void {
    let handlers = this.onceHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.onceHandlers.set(event, handlers);
    }
    handlers.add(handler);
  }

  // --- Internals ---

  private send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private setupMessageHandler(): void {
    if (!this.ws) return;

    this.ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof event.data === 'string' ? event.data : '') as ServerMessage;
        this.handleServerMessage(msg);
      } catch {
        // Ignore parse errors
      }
    });
  }

  private setupCloseHandler(): void {
    if (!this.ws) return;

    this.ws.addEventListener('close', (event: CloseEvent) => {
      this.connected = false;
      this.emit('disconnected', { code: event.code, reason: event.reason });

      if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.attemptReconnect();
      }
    });
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome':
        this.emit('welcome', msg);
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'ping':
        // Server ping — respond with ping (which server treats as pong)
        this.send({ type: 'ping' });
        break;

      case 'subscribed':
        this.emit('subscribed', msg);
        break;

      case 'unsubscribed':
        this.emit('unsubscribed', msg);
        break;

      case 'message':
        this.emit('message', msg);
        // Also emit by event name for convenience
        if (typeof msg.event === 'string') {
          this.emit(msg.event, msg.data, msg);
        }
        break;

      case 'error':
        this.emit('error', msg);
        break;

      case 'system':
        this.emit('system', msg);
        break;

      default:
        this.emit(msg.type, msg);
    }
  }

  private emit(event: string, data: unknown = null, msg?: ServerMessage): void {
    const message = msg ?? (data as ServerMessage);

    // Regular handlers
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data, message);
        } catch {
          // Don't let handler errors break the client
        }
      }
    }

    // Once handlers
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        try {
          handler(data, message);
        } catch {
          // Don't let handler errors break the client
        }
      }
      this.onceHandlers.delete(event);
    }
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    const cappedDelay = Math.min(delay, 30000);

    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
      delay: cappedDelay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect failed, will be retried by close handler
      });
    }, cappedDelay);
  }
}
