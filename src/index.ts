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
            // SNS Message field is a stringified JSON
            const snsData = JSON.parse(req.body.Message);
            
            // Extract metadata provided by SES
            const recipient: string = snsData.receipt.recipients[0];
            const s3Key: string = snsData.receipt.action.objectKey;

            console.log(`Processing mail for: ${recipient}`);
            
            // Trigger the process
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
