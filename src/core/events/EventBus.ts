import { VsTurboEvents } from './eventTypes';
import { IEventBus } from '../interfaces/IEventBus';

type EventCallback<T> = (data: T) => void;

type AnyEventCallback = (data: any) => void;

export class EventBus implements IEventBus {
  private static instance: EventBus | null = null;
  private listeners: Map<string, Set<AnyEventCallback>> = new Map();

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public on<K extends keyof VsTurboEvents>(
    event: K,
    callback: EventCallback<VsTurboEvents[K]>
  ): () => void {
    const key = event as string;
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(callback as AnyEventCallback);

    return () => {
      this.off(event, callback);
    };
  }

  public off<K extends keyof VsTurboEvents>(
    event: K,
    callback: EventCallback<VsTurboEvents[K]>
  ): void {
    const set = this.listeners.get(event as string);
    if (set) {
      set.delete(callback as AnyEventCallback);
    }
  }

  public emit<K extends keyof VsTurboEvents>(event: K, data: VsTurboEvents[K]): void {
    const set = this.listeners.get(event as string);
    if (set) {
      for (const callback of set) {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error handling event "${String(event)}":`, err);
        }
      }
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const eventBus = EventBus.getInstance();
