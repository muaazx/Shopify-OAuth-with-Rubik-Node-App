FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma generate && node dist/index.js"]
