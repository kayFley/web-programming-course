import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type ServerTodo = {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

type QueueAction =
  | { id: string; type: 'create'; ts: number; title: string }
  | { id: string; type: 'toggle'; ts: number; todoId: number; done: boolean }
  | { id: string; type: 'delete'; ts: number; todoId: number };

type LocalTodo = ServerTodo & { pending?: true };

const QUEUE_KEY = 'todo-pwa-queue';
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function loadQueue(): QueueAction[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueueAction[];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueAction[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function toLocalText(value: string) {
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ru-RU');
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function apiFetchTodos(): Promise<ServerTodo[]> {
  const response = await fetch(`${API_BASE_URL}/api/todos`);
  const data = await parseJson<{ items: ServerTodo[] }>(response);
  return data.items;
}

async function apiCreate(title: string): Promise<ServerTodo> {
  const response = await fetch(`${API_BASE_URL}/api/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return parseJson<ServerTodo>(response);
}

async function apiToggle(todoId: number, done: boolean): Promise<ServerTodo> {
  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done }),
  });
  return parseJson<ServerTodo>(response);
}

async function apiDelete(todoId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('SW registration failed:', err);
    });
  }
}

export default function App() {
  const [serverTodos, setServerTodos] = useState<ServerTodo[]>([]);
  const [pendingTodos, setPendingTodos] = useState<LocalTodo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [queue, setQueue] = useState<QueueAction[]>(loadQueue);
  const syncingRef = useRef(false);

  const persistQueue = useCallback((q: QueueAction[]) => {
    setQueue(q);
    saveQueue(q);
  }, []);

  const refreshFromServer = useCallback(async () => {
    const todos = await apiFetchTodos();
    setServerTodos(todos);
  }, []);

  const syncQueue = useCallback(async (currentQueue: QueueAction[]) => {
    if (syncingRef.current || currentQueue.length === 0) return;
    syncingRef.current = true;

    let remaining = [...currentQueue];

    for (const action of currentQueue) {
      try {
        if (action.type === 'create') {
          await apiCreate(action.title);
        } else if (action.type === 'toggle') {
          await apiToggle(action.todoId, action.done);
        } else if (action.type === 'delete') {
          await apiDelete(action.todoId);
        }
        remaining = remaining.filter((a) => a.id !== action.id);
        saveQueue(remaining);
      } catch {
        break;
      }
    }

    setQueue(remaining);
    setPendingTodos([]);

    try {
      const todos = await apiFetchTodos();
      setServerTodos(todos);
    } catch {}

    syncingRef.current = false;

    if (remaining.length === 0) {
      setMessage('Синхронизация завершена.');
    } else {
      setMessage(`Синхронизировано частично. В очереди: ${remaining.length}`);
    }
  }, []);

  const onCreate = useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;

      try {
        await apiCreate(trimmed);
        await refreshFromServer();
        setMessage('Задача добавлена.');
      } catch {
        const action: QueueAction = {
          id: crypto.randomUUID(),
          type: 'create',
          ts: Date.now(),
          title: trimmed,
        };
        persistQueue([...queue, action]);

        const tempTodo: LocalTodo = {
          id: -Date.now(),
          title: trimmed,
          done: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pending: true,
        };
        setPendingTodos((prev) => [tempTodo, ...prev]);
        setMessage('Офлайн: задача добавлена в очередь.');
      }
    },
    [queue, refreshFromServer, persistQueue]
  );

  const onToggle = useCallback(
    async (todo: ServerTodo) => {
      try {
        await apiToggle(todo.id, !todo.done);
        await refreshFromServer();
        setMessage('Статус обновлен.');
      } catch {
        const action: QueueAction = {
          id: crypto.randomUUID(),
          type: 'toggle',
          ts: Date.now(),
          todoId: todo.id,
          done: !todo.done,
        };
        persistQueue([...queue, action]);
        setServerTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
        setMessage('Офлайн: изменение сохранено в очередь.');
      }
    },
    [queue, refreshFromServer, persistQueue]
  );

  const onDelete = useCallback(
    async (todo: ServerTodo) => {
      try {
        await apiDelete(todo.id);
        await refreshFromServer();
        setMessage('Задача удалена.');
      } catch {
        const action: QueueAction = {
          id: crypto.randomUUID(),
          type: 'delete',
          ts: Date.now(),
          todoId: todo.id,
        };
        persistQueue([...queue, action]);
        setServerTodos((prev) => prev.filter((t) => t.id !== todo.id));
        setMessage('Офлайн: удаление сохранено в очередь.');
      }
    },
    [queue, refreshFromServer, persistQueue]
  );

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = inputValue;
      setInputValue('');
      await onCreate(value);
    },
    [inputValue, onCreate]
  );

  const onSyncNow = useCallback(() => {
    void syncQueue(queue);
  }, [queue, syncQueue]);

  useEffect(() => {
    registerServiceWorker();

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const todos = await apiFetchTodos();
        if (!cancelled) setServerTodos(todos);
      } catch {
        if (!cancelled) {
          setMessage('Не удалось загрузить данные. Проверьте, что backend запущен.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setMessage('Соединение восстановлено. Синхронизация...');
      void syncQueue(loadQueue());
    };
    const handleOffline = () => {
      setIsOnline(false);
      setMessage('Нет соединения. Действия сохраняются локально.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncQueue]);

  const allTodos: LocalTodo[] = [...pendingTodos, ...serverTodos];

  return (
    <main className="app">
      <header className="header">
        <h1>Todo-сы</h1>
        <span className={`badge ${isOnline ? 'online' : 'offline'}`}>{isOnline ? 'online' : 'offline'}</span>
      </header>

      <form className="toolbar" onSubmit={onSubmit}>
        <input
          type="text"
          maxLength={200}
          placeholder="Новая задача"
          required
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
        />
        <button type="submit">Добавить</button>
        <button type="button" onClick={onSyncNow} disabled={queue.length === 0 || !isOnline}>
          Синхронизировать ({queue.length})
        </button>
      </form>

      <section className="meta">
        <span className="badge">Офлайн-очередь: {queue.length}</span>
        <span className={`badge ${isOnline ? 'online' : 'offline'}`}>
          {isOnline ? 'sync: готово' : 'sync: ожидание'}
        </span>
      </section>

      {message ? <div className="message">{message}</div> : null}
      {isLoading ? <p>Загрузка...</p> : null}
      {!isLoading && allTodos.length === 0 ? <div className="empty">Пока нет задач</div> : null}

      <ul className="list">
        {allTodos.map((todo) => (
          <li className="item" key={todo.id} style={todo.pending ? { opacity: 0.6, borderStyle: 'dashed' } : undefined}>
            <button
              type="button"
              onClick={() => !todo.pending && void onToggle(todo)}
              disabled={!!todo.pending}
            >
              {todo.done ? '✅' : '⬜'}
            </button>
            <div>
              <div className={todo.done ? 'done' : ''}>{todo.title}</div>
              <div className="hint">
                {todo.pending ? '⏳ Ожидает синхронизации' : `Сервер · ${toLocalText(todo.updatedAt)}`}
              </div>
            </div>
            {!todo.pending && (
              <button type="button" onClick={() => void onDelete(todo)}>
                Удалить
              </button>
            )}
            <span className="hint">#{todo.pending ? 'pending' : todo.id}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
