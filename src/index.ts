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
            
            // 1. Get the recipient
            const recipient: string = snsData.receipt.recipients[0];
            
            // 2. Get the S3 Key from the correct path
            // In your JSON, snsData.mail.messageId matches the S3 filename
            const s3Key: string = snsData.mail.messageId;

            if (!s3Key) {
                throw new Error("S3 Key (messageId) is missing from the notification.");
            }

            console.log(`Processing mail for: ${recipient} (Key: ${s3Key})`);
            
            // Pass the key to the processor
            await processMessages(s3Key, recipient);

        } catch (error) {
            console.error('Failed to parse SNS Notification JSON:', error);
        }
    }

    res.status(200).end();
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}/sns`);
});
