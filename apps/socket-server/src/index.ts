import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { logger } from './lib/logger';
import { authenticateHandshake, canJoinChannel } from './lib/auth';
import { createEmitHandler } from './lib/emit-handler';
import type { SocketData } from './lib/auth';

const PORT = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3001;
const ALLOWED_ORIGIN = process.env['ALLOWED_ORIGIN'] ?? 'http://localhost:3000';

const httpServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'dorado-socket' }));
    return;
  }
  // POST /emit — usado por Server Actions para broadcast tras persistir en DB
  if (req.method === 'POST' && req.url === '/emit') {
    emitHandler(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGIN, credentials: true },
});

const emitHandler = createEmitHandler(io);

// Middleware: verifica JWT en el handshake, extrae userId/tenantId/role a socket.data
io.use(authenticateHandshake);

io.on('connection', (socket) => {
  const { userId, tenantId, role } = socket.data as SocketData;

  logger.info({ event: 'socket_connected', socketId: socket.id, userId, tenantId, role });

  // join: el cliente solicita unirse a un canal
  socket.on('join', (channel: string) => {
    if (!canJoinChannel(socket, channel)) {
      logger.warn({
        event: 'channel_acl_violation',
        socketId: socket.id,
        userId,
        channel,
        role,
      });
      socket.emit('error', { code: 'FORBIDDEN', channel });
      socket.disconnect(true);
      return;
    }

    // Aislar por tenant: cada socket solo ve rooms de su propio tenant
    const tenantRoom = `${tenantId}:${channel}`;
    void socket.join(tenantRoom);
    logger.info({ event: 'channel_joined', socketId: socket.id, userId, channel: tenantRoom });
  });

  // leave: el cliente abandona un canal voluntariamente
  socket.on('leave', (channel: string) => {
    const tenantRoom = `${tenantId}:${channel}`;
    void socket.leave(tenantRoom);
    logger.info({ event: 'channel_left', socketId: socket.id, channel: tenantRoom });
  });

  socket.on('disconnect', (reason) => {
    logger.info({ event: 'socket_disconnected', socketId: socket.id, userId, reason });
  });
});

httpServer.listen(PORT, () => {
  logger.info({ event: 'server_started', port: PORT, allowedOrigin: ALLOWED_ORIGIN });
});
