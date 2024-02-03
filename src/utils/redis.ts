import { log } from "crawlee";
import { createClient } from "redis";

const URL = "redis://127.0.0.1:6379";

const redisClient: ReturnType<typeof createClient> = createClient({
  url: URL,
});

redisClient.on("error", function (error) {
  log.error(`Redis error: ${error}.`);
});

await redisClient.connect();

export { redisClient };

