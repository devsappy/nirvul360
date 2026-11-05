import { getApiBaseUrl } from './api';

type EventCallback = (event: { type: string; payload?: any; [key: string]: any }) => void;

class RealtimeClient {
  private es: EventSource | null = null;
  private listeners: Set<EventCallback> = new Set();
  private statusListeners: Set<(status: 'connected' | 'connecting' | 'offline') => void> = new Set();
  private reconnectTimeout: any = null;
  public status: 'connected' | 'connecting' | 'offline' = 'offline';

  public connect() {
    if (typeof window === 'undefined') return;
    if (this.es) {
      this.es.close();
      this.es = null;
    }

    this.setStatus('connecting');
    const base = getApiBaseUrl();
    const url = `${base}/api/events`;

    try {
      this.es = new EventSource(url, { withCredentials: true });

      this.es.onopen = () => {
        this.setStatus('connected');
      };

      this.es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          this.listeners.forEach((cb) => {
            try { cb(data); } catch (e) { console.error('Error in SSE callback:', e); }
          });
        } catch {
          // Heartbeat or ping
        }
      };

      this.es.onerror = () => {
        this.setStatus('offline');
        if (this.es) {
          this.es.close();
          this.es = null;
        }
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
          this.connect();
        }, 3000);
      };
    } catch {
      this.setStatus('offline');
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
        this.connect();
      }, 5000);
    }
  }

  public disconnect() {
    clearTimeout(this.reconnectTimeout);
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.setStatus('offline');
  }

  public subscribe(cb: EventCallback) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public onStatusChange(cb: (status: 'connected' | 'connecting' | 'offline') => void) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private setStatus(status: 'connected' | 'connecting' | 'offline') {
    this.status = status;
    this.statusListeners.forEach((cb) => {
      try { cb(status); } catch {}
    });
  }
}

export const realtime = new RealtimeClient();
