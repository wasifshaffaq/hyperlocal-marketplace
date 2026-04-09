import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import http from 'http';

interface WSPayload { type: 'LOCATION_UPDATE' | 'STATUS_UPDATE' | 'SUBSCRIBE'; orderId: string; status?: string; lat?: number; lng?: number; }

const orderChannels = new Map<string, Set<WebSocket>>();

export const initializeTrackingSockets = (server: http.Server, jwtSecret: string) => {
    const wss = new WebSocketServer({ server, path: '/ws/tracking' });

    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (!token) { ws.close(1008, 'Token required'); return; }

        try {
            const user = jwt.verify(token, jwtSecret) as { id: string, role: string };
            let currentOrderId: string | null = null;

            ws.on('message', (message: string) => {
                const data: WSPayload = JSON.parse(message);
                if (data.type === 'SUBSCRIBE') {
                    currentOrderId = data.orderId;
                    if (!orderChannels.has(data.orderId)) orderChannels.set(data.orderId, new Set());
                    orderChannels.get(data.orderId)!.add(ws);
                    return;
                }
                if (data.type === 'LOCATION_UPDATE' && user.role === 'DELIVERY_AGENT') {
                    broadcastToOrder(data.orderId, data, ws);
                }
            });

            ws.on('close', () => {
                if (currentOrderId && orderChannels.has(currentOrderId)) {
                    orderChannels.get(currentOrderId)!.delete(ws);
                    if (orderChannels.get(currentOrderId)!.size === 0) orderChannels.delete(currentOrderId);
                }
            });
        } catch (err) {
            ws.close(1008, 'Invalid or expired token');
        }
    });
};

const broadcastToOrder = (orderId: string, payload: WSPayload, excludeWs?: WebSocket) => {
    const channel = orderChannels.get(orderId);
    if (channel) {
        const message = JSON.stringify(payload);
        for (const client of channel) {
            if (client !== excludeWs && client.readyState === WebSocket.OPEN) client.send(message);
        }
    }
};