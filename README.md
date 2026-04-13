# get-mail-aws
A service that fetches mail received by AWS and processes it into a generic mailbox format suitable for IMAP/POP mail servers such as Dovecot.

## What does it do?
AWS SES has the functionality to receive email, however it does not provide IMAP or POP protocols to access emails from an email client. It can however be configured to save emails as objects in an S3 bucket and create SNS notifications.

Get-Mail-AWS subscribes to the new email notification topic provided by AWS SNS. Once it receives a HTTP/HTTPS notification, it will connect to the S3 bucket where the emails are stored, fetch any new emails and process them into the generic Maildir format that can be used by IMAP mail servers such as Dovecot.

## Features
- Subscribes to and receives SNS notifications for new emails via HTTP/S using Express
- Fetches emails from S3 using the object key provided in the SNS notification
- Stores emails in the Maildir format, organised by recipient email address
- Handles forwarded emails
- Periodic background sync on startup and every 12 hours to catch any emails missed by SNS notifications
- Automatic cleanup of processed emails from S3 after a configurable number of days
- Admin notifications delivered directly to a local mailbox when errors or warnings occur

## Prerequisites
- A domain name
- Activated AWS SES service (activated for public use)
- DNS records configured for AWS SES to receive email — [see AWS docs](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-setting-up.html)
- AWS SES email receiving rule with:
  - Conditions specifying which domains or email addresses the rule applies to
  - Action 1: **Deliver to Amazon S3 bucket** — with your SNS topic set in the optional **SNS topic** field
  - No separate SNS action — the notification must come from the S3 action to include the S3 object key. A standalone SNS action embeds the full email in the notification and will reject emails larger than 150 KB.
- A reverse proxy serving this app publicly with an SSL certificate

## How to use

### Setting up the Docker container
This app runs in a Docker container and uses environment variables. Copy `.env.example` to `.env` and fill in the values, then use `docker-compose` to start the container.

You can either build the Dockerfile locally or use the pre-built image referenced in the `docker-compose.yml` file.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port to listen on (default: 80) |
| `AWS_ACCESS_KEY_ID` | Yes | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS credentials |
| `AWS_REGION` | Yes | AWS region |
| `S3_BUCKET_NAME` | Yes | S3 bucket where SES stores incoming emails |
| `MAILBOX_PATH` | Yes | Path to the root mailbox directory on the host |
| `S3_RETENTION_DAYS` | No | Days to retain processed emails in S3 before deleting. Omit to disable cleanup. |
| `DEFAULT_EMAIL` | No | Email address to receive admin error/warning notifications. Must already exist as a mailbox on the system. |

### Setting up the SNS subscription

Once the container is running and its endpoint is accessible from the internet (e.g. `https://mail.domain.tld/sns`):

1. Go to the AWS SNS console → Subscriptions → Create subscription
2. Set the **Topic** to the one configured in the SES S3 action
3. Set the **Protocol** to HTTPS
4. Set the **Endpoint** to your service URL, e.g. `https://mail.domain.tld/sns`
5. After creating the subscription, AWS SNS will send a confirmation request to the server. Check the container logs for the confirmation URL, copy it, then confirm the subscription in the AWS SNS console.

When new emails are received, SNS notifies this service which fetches the email from S3, writes it to the recipient's Maildir, then moves the S3 object to a `processed/` prefix so it is not reprocessed.

## To do
- Integrate with a user database such as LDAP to synchronize with account settings on the mail server and only process email for known accounts
- Implement email aliases (also derived from an LDAP server)
