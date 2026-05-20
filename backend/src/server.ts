import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { dbPool } from './db';
import { processCheckout } from './services/checkout_service';
import { initializeTrackingSockets, broadcastToOrder } from './services/websocket_tracking';
import { notificationService } from './services/notification_service';

const app = express();
const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-production-key';

// CORS Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

const sendResponse = (res: Response, statusCode: number, data: any = null, error: string | null = null) => {
    res.status(statusCode).json({ success: statusCode >= 200 && statusCode < 300, data, error });
};

const authLimiter = rateLimit({
    windowMs: 60 * 1000, max: 15,
    message: { success: false, data: null, error: 'Too many requests, please try again later.' }
});

interface AuthRequest extends Request { user?: { id: string; role: string }; }

const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return sendResponse(res, 401, null, 'Access Token Required');
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return sendResponse(res, 403, null, 'Invalid or Expired Token');
        req.user = user as { id: string; role: string };
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

// -------------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------
app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { email, password, role, phone } = req.body;
    if (!email || !password) return sendResponse(res, 400, null, 'Email and password are required');
    
    try {
        // Check if user already exists
        const checkUser = await dbPool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (checkUser.rows.length > 0) return sendResponse(res, 400, null, 'User with this email already exists');

        const passwordHash = await bcrypt.hash(password, 10);
        const newUserRes = await dbPool.query(
            'INSERT INTO users (email, password_hash, role, phone) VALUES ($1, $2, $3, $4) RETURNING id',
            [email, passwordHash, role || 'CUSTOMER', phone || '']
        );

        const token = jwt.sign({ id: newUserRes.rows[0].id, role: role || 'CUSTOMER' }, JWT_SECRET, { expiresIn: '1d' });
        sendResponse(res, 201, { token, role: role || 'CUSTOMER', id: newUserRes.rows[0].id });
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return sendResponse(res, 400, null, 'Email and password are required');

    try {
        const userQuery = await dbPool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userQuery.rows.length === 0) return sendResponse(res, 401, null, 'Invalid credentials');

        const user = userQuery.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return sendResponse(res, 401, null, 'Invalid credentials');

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        sendResponse(res, 200, { token, role: user.role, id: user.id });
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

// -------------------------------------------------------------
// USER ADDRESS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/addresses', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const addresses = await dbPool.query('SELECT * FROM addresses WHERE user_id = $1', [req.user!.id]);
        sendResponse(res, 200, addresses.rows);
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

app.post('/api/addresses', authenticateToken, async (req: AuthRequest, res) => {
    const { label, lat, lng, fullAddress } = req.body;
    if (!label || !lat || !lng || !fullAddress) return sendResponse(res, 400, null, 'All address fields are required');

    try {
        const result = await dbPool.query(
            'INSERT INTO addresses (user_id, label, location, full_address) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.user!.id, label, `POINT(${lng} ${lat})`, fullAddress]
        );
        sendResponse(res, 201, result.rows[0]);
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

// -------------------------------------------------------------
// SHOP AND PRODUCT DISCOVERY
// -------------------------------------------------------------
app.get('/api/shops', authenticateToken, async (req, res) => {
    const lat = parseFloat(req.query.lat as string) || 37.7749;
    const lng = parseFloat(req.query.lng as string) || -122.4194;

    try {
        const shops = await dbPool.query(
            'SELECT id, owner_id, name, category, commission_pct FROM shops',
            [lat, lng] // Used by the spatial query or mock distance calculator
        );
        sendResponse(res, 200, shops.rows);
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

app.get('/api/shops/:id/products', authenticateToken, async (req, res) => {
    try {
        const products = await dbPool.query('SELECT * FROM products WHERE shop_id = $1', [req.params.id]);
        sendResponse(res, 200, products.rows);
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

// -------------------------------------------------------------
// CHECKOUT AND ORDERS
// -------------------------------------------------------------
app.post('/api/checkout', authenticateToken, requireRole(['CUSTOMER']), async (req: AuthRequest, res) => {
    try {
        const result = await processCheckout(dbPool as any, req.user!.id, req.body);
        if (result.success) {
            sendResponse(res, 200, { orderId: result.orderId });
        } else {
            sendResponse(res, 400, null, result.error);
        }
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

app.get('/api/orders', authenticateToken, requireRole(['CUSTOMER']), async (req: AuthRequest, res) => {
    try {
        const result = await dbPool.query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [req.user!.id]);
        sendResponse(res, 200, result.rows);
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

app.get('/api/orders/owner', authenticateToken, requireRole(['SHOP_OWNER']), async (req: AuthRequest, res) => {
    try {
        const result = await dbPool.query(
            'SELECT o.*, s.name as shop_name FROM orders o JOIN shops s ON o.shop_id = s.id WHERE s.owner_id = $1 ORDER BY o.created_at DESC',
            [req.user!.id]
        );
        sendResponse(res, 200, result.rows);
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

// -------------------------------------------------------------
// REAL-TIME DRIVER TRACKING SIMULATION ENGINE
// -------------------------------------------------------------
app.post('/api/orders/:id/simulate', authenticateToken, requireRole(['SHOP_OWNER']), async (req, res) => {
    const orderId = req.params.id as string;

    try {
        // Fetch order details
        const orderResult = await dbPool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (orderResult.rows.length === 0) return sendResponse(res, 404, null, 'Order not found');

        const order = orderResult.rows[0];
        
        // Fetch shop coordinates
        const shopResult = await dbPool.query('SELECT * FROM shops WHERE id = $1', [order.shop_id]);
        const shop = shopResult.rows[0];
        
        // Fetch customer address coordinates
        const addrResult = await dbPool.query('SELECT * FROM addresses WHERE id = $1', [order.address_id]);
        const address = addrResult.rows[0];

        if (!shop || !address) {
            return sendResponse(res, 400, null, 'Missing shop or address coordinates for simulation');
        }

        // Retrieve latitude and longitude (parsing geometry or using coordinates directly)
        const shopLat = shop.location?.y || shop.lat || 37.7794;
        const shopLng = shop.location?.x || shop.lng || -122.4154;
        const custLat = address.location?.y || address.lat || 37.7749;
        const custLng = address.location?.x || address.lng || -122.4194;

        // Run simulation sequence in background
        const runSimulation = async () => {
            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            const contact = { phone: '+15550199', fcmToken: 'mock-fcm-token' }; // Mock notification destination

            // Step 1: CONFIRMED
            console.log(`[SIMULATION] Order ${orderId} status: CONFIRMED`);
            await dbPool.query('UPDATE orders SET status = $1 WHERE id = $2', ['CONFIRMED', orderId]);
            await notificationService.notifyCustomerOrderStatus(contact, { orderId, status: 'CONFIRMED' });
            broadcastToOrder(orderId, { type: 'STATUS_UPDATE', orderId, status: 'CONFIRMED' });
            await delay(4000);

            // Step 2: PREPARING
            console.log(`[SIMULATION] Order ${orderId} status: PREPARING`);
            await dbPool.query('UPDATE orders SET status = $1 WHERE id = $2', ['PREPARING', orderId]);
            await notificationService.notifyCustomerOrderStatus(contact, { orderId, status: 'PREPARING' });
            broadcastToOrder(orderId, { type: 'STATUS_UPDATE', orderId, status: 'PREPARING' });
            await delay(5000);

            // Step 3: READY_FOR_PICKUP
            console.log(`[SIMULATION] Order ${orderId} status: READY_FOR_PICKUP`);
            await dbPool.query('UPDATE orders SET status = $1 WHERE id = $2', ['READY_FOR_PICKUP', orderId]);
            broadcastToOrder(orderId, { type: 'STATUS_UPDATE', orderId, status: 'READY_FOR_PICKUP' });
            await delay(3000);

            // Step 4: OUT_FOR_DELIVERY (Start Moving Agent)
            console.log(`[SIMULATION] Order ${orderId} status: OUT_FOR_DELIVERY`);
            await dbPool.query('UPDATE orders SET status = $1 WHERE id = $2', ['OUT_FOR_DELIVERY', orderId]);
            await notificationService.notifyCustomerOrderStatus(contact, { orderId, status: 'OUT_FOR_DELIVERY' });
            broadcastToOrder(orderId, { type: 'STATUS_UPDATE', orderId, status: 'OUT_FOR_DELIVERY' });

            const steps = 15;
            for (let i = 0; i <= steps; i++) {
                const fraction = i / steps;
                const currentLat = shopLat + (custLat - shopLat) * fraction;
                const currentLng = shopLng + (custLng - shopLng) * fraction;

                console.log(`[SIMULATION] Driver coordinate update: [${currentLat}, ${currentLng}]`);
                await dbPool.query(
                    'UPDATE deliveries SET status = $1, current_location = $2 WHERE order_id = $3',
                    ['OUT_FOR_DELIVERY', `POINT(${currentLng} ${currentLat})`, orderId]
                );

                broadcastToOrder(orderId, {
                    type: 'LOCATION_UPDATE',
                    orderId,
                    lat: currentLat,
                    lng: currentLng
                });

                await delay(2000); // 2 seconds between updates
            }

            // Step 5: DELIVERED
            console.log(`[SIMULATION] Order ${orderId} status: DELIVERED`);
            await dbPool.query('UPDATE orders SET status = $1 WHERE id = $2', ['DELIVERED', orderId]);
            await dbPool.query('UPDATE deliveries SET status = $1 WHERE order_id = $2', ['DELIVERED', orderId]);
            await notificationService.notifyCustomerOrderStatus(contact, { orderId, status: 'DELIVERED' });
            broadcastToOrder(orderId, { type: 'STATUS_UPDATE', orderId, status: 'DELIVERED' });
        };

        runSimulation(); // Spawn asynchronously
        sendResponse(res, 200, { message: 'Simulation started successfully' });
    } catch (err: any) {
        sendResponse(res, 500, null, err.message);
    }
});

// Initialize tracking WebSockets
initializeTrackingSockets(server, JWT_SECRET);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`API + WS Server running on port ${PORT}`));