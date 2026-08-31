// One-off repair for mail filed by the To: header instead of the SES envelope
// recipient. Dry-run by default; pass --apply to actually move.
//   npx ts-node scripts/relocateMisfiled.ts [--apply]
import { promises as fs } from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { envelopeRecipient, maildirName } from '../src/processMessages';

dotenv.config();

const mailBox = process.env.MAILBOX_PATH || '';
const apply = process.argv.includes('--apply');

async function main() {
    if (!mailBox) throw new Error('MAILBOX_PATH is missing');

    let moved = 0, skipped = 0, unknown = 0;

    for (const dir of await fs.readdir(mailBox, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;

        for (const sub of ['new', 'cur']) {
            const from = path.join(mailBox, dir.name, sub);
            let files: string[];
            try {
                files = await fs.readdir(from);
            } catch {
                continue;
            }

            for (const file of files) {
                const src = path.join(from, file);
                const recipient = envelopeRecipient(await fs.readFile(src, 'latin1'));

                if (!recipient) {
                    unknown++;
                    console.log(`?  no SES header: ${dir.name}/${sub}/${file}`);
                    continue;
                }
                const target = maildirName(recipient);
                if (target === dir.name) continue;

                const dest = path.join(mailBox, target, sub, file);
                try {
                    await fs.access(dest);
                    skipped++;
                    console.log(`!  target exists, left alone: ${dest}`);
                    continue;
                } catch { /* target free */ }

                console.log(`${apply ? '->' : 'DRY'} ${dir.name}/${sub}/${file}  =>  ${target}/${sub}/`);
                if (apply) {
                    for (const d of ['new', 'cur', 'tmp']) {
                        await fs.mkdir(path.join(mailBox, target, d), { recursive: true });
                    }
                    await fs.rename(src, dest);
                }
                moved++;
            }
        }
    }

    console.log(`\n${apply ? 'Moved' : 'Would move'}: ${moved} | collisions skipped: ${skipped} | no envelope header: ${unknown}`);
    if (!apply && moved) console.log('Re-run with --apply to move them.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
