// IndexedDB queue para pedidos QR que fallan por red caída.
// Usa el mismo idempotencyKey del pedido, por lo que el reintento
// es idempotente en el backend aunque el servidor ya lo recibió.

const DB_NAME = 'dorado-offline';
const DB_VERSION = 1;
const STORE = 'pedidos_pendientes';

export interface QueuedOrder {
  id: string; // = idempotencyKey del pedido
  input: {
    token: string;
    items: Array<{ recetaId: string; cantidad: number; notas?: string }>;
    notas?: string;
    idempotencyKey: string;
  };
  createdAt: string;
  attempts: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOrder(
  order: Omit<QueuedOrder, 'attempts' | 'createdAt'>,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      ...order,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedOrders(): Promise<QueuedOrder[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as QueuedOrder[]);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedOrder(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function incrementAttempts(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const order = req.result as QueuedOrder | undefined;
      if (order) store.put({ ...order, attempts: order.attempts + 1 });
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueueSize(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}
