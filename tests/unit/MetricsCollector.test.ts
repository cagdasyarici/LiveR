import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../../src/core/MetricsCollector.js';

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  describe('counters', () => {
    it('should start at zero', () => {
      const snap = metrics.getSnapshot();
      expect(snap.messagesReceived).toBe(0);
      expect(snap.messagesSent).toBe(0);
      expect(snap.connectionsOpened).toBe(0);
      expect(snap.connectionsClosed).toBe(0);
      expect(snap.errors).toBe(0);
      expect(snap.rateLimitHits).toBe(0);
    });

    it('should increment messages received', () => {
      metrics.incrementMessagesReceived();
      metrics.incrementMessagesReceived();
      expect(metrics.getSnapshot().messagesReceived).toBe(2);
    });

    it('should increment messages sent by count', () => {
      metrics.incrementMessagesSent(5);
      metrics.incrementMessagesSent(3);
      expect(metrics.getSnapshot().messagesSent).toBe(8);
    });

    it('should increment messages sent by 1 by default', () => {
      metrics.incrementMessagesSent();
      expect(metrics.getSnapshot().messagesSent).toBe(1);
    });

    it('should increment connections opened', () => {
      metrics.incrementConnectionsOpened();
      metrics.incrementConnectionsOpened();
      metrics.incrementConnectionsOpened();
      expect(metrics.getSnapshot().connectionsOpened).toBe(3);
    });

    it('should increment connections closed', () => {
      metrics.incrementConnectionsClosed();
      expect(metrics.getSnapshot().connectionsClosed).toBe(1);
    });

    it('should increment errors', () => {
      metrics.incrementErrors();
      metrics.incrementErrors();
      expect(metrics.getSnapshot().errors).toBe(2);
    });

    it('should increment rate limit hits', () => {
      metrics.incrementRateLimitHits();
      expect(metrics.getSnapshot().rateLimitHits).toBe(1);
    });
  });

  describe('uptime', () => {
    it('should track uptime in seconds', () => {
      const snap = metrics.getSnapshot();
      expect(snap.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('toPrometheus', () => {
    it('should output valid Prometheus text format', () => {
      metrics.incrementConnectionsOpened();
      metrics.incrementConnectionsOpened();
      metrics.incrementMessagesReceived();
      metrics.incrementMessagesSent(10);
      metrics.incrementErrors();

      const output = metrics.toPrometheus(2, 5);

      expect(output).toContain('liverelay_connections_active 2');
      expect(output).toContain('liverelay_rooms_active 5');
      expect(output).toContain('liverelay_connections_opened_total 2');
      expect(output).toContain('liverelay_messages_received_total 1');
      expect(output).toContain('liverelay_messages_sent_total 10');
      expect(output).toContain('liverelay_errors_total 1');
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should include uptime', () => {
      const output = metrics.toPrometheus(0, 0);
      expect(output).toContain('liverelay_uptime_seconds');
    });

    it('should end with newline', () => {
      const output = metrics.toPrometheus(0, 0);
      expect(output.endsWith('\n')).toBe(true);
    });
  });
});
