# Use official Node.js runtime as a parent image
FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your application code
COPY . .

# Generate Prisma Client and Build TypeScript
RUN npx prisma generate
RUN npm run build

# Expose the port your app runs on (Railway injects PORT automatically, but 8080 is a good default)
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
