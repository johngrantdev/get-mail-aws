import express, { Request, Response, NextFunction } from 'express';
import { json } from 'body-parser';
import processMessages from './processMessages';
import dotenv from 'dotenv';

dotenv.config();

const PORT: number = parseInt(process.env.PORT || '80', 10);
const app = express();

// Middleware to handle SNS raw text/plain as JSON
app.use(json({ type: ['text/plain', 'application/json'] }));

app.post('/sns', async (req: Request, res: Response) => {
    const messageType = req.headers['x-amz-sns-message-type'];

    if (messageType === 'SubscriptionConfirmation') {
        console.log('Confirm the subscription by visiting:', req.body.SubscribeURL);
    } else if (messageType === 'Notification') {
        try {
            const snsData = JSON.parse(req.body.Message);
            
            const recipient: string = snsData.receipt.recipients[0];
            
            const s3Key: string = snsData.mail.messageId;

            if (!s3Key) {
                throw new Error("S3 Key (messageId) is missing from the notification.");
            }

            console.log(`Processing mail for: ${recipient} (Key: ${s3Key})`);
            
            await processMessages(s3Key, recipient);

        } catch (error) {
            console.error('Failed to parse SNS Notification JSON:', error);
        }
    }

    res.status(200).end();
});

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}/sns`);

    await syncMissedMessages();

    const SYNC_INTERVAL = 12 * 60 * 60 * 1000; 

    setInterval(async () => {
        console.log("Running periodic background sync...");
        try {
            await syncMissedMessages();
        } catch (err) {
            console.error("Periodic sync failed:", err);
        }
    }, SYNC_INTERVAL);
});
