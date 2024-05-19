import express, { Request, Response, NextFunction } from 'express';
import { json } from 'body-parser';
import processMessages from './processMessages';
import dotenv from 'dotenv';

dotenv.config();

const PORT: number = parseInt(process.env.PORT || '80', 10);
const ADDRESS: string = process.env.ADDRESS || `http://localhost:${PORT}`;

const app = express();

// Middleware to handle text/plain content-type
app.use((req: Request, res: Response, next: NextFunction) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
        data += chunk.toString(); // convert Buffer to string
    });
    req.on('end', () => {
        try {
            req.body = JSON.parse(data);
            next();
        } catch (error) {
            console.error('JSON parsing error:', error);
            return res.status(400).send('Invalid JSON');
        }
    });
});

app.use(json());

app.post('/sns', (req: Request, res: Response) => {
    if (req.headers['x-amz-sns-message-type'] === 'SubscriptionConfirmation') {
        // Confirm the subscription by visiting the SubscribeURL from the request
        console.log('Confirm the subscription by visiting the URL:', req.body.SubscribeURL);
    } else if (req.headers['x-amz-sns-message-type'] === 'Notification') {
        // Process the notification
        console.log('Received notification');
        processMessages();
    }

    res.status(200).end();
});

app.listen(PORT, () => {
    console.log(`Get-Mail-AWS https://github.com/johngrantdev/get-mail-aws`);
    console.log(`Server is running on ${ADDRESS}/sns`);
});
