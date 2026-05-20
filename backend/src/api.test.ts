import assert from 'assert';
import http from 'http';
import jwt from 'jsonwebtoken';
import { dbPool, initializeDatabase } from './db';

// Start a testing server
const JWT_SECRET = 'super-secret-production-key';

const request = (method: string, path: string, headers: any, body: any): Promise<{ status: number, data: any }> => {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: 'localhost',
            port: 3000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode || 500,
                        data: JSON.parse(data)
                    });
                } catch {
                    resolve({
                        status: res.statusCode || 500,
                        data: data as any
                    });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
};

const runApiTests = async () => {
    console.log('\n--- Running Backend API End-to-End Tests ---');

    // 1. Initialize Mock DB
    await initializeDatabase();

    // 2. Test User Registration
    const randEmail = `user-${Math.random().toString(36).substring(2, 7)}@test.com`;
    const regRes = await request('POST', '/api/auth/register', {}, {
        email: randEmail,
        password: 'testpassword',
        role: 'CUSTOMER',
        phone: '111-222-3333'
    });
    assert(regRes.status === 201, `Register status should be 201, got ${regRes.status}`);
    assert(regRes.data.success === true, 'Register success should be true');
    assert(regRes.data.data.token, 'Register response should contain a JWT token');
    console.log('[PASS] User Registration');

    // 3. Test Registration Duplicate Email
    const dupRes = await request('POST', '/api/auth/register', {}, {
        email: randEmail,
        password: 'testpassword'
    });
    assert(dupRes.status === 400, 'Register duplicate email should fail with 400');
    assert(dupRes.data.success === false, 'Duplicate register success should be false');
    console.log('[PASS] User Registration Duplicate Prevention');

    // 4. Test User Login
    const loginRes = await request('POST', '/api/auth/login', {}, {
        email: randEmail,
        password: 'testpassword'
    });
    assert(loginRes.status === 200, 'Login status should be 200');
    assert(loginRes.data.data.token, 'Login response should contain JWT');
    const token = loginRes.data.data.token;
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    console.log('[PASS] User Login');

    // 5. Test Shop Discovery
    const shopsRes = await request('GET', '/api/shops?lat=37.7749&lng=-122.4194', authHeaders, null);
    assert(shopsRes.status === 200, 'Shops listing should return 200');
    assert(Array.isArray(shopsRes.data.data), 'Shops list should be an array');
    assert(shopsRes.data.data.length > 0, 'Should return at least 1 shop near center coordinates');
    const shopId = shopsRes.data.data[0].id;
    console.log('[PASS] Shop Discovery Near Location');

    // 6. Test Product Listing
    const productsRes = await request('GET', `/api/shops/${shopId}/products`, authHeaders, null);
    assert(productsRes.status === 200, 'Product listing should return 200');
    assert(Array.isArray(productsRes.data.data), 'Products should be an array');
    assert(productsRes.data.data.length > 0, 'Products list should not be empty');
    const product = productsRes.data.data[0];
    console.log('[PASS] Product Listing by Shop');

    // 7. Add Address
    const addAddressRes = await request('POST', '/api/addresses', authHeaders, {
        label: 'Work',
        lat: 37.7749,
        lng: -122.4194,
        fullAddress: '456 Market St, San Francisco, CA'
    });
    assert(addAddressRes.status === 201, 'Address creation should return 201');
    assert(addAddressRes.data.data.id, 'Address should contain ID');
    const addressId = addAddressRes.data.data.id;
    console.log('[PASS] Create Customer Address');

    // 8. Fetch Addresses
    const listAddrRes = await request('GET', '/api/addresses', authHeaders, null);
    assert(listAddrRes.status === 200, 'List addresses should return 200');
    assert(listAddrRes.data.data.length > 0, 'Addresses list should contain items');
    console.log('[PASS] List Customer Addresses');

    // 9. Checkout
    const checkoutRes = await request('POST', '/api/checkout', authHeaders, {
        shopId,
        addressId,
        slotId: `slot-${shopId}-premium`,
        cartItems: [
            { productId: product.id, quantity: 2 }
        ],
        paymentDetails: {
            cardNumber: '4242424242424242',
            cvv: '123',
            expiry: '12/28'
        }
    });
    assert(checkoutRes.status === 200, `Checkout should succeed, got status ${checkoutRes.status} with error ${checkoutRes.data.error}`);
    assert(checkoutRes.data.data.orderId, 'Checkout should return orderId');
    const orderId = checkoutRes.data.data.orderId;
    console.log('[PASS] Successful Checkout & Order Creation');

    // 10. Simulate Delivery (Needs Owner Auth)
    // Create Owner login
    const ownerLoginRes = await request('POST', '/api/auth/login', {}, {
        email: 'owner@shop.com',
        password: 'password'
    });
    const ownerToken = ownerLoginRes.data.data.token;
    const ownerHeaders = { 'Authorization': `Bearer ${ownerToken}` };

    const simRes = await request('POST', `/api/orders/${orderId}/simulate`, ownerHeaders, null);
    assert(simRes.status === 200, `Simulation start status should be 200, got ${simRes.status}`);
    console.log('[PASS] Driver Tracking Simulation Daemon Initialized');

    console.log('\nALL API INTEGRATION TESTS PASSED SUCCESSFULLY! ✅\n');
};

// Check if running directly
if (require.main === module) {
    runApiTests().catch((err) => {
        console.error('API TEST RUN FAILED! ❌');
        console.error(err);
        process.exit(1);
    });
}
