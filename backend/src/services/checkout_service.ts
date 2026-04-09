import { Pool, PoolClient } from 'pg';

const MockPaymentGateway = {
    async process(req: any): Promise<any> {
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
        if (!req.cardNumber || req.cardNumber.length < 15) return { success: false, error: 'Invalid card number' };
        if (req.cardNumber.startsWith('4242')) return { success: true, transactionId: `mock_txn_${Math.random().toString(36).substring(2, 15)}` };
        return { success: false, error: 'Card declined by issuing bank' };
    }
};

export const processCheckout = async (dbPool: Pool, userId: string, payload: any) => {
    const { shopId, cartItems, slotId, paymentDetails } = payload;
    const client: PoolClient = await dbPool.connect();

    try {
        await client.query('BEGIN');

        const productIds = cartItems.map((item: any) => item.productId).sort();
        const stockCheck = await client.query(`
            SELECT id, price, stock_qty FROM products WHERE id = ANY($1) FOR UPDATE NOWAIT
        `, [productIds]);

        let cartSubtotal = 0;
        for (const cartItem of cartItems) {
            const product = stockCheck.rows.find(p => p.id === cartItem.productId);
            if (!product || product.stock_qty < cartItem.quantity) throw new Error(`Insufficient stock for product ID: ${cartItem.productId}`);
            cartSubtotal += parseFloat(product.price) * cartItem.quantity;
            await client.query(`UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2`, [cartItem.quantity, cartItem.productId]);
        }

        let premiumFee = 0.00;
        if (slotId) {
            const slotCheck = await client.query(`SELECT is_premium, premium_fee FROM delivery_slots WHERE id = $1`, [slotId]);
            if (slotCheck.rows.length > 0 && slotCheck.rows[0].is_premium) premiumFee = parseFloat(slotCheck.rows[0].premium_fee);
        }

        const deliveryFee = 5.00;
        const tax = cartSubtotal * 0.08;
        const finalTotal = cartSubtotal + deliveryFee + premiumFee + tax;

        const paymentResult = await MockPaymentGateway.process({ ...paymentDetails, amount: finalTotal, currency: 'USD' });
        if (!paymentResult.success) throw new Error(`Payment failed: ${paymentResult.error}`);

        const orderRes = await client.query(`
            INSERT INTO orders (customer_id, shop_id, slot_id, delivery_type, subtotal, delivery_fee, tax, total, payment_status)
            VALUES ($1, $2, $3, 'DELIVERY', $4, $5, $6, $7, 'CAPTURED') RETURNING id
        `, [userId, shopId, slotId, cartSubtotal, deliveryFee + premiumFee, tax, finalTotal]);
        
        const orderId = orderRes.rows[0].id;
        await client.query(`INSERT INTO payment_transactions (order_id, gateway_ref, amount, status) VALUES ($1, $2, $3, 'CAPTURED')`, [orderId, paymentResult.transactionId, finalTotal]);

        for (const item of cartItems) {
            await client.query(`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`, 
            [orderId, item.productId, item.quantity, stockCheck.rows.find(p => p.id === item.productId).price]);
        }

        await client.query('COMMIT');
        return { success: true, orderId };
    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
};