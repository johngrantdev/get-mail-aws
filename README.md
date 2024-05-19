# get-mail-aws
A service that fetches mail received by AWS and processes it into a generic mailbox format suitable for IMAP/POP mail servers such as Dovecot.

## What does it do?
AWS SES has the functionality to receive email, however it does not provide IMAP or POP protocals to access emails from an email client. It can however be configured to save emails as objects in an S3 bucket and create SNS notifications.

Get-Mail-AWS subscribes to the new email notification topic provided by AWS SNS. Once it recieves a HTTP/HTTPS notification, it will connect to the S3 bucket where the emails are stored, fetch any new emails and process them into the generic Maildir format that can be used by IMAP mail servers such as Dovecot.

## Features
- Can subscribe and recieve SNS notifications for new emails via HTTP/S requests using an express.js.
- Stores emails within a directory of the recipient email address.
- Stores emails within the generic Maildir email format.
- Handles forwarded emails

## Prerequisites
- A domain name
- activated AWS SES service (activated for public use)
- DNS records configured for AWS SES to recieve email [See here](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-setting-up.html)
- AWS SES Email Recieving rule setup with the following:
  - Condition of which domains or email addresses to apply rule
  - Action to deliver emails to a dedicated S3 Bucket for emails
  - enable SNS notification once emails are delivered to the S3 bucket.
- A reverse proxy to serve this app publicly with a SSL certificate setup

## How to use?
### Setting up docker container
This app runs in a docker container and uses environment variables. The docker-compose file can be used with the provided .env.example file (save as .env and update).

You can either build the dockerfile locally or use the image build in the docker repository in the docker-compose file.

### Setting up subscription to AWS SNS topic

Once the docker container is configured and started with its endpoint accessible from the internet (eg. https://mail.domain.tld/sns); you can then subscribe it to the SNS topic you created for the 'emails delivered to S3' event.

The steps to do this are:
- Access the AWS SNS web platform / Subscription section.
- Create a new subscription.
- Set the 'Topic' as the the one used for 'emails delivered to S3' events.
- Set the 'Protocal' as HTTPS (assuming you have a reverse proxy configured with SSL)
- Set the 'Endpoint' as the address setup for this service with /sns endpoint eg. https://mail.domain.tld/sns
- Once you have create the subscription AWS SNS will send a subscription request to the server. Open up the console logs for this docker container and you should see a subscription url logged in the console, copy this address.
- Navigate to the AWS SNS subscriptiosn page and select the pending subscription, click 'Confirm Subscription' and paste the response URL.

Now when new emails are recieved the SNS service will send a notification to the get-mail-aws endpoint which will trigger the service to process any emails in the S3 bucket. After they are processed they will be put into a /processed directory in the S3 bucket so that they will not be processed again.

## To do
This is currently working fine for my use case but I may implement the following at some point.
- Integrate with a user database such as LDAP to syncronize with account settings on the mail server and only process email for known accounts (AWS SES recieving rule conditions can be used to filter what email to drop before they are stored)
- Implement email aliases (also derived from a LDAP server)