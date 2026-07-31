FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Generate Prisma Client & Compile TS (Build Time - No DB connection needed)
RUN npx prisma generate
RUN npx tsc

EXPOSE 8080

# Run migrations and start API server at runtime
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
