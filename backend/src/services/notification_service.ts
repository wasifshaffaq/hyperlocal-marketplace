import * as admin from 'firebase-admin';
import twilio from 'twilio';

let firebaseInitialized = false;
const initFirebase = () => {
    try {
        if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            console.log('\x1b[33m[Push] No Firebase Service Account Key found. Push notifications will be simulated in console.\x1b[0m');
            return;
        }
        if (!admin.apps.length) {
            const cert = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            admin.initializeApp({ credential: admin.credential.cert(cert) });
            firebaseInitialized = true;
            console.log('\x1b[32m[Push] Firebase Admin SDK initialized successfully.\x1b[0m');
        }
    } catch (err: any) {
        console.warn('\x1b[33m[Push] Firebase SDK initialization failed. Fallback to mock simulation. Error:', err.message, '\x1b[0m');
    }
};

let twilioClient: any = null;
const initTwilio = () => {
    try {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;

        if (sid && sid.startsWith('AC') && token) {
            twilioClient = twilio(sid, token);
            console.log('\x1b[32m[SMS] Twilio client initialized successfully.\x1b[0m');
        } else {
            console.log('\x1b[33m[SMS] Twilio credentials missing or invalid. SMS notifications will be simulated in console.\x1b[0m');
        }
    } catch (err: any) {
        console.warn('\x1b[33m[SMS] Twilio initialization failed. Fallback to mock simulation. Error:', err.message, '\x1b[0m');
    }
};

const TWILIO_FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+1234567890';

class NotificationService {
    constructor() {
        initFirebase();
        initTwilio();
    }

    async notifyCustomerOrderStatus(contact: any, order: any): Promise<void> {
        const { title, body, requiresSMS } = this.buildMessageTemplates(order);
        const tasks: Promise<any>[] = [];

        if (contact.fcmToken) {
            tasks.push(this.sendPush(contact.fcmToken, title, body, { orderId: order.orderId, status: order.status }));
        }
        if (requiresSMS && contact.phone) {
            tasks.push(this.sendSMS(contact.phone, `${title}\n${body}`));
        }

        const results = await Promise.allSettled(tasks);
        results.forEach(result => {
            if (result.status === 'rejected') console.error('[Notification Failed]:', result.reason);
        });
    }

    private buildMessageTemplates(order: any) {
        const shortId = order.orderId.substring(0, 6);
        switch (order.status) {
            case 'CONFIRMED': return { title: `Order accepted!`, body: `Order #${shortId} confirmed.`, requiresSMS: true };
            case 'PREPARING': return { title: `Preparing 🍳`, body: `Making order #${shortId}.`, requiresSMS: false };
            case 'OUT_FOR_DELIVERY': return { title: `On the way! 🛵`, body: `Agent heading to you.`, requiresSMS: false };
            case 'DELIVERED': return { title: `Delivered! 🎉`, body: `Order #${shortId} arrived.`, requiresSMS: true };
            default: return { title: `Update`, body: `Status: ${order.status}.`, requiresSMS: false };
        }
    }

    private async sendPush(token: string, title: string, body: string, data: Record<string, string>): Promise<void> {
        if (firebaseInitialized) {
            await admin.messaging().send({ notification: { title, body }, data, token });
        } else {
            console.log(`\x1b[35m[PUSH SIMULATION] To: ${token} | Title: "${title}" | Body: "${body}"\x1b[0m`);
        }
    }

    private async sendSMS(to: string, body: string): Promise<void> {
        if (twilioClient) {
            await twilioClient.messages.create({ body, from: TWILIO_FROM_NUMBER, to });
        } else {
            console.log(`\x1b[35m[SMS SIMULATION] To: ${to} | Body: "${body}"\x1b[0m`);
        }
    }
}

export const notificationService = new NotificationService();