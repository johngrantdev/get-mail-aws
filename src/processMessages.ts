import { promises as fs } from 'fs';
import * as path from 'path';
import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION || '',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    }
});

const s3Bucket = process.env.S3_BUCKET_NAME || '';
const mailBox = process.env.MAILBOX_PATH || '';

async function setupMaildir(baseDir: string, email: string): Promise<string> {
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9.-_]/g, '_');
    const mailDirPath = path.join(baseDir, sanitizedEmail);
    const subdirs = ['new', 'cur', 'tmp'];
    
    for (const subdir of subdirs) {
        await fs.mkdir(path.join(mailDirPath, subdir), { recursive: true });
    }
    return mailDirPath;
}

async function streamToString(stream: Readable): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
}

export default async function processMessages(key: string, recipientEmail: string): Promise<void> {
    if (!s3Bucket || !mailBox) {
        throw new Error('Required environment variables (S3_BUCKET_NAME, MAILBOX_PATH) are missing');
    }

    try {
        const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key }));

        if (Body instanceof Readable) {
            const messageContent = await streamToString(Body);
            const mailDirPath = await setupMaildir(mailBox, recipientEmail);
            
            const fileName = `${Date.now()}_${path.basename(key)}.eml`;
            const filePath = path.join(mailDirPath, 'new', fileName);

            // Write the raw email content to the Maildir
            await fs.writeFile(filePath, messageContent);

            // Move to processed folder in S3
            await s3Client.send(new CopyObjectCommand({
                Bucket: s3Bucket,
                CopySource: `${s3Bucket}/${key}`,
                Key: `processed/${key}`
            }));

            // Delete original
            await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
            
            console.log(`Successfully stored mail for ${recipientEmail}`);
        }
    } catch (error) {
        console.error(`Error processing S3 key ${key}:`, error);
    }
}
