FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY server.mjs ./
USER node
ENV PORT=3000 REMINDER_DB=/data/reminders.sqlite
EXPOSE 3000
CMD ["node","server.mjs"]
