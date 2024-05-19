FROM node:18-alpine

WORKDIR /app

COPY package*.json pnpm-lock.yaml ./

RUN npm install -g pnpm && pnpm install

COPY . .

RUN pnpm build

WORKDIR /app/dist

EXPOSE 80

CMD [ "node", "index.js" ]

ENV MAILBOX_PATH=/app/maildir