import { promises as fs } from 'fs';
import * as path from 'path';
import {
    S3Client,
    GetObjectCommand,
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import dotenv from 'dotenv';
import { simpleParser } from 'mailparser';

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
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9.@_-]/g, '_');
    const mailDirPath = path.join(baseDir, sanitizedEmail);
    const subdirs = ['new', 'cur', 'tmp'];

    for (const subdir of subdirs) {
        await fs.mkdir(path.join(mailDirPath, subdir), { recursive: true });
    }
    return mailDirPath;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

export async function notifyAdmin(subject: string, body: string): Promise<void> {
    const defaultEmail = process.env.DEFAULT_EMAIL;
    if (!defaultEmail || !mailBox) return;

    const sanitized = defaultEmail.replace(/[^a-zA-Z0-9.@_-]/g, '_');
    const newDir = path.join(mailBox, sanitized, 'new');

    try {
        await fs.access(newDir);
    } catch {
        return;
    }

    const date = new Date().toUTCString();
    const eml = [
        `From: get-mail-aws <noreply@localhost>`,
        `To: ${defaultEmail}`,
        `Date: ${date}`,
        `Message-ID: <${Date.now()}.get-mail-aws@localhost>`,
        `Subject: [get-mail-aws] ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body,
    ].join('\r\n');

    const fileName = `${Date.now()}_notification.eml`;
    await fs.writeFile(path.join(newDir, fileName), eml);
}

export default async function processMessages(key: string, recipientEmail: string): Promise<void> {
    if (!s3Bucket || !mailBox) {
        throw new Error('Required environment variables (S3_BUCKET_NAME, MAILBOX_PATH) are missing');
    }

    try {
        const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key }));

        if (Body instanceof Readable) {
            const messageBuffer = await streamToBuffer(Body);
            const mailDirPath = await setupMaildir(mailBox, recipientEmail);

            const fileName = `${Date.now()}_${path.basename(key)}.eml`;
            const filePath = path.join(mailDirPath, 'new', fileName);

            await fs.writeFile(filePath, messageBuffer);

            await s3Client.send(new CopyObjectCommand({
                Bucket: s3Bucket,
                CopySource: `${s3Bucket}/${key}`,
                Key: `processed/${key}`
            }));

            await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
            console.log(`Successfully stored mail for ${recipientEmail}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error processing S3 key ${key}:`, error);
        await notifyAdmin(
            `Failed to process email`,
            `Error processing S3 key: ${key}\nRecipient: ${recipientEmail}\n\n${message}`
        );
    }
}

export async function syncMissedMessages(): Promise<void> {
    const response = await s3Client.send(new ListObjectsV2Command({
        Bucket: s3Bucket,
    }));

    const pending = response.Contents?.filter((obj) => obj.Key && !obj.Key.startsWith('processed/')) || [];

    for (const obj of pending) {
        const key = obj.Key!;
        try {
            const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key }));
            if (Body instanceof Readable) {
                const content = await streamToBuffer(Body);

                const parsed = await simpleParser(content);
                const recipient = parsed.to
                    ? (Array.isArray(parsed.to) ? parsed.to[0] : parsed.to).value[0].address
                    : undefined;

                if (recipient) {
                    await processMessages(key, recipient);
                    console.log(`Synced missed mail for ${recipient}`);
                } else {
                    console.warn(`Could not determine recipient for key: ${key}`);
                    await notifyAdmin(
                        `Could not determine recipient for email`,
                        `S3 key: ${key}\n\nThe email could not be delivered because no recipient address could be parsed from its headers.`
                    );
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`Failed to sync key ${key}:`, err);
            await notifyAdmin(
                `Failed to sync email`,
                `S3 key: ${key}\n\n${message}`
            );
        }
    }
}

export async function cleanupExpiredEmails(): Promise<void> {
    const retentionDays = parseInt(process.env.S3_RETENTION_DAYS || '', 10);
    if (!retentionDays || isNaN(retentionDays)) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const response = await s3Client.send(new ListObjectsV2Command({ Bucket: s3Bucket }));
    const expired = (response.Contents || []).filter(
        (obj) => obj.Key && obj.Key.startsWith('processed/') && obj.LastModified && obj.LastModified < cutoff
    );

    if (expired.length === 0) return;

    await s3Client.send(new DeleteObjectsCommand({
        Bucket: s3Bucket,
        Delete: { Objects: expired.map((obj) => ({ Key: obj.Key! })) },
    }));

    console.log(`Cleaned up ${expired.length} processed email(s) from S3 (older than ${retentionDays} days)`);
}
