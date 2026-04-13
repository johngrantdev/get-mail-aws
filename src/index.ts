import express, { Request, Response } from 'express';
import { json } from 'body-parser';
import processMessages, { syncMissedMessages, cleanupExpiredEmails, notifyAdmin } from './processMessages';
import dotenv from 'dotenv';

dotenv.config();

const PORT: number = parseInt(process.env.PORT || '80', 10);
const app = express();

app.use(json({ type: ['text/plain', 'application/json'] }));

app.post('/sns', async (req: Request, res: Response) => {
    const messageType = req.headers['x-amz-sns-message-type'];

    if (messageType === 'SubscriptionConfirmation') {
        console.log('Confirm the subscription by visiting:', req.body.SubscribeURL);
    } else if (messageType === 'Notification') {
        try {
            const snsData = JSON.parse(req.body.Message);
            const recipient: string | undefined = snsData.receipt?.recipients?.[0];
            const s3Key: string | undefined = snsData.receipt?.action?.objectKey;

            if (!recipient || !s3Key) {
                console.warn('SNS notification missing expected SES S3-action fields. Skipping direct processing.');
                console.warn('Notification notificationType:', snsData.notificationType, '| action type:', snsData.receipt?.action?.type);
            } else {
                console.log(`Processing mail for: ${recipient} (Key: ${s3Key})`);
                await processMessages(s3Key, recipient);
            }
        } catch (error) {
            console.error('Failed to parse SNS Notification JSON:', error);
        }
    }
    res.status(200).end();
});

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}/sns`);

    await syncMissedMessages();
    await cleanupExpiredEmails();

    const SYNC_INTERVAL = 12 * 60 * 60 * 1000;

    setInterval(async () => {
        console.log("Running periodic background sync...");
        try {
            await syncMissedMessages();
            await cleanupExpiredEmails();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Periodic sync failed:", err);
            await notifyAdmin("Periodic sync failed", message);
        }
    }, SYNC_INTERVAL);
});
