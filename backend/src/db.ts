import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

// ... [Keep standard interfaces same] ...
interface User {
    id: string;
    email: string;
    password_hash: string;
    role: string;
    phone?: string;
    created_at: Date;
}


interface Address {
    id: string;
    user_id: string;
    label: string;
    lat: number;
    lng: number;
    full_address: string;
}

interface Shop {
    id: string;
    owner_id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
    delivery_radius_km: number;
    is_open: boolean;
    rating_avg: number;
    commission_pct: number;
}

interface Product {
    id: string;
    shop_id: string;
    name: string;
    description: string;
    price: number;
    stock_qty: number;
    image_url: string;
    is_available: boolean;
}

interface DeliverySlot {
    id: string;
    shop_id: string;
    slot_label: string;
    is_premium: boolean;
    premium_fee: number;
    available_from: string;
    available_until: string;
}

interface Order {
    id: string;
    customer_id: string;
    shop_id: string;
    address_id: string;
    slot_id: string | null;
    status: string;
    delivery_type: string;
    subtotal: number;
    delivery_fee: number;
    tax: number;
    total: number;
    payment_status: string;
    created_at: Date;
}

interface OrderItem {
    id: string;
    order_id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
}

interface Delivery {
    id: string;
    order_id: string;
    agent_id: string | null;
    source: string;
    status: string;
    lat: number | null;
    lng: number | null;
}

// Global In-Memory Database State
class MockDatabaseState {
    users: User[] = [];
    addresses: Address[] = [];
    shops: Shop[] = [];
    products: Product[] = [];
    slots: DeliverySlot[] = [];
    orders: Order[] = [];
    orderItems: OrderItem[] = [];
    deliveries: Delivery[] = [];

    constructor() {
        this.seedData();
    }

    private seedData() {
        console.log('\x1b[36m[DB] Seeding Mock In-Memory Database...\x1b[0m');
        
        // Seed default owner
        this.users.push({
            id: 'uuid-owner-123',
            email: 'owner@shop.com',
            password_hash: bcrypt.hashSync('password', 10),
            role: 'SHOP_OWNER',
            phone: '1234567890',
            created_at: new Date()
        });

        // Seed default customer
        this.users.push({
            id: 'uuid-customer-123',
            email: 'customer@shop.com',
            password_hash: bcrypt.hashSync('password', 10),
            role: 'CUSTOMER',
            phone: '9876543210',
            created_at: new Date()
        });

        // Seed customer address
        this.addresses.push({
            id: 'addr-cust-123',
            user_id: 'uuid-customer-123',
            label: 'Home',
            lat: 37.7749,
            lng: -122.4194,
            full_address: '123 Market St, San Francisco, CA'
        });

        // Seed Shops
        const categories = ['Grocery', 'Restaurants', 'Pharmacy', 'Grocery'];
        const names = ['Green Grocers', 'Sushi Master', 'Wellness Pharmacy', 'Sizzling Pizza'];
        const lats = [37.7794, 37.7854, 37.7684, 37.7914];
        const lngs = [-122.4154, -122.4084, -122.4254, -122.4014];

        for (let i = 0; i < 4; i++) {
            const shopId = `shop-id-${i + 1}`;
            this.shops.push({
                id: shopId,
                owner_id: 'uuid-owner-123',
                name: names[i],
                category: categories[i],
                lat: lats[i],
                lng: lngs[i],
                delivery_radius_km: 5.0,
                is_open: true,
                rating_avg: 4.2 + (i * 0.2),
                commission_pct: 10.0
            });

            // Seed Products for each shop
            for (let j = 1; j <= 5; j++) {
                this.products.push({
                    id: `prod-${shopId}-${j}`,
                    shop_id: shopId,
                    name: `${names[i]} Special Item ${j}`,
                    description: `Fresh and high-quality product from ${names[i]}.`,
                    price: 9.99 + (j * 2),
                    stock_qty: 15 + (j * 5),
                    image_url: `https://images.unsplash.com/photo-1542838132-92c53300491e?w=200`,
                    is_available: true
                });
            }

            // Seed slots
            this.slots.push({
                id: `slot-${shopId}-standard`,
                shop_id: shopId,
                slot_label: 'Standard Delivery (2-Hour Window)',
                is_premium: false,
                premium_fee: 0.00,
                available_from: '08:00:00',
                available_until: '22:00:00'
            });

            this.slots.push({
                id: `slot-${shopId}-premium`,
                shop_id: shopId,
                slot_label: 'Instant Express Delivery (Premium)',
                is_premium: true,
                premium_fee: 4.99,
                available_from: '08:00:00',
                available_until: '22:00:00'
            });
        }
    }
}

const mockState = new MockDatabaseState();

class MockInMemoryClient {
    private inTransaction = false;
    private tempStockUpdates: Map<string, number> = new Map();

    async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
        const cleanedSql = sql.trim().replace(/\s+/g, ' ');

        // 1. Transaction queries
        if (cleanedSql === 'BEGIN') {
            this.inTransaction = true;
            this.tempStockUpdates.clear();
            return { rows: [] };
        }
        if (cleanedSql === 'COMMIT') {
            this.inTransaction = false;
            // Apply stock updates
            for (const [prodId, newStock] of this.tempStockUpdates.entries()) {
                const prod = mockState.products.find(p => p.id === prodId);
                if (prod) prod.stock_qty = newStock;
            }
            this.tempStockUpdates.clear();
            return { rows: [] };
        }
        if (cleanedSql === 'ROLLBACK') {
            this.inTransaction = false;
            this.tempStockUpdates.clear();
            return { rows: [] };
        }

        // 2. Select User by Email
        if (cleanedSql.includes('SELECT * FROM users WHERE email = $1')) {
            const user = mockState.users.find(u => u.email === params[0]);
            return { rows: user ? [user] : [] };
        }

        // 3. Insert User
        if (cleanedSql.includes('INSERT INTO users') && cleanedSql.includes('RETURNING id')) {
            const newUser: User = {
                id: `uuid-user-${Math.random().toString(36).substring(2, 11)}`,
                email: params[0],
                password_hash: params[1],
                role: params[2] || 'CUSTOMER',
                phone: params[3],
                created_at: new Date()
            };
            mockState.users.push(newUser);
            return { rows: [newUser] };
        }

        // 4. Select Addresses
        if (cleanedSql.includes('SELECT * FROM addresses WHERE user_id = $1')) {
            const addresses = mockState.addresses.filter(a => a.user_id === params[0]);
            return { rows: addresses };
        }

        // 5. Insert Address
        if (cleanedSql.includes('INSERT INTO addresses')) {
            // Match lat/lng from POINT geometry params
            let lat = 37.7749, lng = -122.4194;
            if (params[2] && typeof params[2] === 'string') {
                const match = params[2].match(/POINT\(([-\d.]+) ([\d.]+)\)/i);
                if (match) {
                    lng = parseFloat(match[1]);
                    lat = parseFloat(match[2]);
                }
            }
            const newAddr: Address = {
                id: `uuid-addr-${Math.random().toString(36).substring(2, 11)}`,
                user_id: params[0],
                label: params[1],
                lat,
                lng,
                full_address: params[3]
            };
            mockState.addresses.push(newAddr);
            return { rows: [newAddr] };
        }

        // 6. Select Shops with Spatial Distance Sphere calculation
        if (cleanedSql.includes('SELECT id, owner_id, name, category, commission_pct')) {
            // Custom spatial distance evaluation
            const customerLat = params[0] || 37.7749;
            const customerLng = params[1] || -122.4194;

            const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
                const R = 6371; // km
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            };

            const results = mockState.shops.map(shop => {
                const distance = haversineDistance(customerLat, customerLng, shop.lat, shop.lng);
                return {
                    ...shop,
                    // format location structure to simulate pg-postgis return
                    location: { x: shop.lng, y: shop.lat },
                    distance: distance.toFixed(2) + 'km',
                    distance_val: distance
                };
            }).filter(s => s.distance_val <= s.delivery_radius_km);

            return { rows: results };
        }

        // 7. Select Products for Shop
        if (cleanedSql.includes('SELECT * FROM products WHERE shop_id = $1')) {
            const products = mockState.products.filter(p => p.shop_id === params[0]);
            return { rows: products };
        }

        // 8. Select Products for Checkout (FOR UPDATE NOWAIT)
        if (cleanedSql.includes('SELECT id, price, stock_qty FROM products WHERE id = ANY($1)')) {
            const productIds: string[] = params[0];
            const products = mockState.products.filter(p => productIds.includes(p.id)).map(p => {
                // If in transaction, refer to local modified stock
                const stock = this.inTransaction && this.tempStockUpdates.has(p.id) 
                    ? this.tempStockUpdates.get(p.id)! 
                    : p.stock_qty;
                return { id: p.id, price: p.price, stock_qty: stock };
            });
            return { rows: products };
        }

        // 9. Update Product Stock (Transactional safety check)
        if (cleanedSql.includes('UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2')) {
            const qtyDeducted = params[0];
            const prodId = params[1];
            const prod = mockState.products.find(p => p.id === prodId);
            if (!prod) throw new Error(`Product not found: ${prodId}`);

            const currentStock = this.inTransaction && this.tempStockUpdates.has(prodId)
                ? this.tempStockUpdates.get(prodId)!
                : prod.stock_qty;

            const newStock = currentStock - qtyDeducted;
            if (newStock < 0) throw new Error(`Insufficient stock for product ID: ${prodId}`);

            if (this.inTransaction) {
                this.tempStockUpdates.set(prodId, newStock);
            } else {
                prod.stock_qty = newStock;
            }
            return { rows: [] };
        }

        // 10. Select Delivery Slot
        if (cleanedSql.includes('SELECT is_premium, premium_fee FROM delivery_slots WHERE id = $1')) {
            const slot = mockState.slots.find(s => s.id === params[0]);
            return { rows: slot ? [slot] : [] };
        }

        // 11. Insert Order
        if (cleanedSql.includes('INSERT INTO orders')) {
            const newOrder: Order = {
                id: `order-${Math.random().toString(36).substring(2, 11)}`,
                customer_id: params[0],
                shop_id: params[1],
                address_id: params[2],
                slot_id: params[3],
                status: 'PLACED',
                delivery_type: 'DELIVERY',
                subtotal: params[4],
                delivery_fee: params[5],
                tax: params[6],
                total: params[7],
                payment_status: 'CAPTURED',
                created_at: new Date()
            };
            mockState.orders.push(newOrder);

            // Auto-create delivery record
            mockState.deliveries.push({
                id: `deliv-${newOrder.id}`,
                order_id: newOrder.id,
                agent_id: null,
                source: 'MARKETPLACE',
                status: 'ASSIGNED',
                lat: null,
                lng: null
            });

            return { rows: [newOrder] };
        }

        // 12. Insert Order Item
        if (cleanedSql.includes('INSERT INTO order_items')) {
            const newItem: OrderItem = {
                id: `item-${Math.random().toString(36).substring(2, 11)}`,
                order_id: params[0],
                product_id: params[1],
                quantity: params[2],
                unit_price: params[3]
            };
            mockState.orderItems.push(newItem);
            return { rows: [newItem] };
        }

        // 13. Select Orders for Customer
        if (cleanedSql.includes('SELECT * FROM orders WHERE customer_id = $1')) {
            const customerOrders = mockState.orders.filter(o => o.customer_id === params[0]);
            return { rows: customerOrders };
        }

        // 14. Select Orders for Owner (All orders for shops owned by owner)
        if (cleanedSql.includes('SELECT o.*, s.name as shop_name FROM orders o JOIN shops s')) {
            const ownerShopIds = mockState.shops.filter(s => s.owner_id === params[0]).map(s => s.id);
            const ownerOrders = mockState.orders.filter(o => ownerShopIds.includes(o.shop_id)).map(o => {
                const shop = mockState.shops.find(s => s.id === o.shop_id);
                return { ...o, shop_name: shop?.name || 'My Shop' };
            });
            return { rows: ownerOrders };
        }

        // 15. Update Order Status
        if (cleanedSql.includes('UPDATE orders SET status = $1 WHERE id = $2')) {
            const order = mockState.orders.find(o => o.id === params[1]);
            if (order) order.status = params[0];
            return { rows: [] };
        }

        // 15a. Select Order by ID
        if (cleanedSql.includes('SELECT * FROM orders WHERE id = $1')) {
            const order = mockState.orders.find(o => o.id === params[0]);
            return { rows: order ? [order] : [] };
        }

        // 15b. Select Shop by ID
        if (cleanedSql.includes('SELECT * FROM shops WHERE id = $1')) {
            const shop = mockState.shops.find(s => s.id === params[0]);
            return { rows: shop ? [shop] : [] };
        }

        // 15c. Select Address by ID
        if (cleanedSql.includes('SELECT * FROM addresses WHERE id = $1')) {
            const addr = mockState.addresses.find(a => a.id === params[0]);
            return { rows: addr ? [addr] : [] };
        }

        // 15d. Update Delivery Status only
        if (cleanedSql.includes('UPDATE deliveries SET status = $1 WHERE order_id = $2')) {
            const deliv = mockState.deliveries.find(d => d.order_id === params[1]);
            if (deliv) deliv.status = params[0];
            return { rows: [] };
        }

        // 16. Select Delivery detail
        if (cleanedSql.includes('SELECT * FROM deliveries WHERE order_id = $1')) {
            const deliv = mockState.deliveries.find(d => d.order_id === params[0]);
            return { rows: deliv ? [deliv] : [] };
        }

        // 17. Update Delivery Location
        if (cleanedSql.includes('UPDATE deliveries SET status = $1, current_location')) {
            const status = params[0];
            const orderId = params[2];
            const deliv = mockState.deliveries.find(d => d.order_id === orderId);

            let lat = null, lng = null;
            if (params[1] && typeof params[1] === 'string') {
                const match = params[1].match(/POINT\(([-\d.]+) ([\d.]+)\)/i);
                if (match) {
                    lng = parseFloat(match[1]);
                    lat = parseFloat(match[2]);
                }
            }

            if (deliv) {
                deliv.status = status;
                if (lat !== null) deliv.lat = lat;
                if (lng !== null) deliv.lng = lng;
            }
            return { rows: [] };
        }

        return { rows: [] };
    }

    release() {}
}

class MockInMemoryPool {
    private client = new MockInMemoryClient();

    async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
        return this.client.query(sql, params);
    }

    async connect(): Promise<PoolClient> {
        return this.client as unknown as PoolClient;
    }
}

// -------------------------------------------------------------
// DYNAMIC DATABASE LAYER RESOLVER
// -------------------------------------------------------------
let activePool: any;

export const initializeDatabase = async () => {
    console.log('\x1b[36m[DB] Connecting to PostgreSQL...\x1b[0m');
    const realPool = new Pool({
        user: process.env.PGUSER || 'postgres',
        host: process.env.PGHOST || 'localhost',
        database: process.env.PGDATABASE || 'hyperlocal',
        password: process.env.PGPASSWORD || 'supersecretpassword',
        port: parseInt(process.env.PGPORT || '5432'),
        connectionTimeoutMillis: 2000 // Quick timeout to detect failure
    });

    try {
        await realPool.query('SELECT 1');
        console.log('\x1b[32m[DB] Connected to PostgreSQL + PostGIS successfully.\x1b[0m');
        activePool = realPool;
    } catch (err) {
        console.log('\x1b[33m[DB] PostgreSQL offline/inaccessible. Falling back to Mock In-Memory Database.\x1b[0m');
        activePool = new MockInMemoryPool();
    }
};

export const dbPool = {
    query: async (sql: string, params: any[] = []) => {
        if (!activePool) await initializeDatabase();
        return activePool.query(sql, params);
    },
    connect: async () => {
        if (!activePool) await initializeDatabase();
        return activePool.connect();
    }
};
