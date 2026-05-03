import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { logger } from './lib/logger';

const PORT = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3001;
const ALLOWED_ORIGIN = process.env['ALLOWED_ORIGIN'] ?? 'http://localhost:3000';

const httpServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'dorado-socket' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGIN, credentials: true },
});

// TODO Sprint 1: reemplazar con authenticateHandshake(socket, next)
// que verifique JWT, extraiga tenant_id y role, y los asigne a socket.data
io.use((_socket, next) => {
  next();
});

io.on('connection', (socket) => {
  logger.info({ event: 'socket_connected', socketId: socket.id });

  socket.on('disconnect', () => {
    logger.info({ event: 'socket_disconnected', socketId: socket.id });
  });
});

httpServer.listen(PORT, () => {
  logger.info({ event: 'server_started', port: PORT, allowedOrigin: ALLOWED_ORIGIN });
});
