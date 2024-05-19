import { promises as fs } from 'fs';
import * as path from 'path';
import { simpleParser } from 'mailparser';
import { DateTime } from 'luxon';
import {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    CopyObjectCommand,
    DeleteObjectCommand
    } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

// Configure AWS S3 client with environment variables
const s3Client = new S3Client({
    region: process.env.AWS_REGION || '',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    }
});

const s3Bucket = process.env.S3_BUCKET_NAME || '';
const mailBox = process.env.MAILBOX_PATH || '';

async function setupMaildir(baseDir: string, email: string) {
  const sanitizedEmail = email.replace(/[^a-zA-Z0-9.-_]/g, '_'); // Sanitize to avoid illegal characters in file paths
  const mailDirPath = path.join(baseDir, sanitizedEmail);
  const subdirs = ['new', 'cur', 'tmp'];
  try {
    for (const subdir of subdirs) {
        await fs.mkdir(path.join(mailDirPath, subdir), { recursive: true });
    }
    return mailDirPath;
  } catch (error) {
    console.error("Failed to set up mail directories:", error);
    throw new Error("Failed to initialize Maildir structure.");
  }
}

// List new messages from S3 bucket
async function listNewMessages(s3Bucket: string): Promise<Array<string>> {
    const response = await s3Client.send(new ListObjectsV2Command({
        Bucket: s3Bucket,
        Delimiter: ','
      }));

      if (!response.Contents) return [];

      // filter out messages that have already been processed
      return response.Contents?.filter(
        (item): item is { Key: string } => !item.Key?.startsWith('processed/')
      )
      .map(item => item.Key!);
}

// Process each new message
export default async function processMessages() {
    if (!s3Bucket || !s3Client || !mailBox) {
      throw new Error('Environment variables not defined');
    }

    // await setupMaildir(mailBox);

    const newMessages = await listNewMessages(s3Bucket);

    console.log(`Processing ${newMessages.length} new messages`);
  
    if (newMessages.length) {
      for (let key of newMessages) {
        try {
          const getObjectCommand = new GetObjectCommand({ Bucket: s3Bucket, Key: key });
          const { Body } = await s3Client.send(getObjectCommand);
          if (Body instanceof Readable) {
            const messageContent = await streamToString(Body);
            await processEmail(messageContent, key);
          } else {
            console.error("Received data is not a stream:", key);
        }
        } catch (error) {
          console.error("Something went wrong!", error);
        }
      }
    }
  }

  async function processEmail(messageContent: string, key: string) {
    simpleParser(messageContent, async (err, mail) => {
        if (err) {
            console.error("Error parsing mail:", err);
            return;
        }

        // Check and handle mail.to as an array
        if (!mail.to || (Array.isArray(mail.to) && mail.to.length === 0)) {
            console.error("Recipient address is undefined or empty:", key);
            return;
        }

        const forwardedTo = mail.headers.get('x-forwarded-to')?.toString();
        const deliveredTo = mail.headers.get('delivered-to')?.toString();

        // Get the first recipient email address if array
        const recipientEmail = forwardedTo || deliveredTo || (Array.isArray(mail.to) ? mail.to[0].value[0].address : mail.to.value[0].address);
        if (!recipientEmail) {
            console.error("No valid recipient address found:", key);
            return;
        }

        const mailDirPath = await setupMaildir(mailBox, recipientEmail);
        const headerDate = mail.date ? mail.date.toUTCString() : DateTime.now().toHTTP();
        const fromAddr = mail.from?.value[0].address || 'unknown';
        const fileName = `${Date.now()}_${path.basename(key)}.eml`;
        const filePath = path.join(mailDirPath, 'new', fileName);

        await fs.writeFile(filePath, `From "${fromAddr}" ${headerDate}\n${messageContent}`);

        // Move the message to processed folder in S3
        await s3Client.send(new CopyObjectCommand({
            Bucket: s3Bucket,
            CopySource: `${s3Bucket}/${key}`,
            Key: `processed/${key}`
        }));

        // Delete the original message
        await s3Client.send(new DeleteObjectCommand({
            Bucket: s3Bucket,
            Key: key
        }));
    });
}

  async function streamToString(stream: Readable): Promise<string> {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }