import * as admin from 'firebase-admin';
import twilio from 'twilio';

const initFirebase = () => {
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}')) });
};

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID || 'mock_sid', process.env.TWILIO_AUTH_TOKEN || 'mock_token');
const TWILIO_FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+1234567890';

class NotificationService {
    constructor() { initFirebase(); }

    async notifyCustomerOrderStatus(contact: any, order: any): Promise<void> {
        const { title, body, requiresSMS } = this.buildMessageTemplates(order);
        const tasks: Promise<any>[] = [];

        if (contact.fcmToken) tasks.push(this.sendPush(contact.fcmToken, title, body, { orderId: order.orderId, status: order.status }));
        if (requiresSMS && contact.phone) tasks.push(this.sendSMS(contact.phone, `${title}\n${body}`));

        const results = await Promise.allSettled(tasks);
        results.forEach(result => { if (result.status === 'rejected') console.error('Delivery Failed:', result.reason); });
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
        await admin.messaging().send({ notification: { title, body }, data, token });
    }

    private async sendSMS(to: string, body: string): Promise<void> {
        await twilioClient.messages.create({ body, from: TWILIO_FROM_NUMBER, to });
    }
}
export const notificationService = new NotificationService();