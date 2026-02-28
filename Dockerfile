FROM oven/bun:alpine
WORKDIR /app
COPY package.json .
COPY bun.lock .
COPY tsconfig.json .
RUN bun install --production
COPY src ./src
ENV DO_NOT_TRACK=1
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "start"]