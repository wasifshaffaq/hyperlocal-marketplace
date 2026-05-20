import http from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { Pool, PoolClient } from 'pg';
import { processCheckout } from './services/checkout_service';
import { initializeTrackingSockets } from './services/websocket_tracking';

// Color logging helpers
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;

// Simple assertion helper
function assert(condition: any, message: string) {
    if (!condition) {
        console.error(red(`[FAIL] ${message}`));
        throw new Error(`Assertion failed: ${message}`);
    } else {
        console.log(green(`[PASS] ${message}`));
    }
}

// -------------------------------------------------------------
// MOCK DATABASE CLIENT IMPLEMENTATION
// -------------------------------------------------------------
class MockPoolClient {
    queries: { sql: string; params?: any[] }[] = [];
    mockQueries: { pattern: RegExp; rows: any[] }[] = [];

    async query(sql: string, params?: any[]): Promise<{ rows: any[] }> {
        this.queries.push({ sql, params });

        // Find matching mocked query
        for (const mock of this.mockQueries) {
            if (mock.pattern.test(sql)) {
                return { rows: mock.rows };
            }
        }

        // Default empty result
        return { rows: [] };
    }

    release() {}
}

class MockPool {
    client = new MockPoolClient();
    async connect(): Promise<PoolClient> {
        return this.client as unknown as PoolClient;
    }
}

// -------------------------------------------------------------
// TEST SUITE FOR CHECKOUT SERVICE
// -------------------------------------------------------------
async function runCheckoutTests() {
    console.log(cyan('\n--- Running Checkout Service Tests ---'));

    // Test Case 1: Successful checkout with stock deduction and premium slot
    {
        const pool = new MockPool();
        pool.client.mockQueries = [
            {
                pattern: /SELECT id, price, stock_qty FROM products/,
                rows: [{ id: 'prod-123', price: '10.00', stock_qty: 5 }]
            },
            {
                pattern: /SELECT is_premium, premium_fee FROM delivery_slots/,
                rows: [{ is_premium: true, premium_fee: '2.50' }]
            },
            {
                pattern: /INSERT INTO orders/,
                rows: [{ id: 'order-uuid-999' }]
            }
        ];

        const payload = {
            shopId: 'shop-abc',
            cartItems: [{ productId: 'prod-123', quantity: 2 }],
            slotId: 'slot-premium',
            paymentDetails: {
                cardNumber: '4242123456789012', // Matches success pattern
                cvv: '123'
            }
        };

        const result = await processCheckout(pool as unknown as Pool, 'user-cust-123', payload);

        assert(result.success === true, 'Successful checkout returns success: true');
        assert(result.orderId === 'order-uuid-999', 'Returns the correct generated orderId');

        const sqlQueries = pool.client.queries.map(q => q.sql);
        assert(sqlQueries.includes('BEGIN'), 'Starts a transaction');
        assert(sqlQueries.includes('COMMIT'), 'Commits the transaction on success');
        assert(!sqlQueries.includes('ROLLBACK'), 'Does not roll back transaction on success');

        // Check stock deduction
        const updateQuery = pool.client.queries.find(q => q.sql.includes('UPDATE products'));
        assert(updateQuery !== undefined, 'Executes stock update query');
        assert(updateQuery?.params?.[0] === 2 && updateQuery?.params?.[1] === 'prod-123', 'Deducts correct stock qty (2) for correct product ID');
    }

    // Test Case 2: Insufficient stock rollback
    {
        const pool = new MockPool();
        pool.client.mockQueries = [
            {
                pattern: /SELECT id, price, stock_qty FROM products/,
                rows: [{ id: 'prod-123', price: '10.00', stock_qty: 1 }] // Only 1 in stock
            }
        ];

        const payload = {
            shopId: 'shop-abc',
            cartItems: [{ productId: 'prod-123', quantity: 2 }], // Requesting 2
            slotId: 'slot-premium',
            paymentDetails: {
                cardNumber: '4242123456789012',
                cvv: '123'
            }
        };

        const result = await processCheckout(pool as unknown as Pool, 'user-cust-123', payload);

        assert(result.success === false, 'Checkout fails with insufficient stock');
        assert(result.error?.includes('Insufficient stock'), 'Error message mentions insufficient stock');

        const sqlQueries = pool.client.queries.map(q => q.sql);
        assert(sqlQueries.includes('BEGIN'), 'Starts a transaction');
        assert(sqlQueries.includes('ROLLBACK'), 'Rolls back transaction on insufficient stock');
        assert(!sqlQueries.includes('COMMIT'), 'Does not commit transaction on insufficient stock');
    }

    // Test Case 3: Payment Declined rollback
    {
        const pool = new MockPool();
        pool.client.mockQueries = [
            {
                pattern: /SELECT id, price, stock_qty FROM products/,
                rows: [{ id: 'prod-123', price: '10.00', stock_qty: 10 }]
            },
            {
                pattern: /SELECT is_premium, premium_fee FROM delivery_slots/,
                rows: [{ is_premium: false, premium_fee: '0.00' }]
            }
        ];

        const payload = {
            shopId: 'shop-abc',
            cartItems: [{ productId: 'prod-123', quantity: 2 }],
            paymentDetails: {
                cardNumber: '5105123456789012', // Does not match 4242 (declined)
                cvv: '123'
            }
        };

        const result = await processCheckout(pool as unknown as Pool, 'user-cust-123', payload);

        assert(result.success === false, 'Checkout fails when payment is declined');
        assert(result.error?.includes('Payment failed'), 'Error message contains Payment failed details');

        const sqlQueries = pool.client.queries.map(q => q.sql);
        assert(sqlQueries.includes('BEGIN'), 'Starts a transaction');
        assert(sqlQueries.includes('ROLLBACK'), 'Rolls back transaction on payment decline');
        assert(!sqlQueries.includes('COMMIT'), 'Does not commit transaction on payment decline');
    }
}

// -------------------------------------------------------------
// TEST SUITE FOR WEBSOCKET TRACKING & REAL-TIME PUB/SUB
// -------------------------------------------------------------
async function runWebSocketTests(): Promise<void> {
    console.log(cyan('\n--- Running WebSocket Real-Time Tracking Tests ---'));

    const JWT_SECRET = 'local-test-secret';
    const server = http.createServer();
    
    // Initialize tracking sockets on server
    initializeTrackingSockets(server, JWT_SECRET);

    // Start server on an ephemeral port
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    console.log(`Ephemeral WebSocket server listening on port ${port}`);

    const customerToken = jwt.sign({ id: 'cust-123', role: 'CUSTOMER' }, JWT_SECRET);
    const agentToken = jwt.sign({ id: 'agent-456', role: 'DELIVERY_AGENT' }, JWT_SECRET);

    // Test Case 4: Connect without token fails (gets closed immediately after connection)
    await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/ws/tracking`);
        let opened = false;
        ws.on('open', () => {
            opened = true;
        });
        ws.on('close', (code, reason) => {
            try {
                assert(opened === true, 'Handshake completes first because verification is post-connection');
                assert(code === 1008, 'Connecting without token closes with code 1008');
                resolve();
            } catch (err) {
                reject(err);
            }
        });
        ws.on('error', (err) => {
            reject(err);
        });
    });

    // Test Case 5: Connect with invalid token fails (gets closed immediately after connection)
    await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/ws/tracking?token=badtoken`);
        let opened = false;
        ws.on('open', () => {
            opened = true;
        });
        ws.on('close', (code, reason) => {
            try {
                assert(opened === true, 'Handshake completes first because verification is post-connection');
                assert(code === 1008, 'Connecting with invalid token closes with code 1008');
                resolve();
            } catch (err) {
                reject(err);
            }
        });
        ws.on('error', (err) => {
            reject(err);
        });
    });

    // Test Case 6: Real-time driver updates broadcast to subscribed customers
    await new Promise<void>((resolve, reject) => {
        const customerWS = new WebSocket(`ws://localhost:${port}/ws/tracking?token=${customerToken}`);
        let agentWS: WebSocket;

        customerWS.on('open', () => {
            // Subscribe to order-789
            customerWS.send(JSON.stringify({ type: 'SUBSCRIBE', orderId: 'order-789' }));

            // Connect delivery agent
            agentWS = new WebSocket(`ws://localhost:${port}/ws/tracking?token=${agentToken}`);

            agentWS.on('open', () => {
                // Send a driver location update for order-789
                agentWS.send(JSON.stringify({
                    type: 'LOCATION_UPDATE',
                    orderId: 'order-789',
                    lat: 37.7749,
                    lng: -122.4194
                }));
            });
        });

        customerWS.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                assert(message.type === 'LOCATION_UPDATE', 'Customer receives driver location updates');
                assert(message.orderId === 'order-789', 'Update is for the correct order');
                assert(message.lat === 37.7749 && message.lng === -122.4194, 'Coordinates match driver location update');
                
                // Clean up connections and server
                customerWS.close();
                agentWS.close();
                server.close(() => {
                    resolve();
                });
            } catch (err) {
                customerWS.close();
                if (agentWS) agentWS.close();
                server.close(() => {
                    reject(err);
                });
            }
        });
    });
}

// -------------------------------------------------------------
// MAIN RUNNER
// -------------------------------------------------------------
async function runAllTests() {
    try {
        await runCheckoutTests();
        await runWebSocketTests();
        console.log(green('\nALL TESTS PASSED SUCCESSFULLY! ✅'));
        process.exit(0);
    } catch (err) {
        console.error(red('\nTEST RUN FAILED! ❌'));
        console.error(err);
        process.exit(1);
    }
}

runAllTests();
