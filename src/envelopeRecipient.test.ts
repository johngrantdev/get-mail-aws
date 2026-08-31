// run: AWS_REGION=us-east-1 npx ts-node src/envelopeRecipient.test.ts
import assert from 'assert';
import { envelopeRecipient, maildirName } from './processMessages';

// Real SES-stored GitHub notification: To: is the list, not the mailbox.
const sample = `Return-Path: <noreply@github.com>
Received: from out-20.smtp.github.com (out-20.smtp.github.com [192.30.252.203])
 by inbound-smtp.ap-southeast-2.amazonaws.com with SMTP id uq5i6j2je1oeihr9
 for john@johngrant.dev;
 Sat, 22 Nov 2025 18:10:02 +0000 (UTC)
Received: from github.com (hubbernetes-node.github.net [10.48.200.33])
        by smtp.github.com (Postfix) with ESMTPA id 888733C1171
        for <someone-else@example.com>; Sat, 22 Nov 2025 10:10:00 -0800 (PST)
To: Jellify-Music/App <App@noreply.github.com>
Subject: hi
`;

assert.strictEqual(envelopeRecipient(sample), 'john@johngrant.dev');
assert.strictEqual(envelopeRecipient('To: a@b.c\n\nbody'), undefined);
// Case variants collapse to one maildir.
assert.strictEqual(maildirName('John@JohnGrant.dev'), 'john@johngrant.dev');
assert.strictEqual(maildirName(' john@johngrant.dev '), 'john@johngrant.dev');
assert.strictEqual(maildirName('a+b/c@x.dev'), 'a_b_c@x.dev');

console.log('ok');
