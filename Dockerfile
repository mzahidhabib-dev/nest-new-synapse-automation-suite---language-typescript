# 1. Use Node.js image to build the app
FROM node:20-alpine AS builder
WORKDIR /app

# 2. Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# 3. Copy the rest of the code and build the NestJS app
COPY . .
RUN npm run build

# 4. Create a fresh, small image for production
FROM node:20-alpine
WORKDIR /app

# 5. Copy only the built code and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# 6. Open the port NestJS uses (default is 3000)
EXPOSE 3000

# 7. Start the app
CMD ["node", "dist/main"]