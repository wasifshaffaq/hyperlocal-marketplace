import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/orders' });
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-production-key';

app.use(express.json());

const sendResponse = (res: Response, statusCode: number, data: any = null, error: string | null = null) => {
    res.status(statusCode).json({ success: statusCode >= 200 && statusCode < 300, data, error });
};

const authLimiter = rateLimit({
    windowMs: 60 * 1000, max: 5,
    message: { success: false, data: null, error: 'Too many requests, please try again later.' }
});

interface AuthRequest extends Request { user?: { id: string; role: string }; }

const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return sendResponse(res, 401, null, 'Access Token Required');
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return sendResponse(res, 403, null, 'Invalid or Expired Token');
        req.user = user;
        next();
    });
};

const requireRole = (allowedRoles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return sendResponse(res, 403, null, 'Permission Denied: Insufficient Role');
        }
        next();
    };
};

app.post('/api/auth/login', authLimiter, (req, res) => {
    const { email, password } = req.body;
    if (email === 'owner@shop.com' && password === 'password') {
        const token = jwt.sign({ id: 'uuid-123', role: 'SHOP_OWNER' }, JWT_SECRET, { expiresIn: '15m' });
        const refreshToken = jwt.sign({ id: 'uuid-123' }, JWT_SECRET, { expiresIn: '7d' });
        return sendResponse(res, 200, { token, refreshToken, role: 'SHOP_OWNER' });
    }
    sendResponse(res, 401, null, 'Invalid credentials');
});

// Placeholder routes
app.get('/api/shops', authenticateToken, requireRole(['CUSTOMER', 'ADMIN']), (req, res) => {
    sendResponse(res, 200, [{ id: 'shop-1', name: 'Joe\'s Pizza', distance: '1.2km', open: true }]);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`API + WS Server running on port ${PORT}`));